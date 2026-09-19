// MCP server on the official MCP TypeScript SDK v2 (@modelcontextprotocol/server).
// 21 tools, 11 resources, and the devcoach_instructions prompt. Tools follow the build-mcp-server
// review: title + hint annotations, tight Zod schemas with .describe(), outputSchema/structuredContent
// for model returns, isError on failure. log_lesson is a pure save (never elicits);
// feedback arrives next turn via submit_feedback.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { scanClaudeHistory, scanRecentProjectWindow } from "../core/claude-history";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { detectStack, mergeStacks } from "../core/detect";
import { detectGitContext, detectGitUserName } from "../core/git";
import {
  confidenceInputSchema,
  FeedbackSchema,
  type Lesson,
  LevelSchema,
  NudgeScopeSchema,
  parseLesson,
  RepositoryPlatformSchema,
  UiHomeSchema,
  UiThemeSchema,
} from "../core/models";
import {
  buildSharePayload,
  encodeShareCode,
  renderShareLink,
  renderShareMarkdownFile,
  renderShareText,
  resolveSharedBy,
  ShareInputError,
  sharedLessonFilename,
} from "../core/share";
import { fetchSharedInput, isHttpUrl } from "../core/share-fetch";
import { readSkill, readSkillReferences } from "../skill";
import { VERSION } from "../version";

// ── Result helpers ───────────────────────────────────────────────────────────

const txt = (s: string) => ({ type: "text" as const, text: s });
const jsonText = (v: unknown) => ({ content: [txt(JSON.stringify(v))] });
const errResult = (msg: string) => ({ isError: true, content: [txt(msg)] });
const structured = (v: Record<string, unknown>) => ({
  content: [txt(JSON.stringify(v))],
  structuredContent: v,
});

// ── Output schemas (z.object, no transforms — they describe the JSON Claude sees) ─

const lessonOutput = z.object({
  id: z.string(),
  timestamp: z.string(),
  topic_id: z.string(),
  categories: z.array(z.string()),
  title: z.string(),
  level: LevelSchema,
  summary: z.string(),
  body: z.string().nullable(),
  task_context: z.string().nullable(),
  project: z.string().nullable(),
  repository: z.string().nullable(),
  branch: z.string().nullable(),
  commit_hash: z.string().nullable(),
  folder: z.string().nullable(),
  repository_platform: RepositoryPlatformSchema.nullable(),
  starred: z.boolean(),
  feedback: FeedbackSchema.nullable(),
  imported: z.boolean(),
  shared_by: z.string().nullable(),
});

// log_lesson's output adds a model-facing self-check. It must live in
// structuredContent: when a tool returns structured output, Claude Code surfaces
// THAT to the model and drops the plain-text content blocks — an instruction
// placed there is never seen (verified via session transcripts).
const logLessonOutput = lessonOutput.extend({
  reply_check: z.string(),
});

const CARD_REPLY_CHECK =
  "Saved — but saving does NOT display anything. The user sees ONLY plain text you " +
  "write in your reply; the title/body inside this tool call's ARGUMENTS are invisible " +
  "to them, and having composed them does not count as having shown the card. Did you " +
  "already write the full card (both ### band headings + title line + body + tip) as " +
  "plain reply text, outside any tool call? If yes: output nothing. If no: write the " +
  "card now, as the final text of your reply. Never write it twice.";

const profileOutput = z.object({
  knowledge: z.array(z.object({ topic: z.string(), confidence: z.number().int() })),
  groups: z.array(z.object({ name: z.string(), topics: z.array(z.string()) })),
});

const settingsOutput = z.object({
  max_per_day: z.number().int(),
  min_gap_minutes: z.number().int(),
  ui_theme: UiThemeSchema,
  ui_home: UiHomeSchema,
  nudge_every: z.number().int(),
  nudge_scope: NudgeScopeSchema,
  share_name: z.string().nullable(),
});

const shareOutput = z.object({
  transport: z.enum(["text", "link", "file"]),
  code: z.string(),
  text: z.string().nullable(),
  link: z.string().nullable(),
  markdown: z.string().nullable(),
  filename: z.string().nullable(),
  shared_by: z.string().nullable(),
  include_context: z.boolean(),
  reply_check: z.string(),
});

const importOutput = z.object({
  kind: z.enum(["shared", "lessons"]),
  inserted: z.number().int(),
  duplicated: z.number().int(),
  invalid: z.number().int(),
  lesson: lessonOutput.nullable(),
  topic_tracked: z.boolean().nullable(),
  reply_check: z.string(),
});

const SHARE_REPLY_CHECK: Record<"text" | "link" | "file", string> = {
  text:
    "Reply with `text` verbatim as the final message: the card as markdown, then the last line " +
    "(devcoach:lesson:1:…) inside a fenced code block, character for character — never paraphrase, " +
    "wrap, truncate or split it.",
  link: "Reply with `link` on its own line, unchanged.",
  file:
    "Write `markdown` to `filename` (in the workspace unless the user named a path) with your " +
    "file tool, then confirm the path in one line; do not print the markdown.",
};
const IMPORT_REPLY_CHECK =
  "Confirm in one line: the title, who shared it, and that it joined the coaching log (feedback " +
  "works as usual; it does not count against the daily limit). If topic_tracked is false, offer " +
  "to track the topic with add_topic — only on confirmation.";

const deepScanOutput = z.object({
  window_months: z.number().int(),
  cutoff: z.string(),
  candidate_count: z.number().int(),
  over_soft_limit: z.boolean(),
  candidates: z.array(
    z.object({
      name: z.string(),
      path: z.string(),
      last_activity: z.string().nullable(),
      prompt_count: z.number().int(),
    }),
  ),
});

// ── JSON resource helper ─────────────────────────────────────────────────────

function jsonResource(uri: URL, payload: unknown) {
  return {
    contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(payload) }],
  };
}

// ── State payloads (shared by the get_* tools and the devcoach:// resources) ──
// The skill reads state through the tools: every client resolves tool names on its own,
// while a resource read needs the client-specific server name (plugin:devcoach:devcoach
// under the Claude Code plugin, devcoach as a plain MCP entry) — a model guessing it
// wrong fails the read. Builders never throw; failures come back as { error }.

type Payload = Record<string, unknown>;

function profilePayload(): Payload {
  try {
    return { ...db.withConnection((c) => coach.getProfile(c)) };
  } catch (err) {
    return { error: String(err) };
  }
}

function briefingPayload(): Payload {
  try {
    let notebook = "";
    try {
      if (existsSync(db.LEARNING_STATE_PATH))
        notebook = readFileSync(db.LEARNING_STATE_PATH, "utf8");
    } catch {
      // notebook unreadable — deliver the rest of the briefing without it
    }
    const data = db.withConnection((c) => {
      const knowledgeReady = db.isOnboardingComplete(c).knowledge_ready;
      const notebookReady = notebook.length > 0;
      const rate = coach.checkRateLimit(c);
      const rateLimit: Record<string, unknown> = {
        allowed: rate.allowed,
        total_lessons: db.countFilteredLessons(c),
      };
      if (rate.reason != null) rateLimit.reason = rate.reason;
      return {
        onboarding: {
          knowledge_ready: knowledgeReady,
          notebook_ready: notebookReady,
          needs_onboarding: !(knowledgeReady && notebookReady),
        },
        rate_limit: rateLimit,
        taught_topics: coach.listTaughtTopics(c),
        profile: coach.getProfile(c),
      };
    });
    return { ...data, notebook, notebook_path: db.LEARNING_STATE_PATH };
  } catch (err) {
    return { error: String(err) };
  }
}

function onboardingPayload(): Payload {
  try {
    const status = db.withConnection((c) => db.isOnboardingComplete(c));
    const knowledgeReady = status.knowledge_ready;
    const notebookReady =
      existsSync(db.LEARNING_STATE_PATH) && statSync(db.LEARNING_STATE_PATH).size > 0;
    const git = detectGitContext();
    const scan = scanClaudeHistory();
    const detected = mergeStacks(detectStack(git.folder ?? process.cwd()), scan.detected_stack);
    return {
      knowledge_ready: knowledgeReady,
      notebook_ready: notebookReady,
      needs_onboarding: !(knowledgeReady && notebookReady),
      detected_stack: detected,
      detected_projects: scan.projects,
      scanned_projects: scan.scanned_projects,
      default_topics: db.DEFAULT_PROFILE,
      context_ready: git.branch !== null,
      notebook_path: db.LEARNING_STATE_PATH,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

/** Tool result for a state payload: { error } becomes an isError result, anything else is structured. */
const stateResult = (tool: string, payload: Payload) =>
  typeof payload.error === "string"
    ? errResult(`${tool} failed: ${payload.error}`)
    : structured(payload);

// ── Server ───────────────────────────────────────────────────────────────────

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "devcoach", version: VERSION },
    {
      instructions:
        "Progressive technical coaching server. " +
        "Use the devcoach_instructions prompt for full coaching behaviour guidelines. " +
        "Read coaching state with the get_briefing / get_onboarding / get_profile tools; the " +
        "devcoach:// resources expose the same data for clients that browse resources. " +
        "share_lesson hands a lesson to another person (text, link or file); import_lesson stores " +
        "one they were given.",
    },
  );

  // ── Tools ──────────────────────────────────────────────────────────────────

  server.registerTool(
    "log_lesson",
    {
      title: "Log Lesson",
      description:
        "Save a delivered lesson to the coaching log. Git metadata (project, repository, branch, " +
        "commit_hash, folder, repository_platform) is auto-detected from the workspace when omitted. " +
        "timestamp is always stamped server-side with the current time — there is no argument for it. " +
        "Returns the saved Lesson with all resolved fields.",
      inputSchema: z.object({
        id: z.string().describe("Unique lesson id (uuid or random string)"),
        topic_id: z.string().describe("Primary topic id, e.g. 'python'"),
        categories: z.array(z.string()).describe("Category tags, e.g. ['python','performance']"),
        title: z.string().describe("Short lesson title"),
        level: LevelSchema.describe("Difficulty level: junior | mid | senior"),
        summary: z.string().describe("1-3 sentence summary shown in the lesson card"),
        body: z
          .string()
          .min(1)
          .describe(
            "Clean lesson markdown: the prose + 💡 Senior tip only — NO card bands, NO '>' " +
              "blockquote, and do not repeat title/category/level (those are their own fields). " +
              "Required, non-empty.",
          ),
        task_context: z.string().nullish().describe("What the user was doing when taught"),
        project: z.string().nullish().describe("Project name (auto-detected from git if omitted)"),
        repository: z.string().nullish().describe("org/repo or path (auto-detected if omitted)"),
        branch: z.string().nullish().describe("git branch (auto-detected if omitted)"),
        commit_hash: z.string().nullish().describe("git commit hash (auto-detected if omitted)"),
        folder: z.string().nullish().describe("workspace folder (auto-detected if omitted)"),
        repository_platform: RepositoryPlatformSchema.nullish().describe(
          "github | gitlab | bitbucket | local (auto-detected if omitted)",
        ),
      }),
      outputSchema: logLessonOutput,
      annotations: {
        title: "Log Lesson",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const git = detectGitContext();
        let usage: Record<string, string | null> = {};
        try {
          usage = db.withConnection((c) => db.getUsageDefaults(c));
        } catch {
          usage = {};
        }
        const lesson: Lesson = parseLesson({
          id: args.id,
          timestamp: new Date(),
          topic_id: args.topic_id,
          categories: args.categories,
          title: args.title,
          level: args.level,
          summary: args.summary,
          body: args.body,
          task_context: args.task_context ?? null,
          project: args.project ?? git.project ?? usage.project ?? null,
          repository: args.repository ?? git.repository ?? usage.repository ?? null,
          branch: args.branch ?? git.branch ?? usage.branch ?? null,
          commit_hash: args.commit_hash ?? git.commit_hash ?? null,
          folder: args.folder ?? git.folder ?? null,
          repository_platform:
            args.repository_platform ??
            git.repository_platform ??
            usage.repository_platform ??
            null,
        });
        db.withConnection((c) => {
          db.insertLesson(c, lesson);
          // A lesson was delivered → reset the interaction-pacing counters.
          db.resetNudge(c);
        });

        // Deliberately NO elicitation here: the card-last flow means log_lesson runs
        // BEFORE the card is visible, so an inline "Did that land?" dialog asked about
        // a lesson the user had not seen yet (observed live in Claude Code) — and the
        // null fallback then printed the text prompt too, asking twice. Feedback is
        // collected under the card as a text line and recorded next turn via
        // submit_feedback.
        // The card is chat output the server cannot verify, so the result carries a
        // conditional self-check instead of hook machinery: a model that skipped the
        // card prints it now; one that printed it stops. Never echo the rendered card
        // here — after the tool-approval pause the model re-printed the echo,
        // doubling the card.
        return {
          content: [txt(`Lesson saved. ${CARD_REPLY_CHECK}`), txt(JSON.stringify(lesson))],
          structuredContent: { ...lesson, reply_check: CARD_REPLY_CHECK },
        };
      } catch (err) {
        return errResult(`log_lesson failed: ${err}`);
      }
    },
  );

  server.registerTool(
    "update_knowledge",
    {
      title: "Update Knowledge",
      description:
        "Adjust the confidence score for a topic by delta (e.g. +1 or -1). Returns the new " +
        "confidence (0-10). Creates the topic at confidence 5 if it does not exist.",
      inputSchema: z.object({
        topic: z.string().describe("Topic id, e.g. 'python'"),
        delta: z.number().int().describe("Signed change to apply, e.g. +1 or -1"),
      }),
      annotations: {
        title: "Update Knowledge",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const v = db.withConnection((c) => coach.applyKnowledgeDelta(c, args.topic, args.delta));
        return { content: [txt(String(v))] };
      } catch (err) {
        return errResult(`update_knowledge failed for '${args.topic}': ${err}`);
      }
    },
  );

  server.registerTool(
    "get_lessons",
    {
      title: "Get Lessons",
      description:
        "Query the coaching lesson history. All filters combine. period defaults to all; " +
        "date_from/date_to override period; limit caps results newest-first (0 = all).",
      inputSchema: z.object({
        period: z.enum(["today", "week", "month", "year", "all"]).nullish().describe("Time window"),
        category: z.string().nullish().describe("Filter by a category tag, e.g. 'python'"),
        level: z.enum(["junior", "mid", "senior"]).nullish().describe("Filter by difficulty level"),
        project: z.string().nullish().describe("Fuzzy match on git project"),
        repository: z.string().nullish().describe("Fuzzy match on git repository"),
        branch: z.string().nullish().describe("Fuzzy match on git branch"),
        commit: z.string().nullish().describe("Fuzzy match on commit hash"),
        starred: z.boolean().nullish().describe("True to return only starred lessons"),
        imported: z
          .boolean()
          .nullish()
          .describe("True = only lessons shared with you, false = only your own"),
        shared_by: z
          .string()
          .nullish()
          .describe("Only lessons shared by this person (exact sender name; implies imported)"),
        feedback: z
          .enum(["know", "understood", "dont_know", "none"])
          .nullish()
          .describe(
            "Filter by feedback: know (already knew), understood (new, now clear), " +
              "dont_know (couldn't follow — a course seed), none (no response)",
          ),
        search: z
          .string()
          .nullish()
          .describe("Full-text search over title, topic_id, summary, body and the sender's name"),
        date_from: z.string().nullish().describe("ISO date/datetime lower bound"),
        date_to: z
          .string()
          .nullish()
          .describe("ISO date/datetime upper bound (date-only = end-of-day)"),
        limit: z.number().int().default(10).describe("Max lessons, newest first. Pass 0 for all."),
      }),
      annotations: {
        title: "Get Lessons",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => {
      try {
        const lessons = db.withConnection((c) =>
          db.getLessons(c, {
            period: args.period,
            category: args.category,
            level: args.level,
            project: args.project,
            repository: args.repository,
            branch: args.branch,
            commit: args.commit,
            starred: args.starred,
            imported: args.imported,
            shared_by: args.shared_by,
            feedback: args.feedback,
            search: args.search,
            date_from: args.date_from,
            date_to: args.date_to,
            page: args.limit > 0 ? 1 : null,
            per_page: args.limit,
          }),
        );
        return jsonText(lessons);
      } catch {
        return jsonText([]);
      }
    },
  );

  server.registerTool(
    "star_lesson",
    {
      title: "Star Lesson",
      description:
        "Set the starred (favourite) flag on a lesson. Returns true if found and updated. Idempotent.",
      inputSchema: z.object({
        lesson_id: z.string().describe("Lesson id"),
        starred: z.boolean().describe("true to favourite, false to unmark"),
      }),
      annotations: {
        title: "Star Lesson",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const found = db.withConnection((c) => db.setStar(c, args.lesson_id, args.starred));
        return { content: [txt(String(found))] };
      } catch (err) {
        return errResult(`star_lesson failed for '${args.lesson_id}': ${err}`);
      }
    },
  );

  server.registerTool(
    "delete_lesson",
    {
      title: "Delete Lesson",
      description: "Permanently delete a lesson by id. Returns true if found and deleted.",
      inputSchema: z.object({ lesson_id: z.string().describe("Lesson id to delete") }),
      annotations: {
        title: "Delete Lesson",
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const found = db.withConnection((c) => db.deleteLesson(c, args.lesson_id));
        return { content: [txt(String(found))] };
      } catch (err) {
        return errResult(`delete_lesson failed for '${args.lesson_id}': ${err}`);
      }
    },
  );

  server.registerTool(
    "submit_feedback",
    {
      title: "Submit Feedback",
      description:
        "Record the user's answer under a lesson card. know = already knew it (confidence +1); " +
        "understood = new and now clear (no confidence change); dont_know = couldn't follow this " +
        "session (no confidence change; the lesson becomes a course seed); clear = remove the " +
        "answer. Idempotent — repeating the stored answer changes nothing.",
      inputSchema: z.object({
        lesson_id: z.string().describe("Lesson id"),
        feedback: z
          .enum(["know", "understood", "dont_know", "clear"])
          .describe("know | understood | dont_know | clear"),
      }),
      annotations: {
        title: "Submit Feedback",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const feedbackValue = args.feedback === "clear" ? null : args.feedback;
        const result = db.withConnection((c) =>
          coach.recordFeedback(c, args.lesson_id, feedbackValue),
        );
        return { content: [txt(String(result !== null))] };
      } catch (err) {
        return errResult(`submit_feedback failed for '${args.lesson_id}': ${err}`);
      }
    },
  );

  server.registerTool(
    "skip_lesson",
    {
      title: "Skip Lesson",
      description:
        "Decline a lesson cue: call this when the coaching hook asked for a lesson but the " +
        "completed work does not warrant one (pure questions, chat, nothing technical). " +
        "Re-arms the pacing counter so the cue is not repeated immediately. " +
        "Never call it after delivering a lesson — log_lesson already resolves the cue.",
      inputSchema: z.object({
        reason: z
          .string()
          .min(1)
          .describe("One line: why no lesson was warranted (shown in `devcoach doctor`)"),
      }),
      annotations: {
        title: "Skip Lesson",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        db.withConnection((c) => db.clearCuePending(c, args.reason));
        return { content: [txt("Cue skipped — pacing re-armed. Output nothing to the user.")] };
      } catch (err) {
        return errResult(`skip_lesson failed: ${err}`);
      }
    },
  );

  server.registerTool(
    "add_topic",
    {
      title: "Add Topic",
      description:
        "Add a topic to the knowledge map, or update its confidence if it exists. Optionally assign " +
        "to a group (auto-created). Prefer a single-word topic id. Idempotent.",
      inputSchema: z.object({
        topic: z.string().describe("Topic id — prefer a single word, max 3 words"),
        confidence: confidenceInputSchema
          .default(5)
          .describe("Initial confidence 0-10 (default 5)"),
        group: z.string().nullish().describe("Optional group name; 'Other' if omitted"),
      }),
      annotations: {
        title: "Add Topic",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        db.withConnection((c) => {
          db.upsertKnowledge(c, args.topic, args.confidence);
          if (args.group && args.group !== "Other")
            db.assignTopicToGroup(c, args.topic, args.group);
        });
        return { content: [txt("true")] };
      } catch (err) {
        return errResult(`add_topic failed for '${args.topic}': ${err}`);
      }
    },
  );

  server.registerTool(
    "remove_topic",
    {
      title: "Remove Topic",
      description: "Remove a topic from the knowledge map entirely. Returns true if it existed.",
      inputSchema: z.object({ topic: z.string().describe("Topic id to remove") }),
      annotations: {
        title: "Remove Topic",
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const found = db.withConnection((c) => db.deleteKnowledge(c, args.topic));
        return { content: [txt(String(found))] };
      } catch (err) {
        return errResult(`remove_topic failed for '${args.topic}': ${err}`);
      }
    },
  );

  server.registerTool(
    "add_group",
    {
      title: "Add Group",
      description:
        "Create a new (initially empty) knowledge group. Idempotent — returns true either way.",
      inputSchema: z.object({ name: z.string().describe("Group name, e.g. 'Machine Learning'") }),
      annotations: {
        title: "Add Group",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        db.withConnection((c) => db.addGroup(c, args.name.trim()));
        return { content: [txt("true")] };
      } catch (err) {
        return errResult(`add_group failed for '${args.name}': ${err}`);
      }
    },
  );

  server.registerTool(
    "remove_group",
    {
      title: "Remove Group",
      description:
        "Delete a knowledge group. Its topics move to Other. Returns true if it existed.",
      inputSchema: z.object({ name: z.string().describe("Group name to delete") }),
      annotations: {
        title: "Remove Group",
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const found = db.withConnection((c) => db.deleteGroup(c, args.name));
        return { content: [txt(String(found))] };
      } catch (err) {
        return errResult(`remove_group failed for '${args.name}': ${err}`);
      }
    },
  );

  server.registerTool(
    "update_settings",
    {
      title: "Update Settings",
      description:
        "Update a coaching setting. max_per_day: integer 1-20. min_gap_minutes: integer 0-1440 " +
        "(0 = no cooldown). nudge_every: integer 0-1000 interactions between lesson cues " +
        "(0 = cue every turn). nudge_scope: 'session' | 'global'. share_name: the sender name " +
        "proposed when sharing a lesson (max 80 chars, empty clears). Returns the full updated Settings.",
      inputSchema: z.object({
        key: z
          .enum(["max_per_day", "min_gap_minutes", "nudge_every", "nudge_scope", "share_name"])
          .describe("Setting key"),
        value: z
          .string()
          .describe(
            "New value (integer string; 'session'|'global' for nudge_scope; free text for share_name)",
          ),
      }),
      outputSchema: settingsOutput,
      annotations: {
        title: "Update Settings",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => {
      const save = (v: string) =>
        structured(
          db.withConnection((c) => {
            db.setSetting(c, args.key, v);
            return db.getSettings(c);
          }),
        );
      if (args.key === "share_name") {
        if (args.value.trim().length > db.SHARE_NAME_MAX) {
          return errResult(`share_name must be at most ${db.SHARE_NAME_MAX} characters`);
        }
        return save(db.normalizeShareName(args.value));
      }
      if (args.key === "nudge_scope") {
        if (args.value !== "session" && args.value !== "global") {
          return errResult("nudge_scope must be 'session' or 'global'");
        }
        return save(args.value);
      }
      const intVal = Number.parseInt(args.value, 10);
      if (Number.isNaN(intVal)) return errResult(`Value must be an integer, got '${args.value}'`);
      if (args.key === "max_per_day" && !(intVal >= 1 && intVal <= 20)) {
        return errResult("max_per_day must be between 1 and 20");
      }
      if (args.key === "min_gap_minutes" && !(intVal >= 0 && intVal <= 1440)) {
        return errResult("min_gap_minutes must be between 0 and 1440");
      }
      if (args.key === "nudge_every" && !(intVal >= 0 && intVal <= 1000)) {
        return errResult("nudge_every must be between 0 and 1000");
      }
      return save(String(intVal));
    },
  );

  server.registerTool(
    "open_ui",
    {
      title: "Open UI",
      description: "Launch the devcoach web dashboard in the background. port must be 1024-65535.",
      inputSchema: z.object({
        port: z.number().int().default(7860).describe("Port (default 7860)"),
      }),
      annotations: {
        title: "Open UI",
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const port = args.port;
      if (!(port >= 1024 && port <= 65535)) {
        return { content: [txt(`error: port ${port} is out of valid range (1024-65535)`)] };
      }
      // A detached child on a busy port would just die unseen (stdio is ignored) — say so instead.
      const { pingUi } = await import("../web/app");
      if (await pingUi(port)) {
        return { content: [txt(`devcoach UI is already running at http://localhost:${port}`)] };
      }
      const child = spawn(process.execPath, [process.argv[1] ?? "", "ui", "--port", String(port)], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return { content: [txt(`devcoach UI starting at http://localhost:${port}`)] };
    },
  );

  server.registerTool(
    "stop_ui",
    {
      title: "Stop UI",
      description:
        "Stop the devcoach web dashboard listening on port (whoever started it — open_ui or a " +
        "terminal). Graceful: in-flight requests finish first. Reports stopped=false when nothing " +
        "is running there. port must be 1024-65535.",
      inputSchema: z.object({
        port: z.number().int().default(7860).describe("Port (default 7860)"),
      }),
      annotations: {
        title: "Stop UI",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      const port = args.port;
      if (!(port >= 1024 && port <= 65535)) {
        return { content: [txt(`error: port ${port} is out of valid range (1024-65535)`)] };
      }
      const { stopUi } = await import("../web/app");
      const stopped = await stopUi(port);
      return {
        content: [
          txt(
            stopped
              ? `devcoach UI on port ${port} stopped`
              : `No devcoach UI is running on port ${port}`,
          ),
        ],
        structuredContent: { stopped, port },
      };
    },
  );

  server.registerTool(
    "complete_onboarding",
    {
      title: "Complete Onboarding",
      description:
        "Save the user's initial knowledge profile and mark onboarding complete. Wipes any " +
        "default-seeded profile. topics: {topic_id: confidence_0_to_10}. groups: {group_name: [topic_id,...]} " +
        "(topics not in any group go to 'Other'). Ensures learning-state.md exists and is non-empty " +
        "(a placeholder if needed) — there is no notebook argument here. Write the real personalized " +
        "notebook yourself right after, directly to the path in devcoach://onboarding's notebook_path " +
        "field. Returns the updated Profile.",
      inputSchema: z.object({
        topics: z.record(z.string(), confidenceInputSchema).describe("{topic_id: confidence 0-10}"),
        groups: z
          .record(z.string(), z.array(z.string()))
          .optional()
          .describe("{group_name: [topic_id, ...]}"),
      }),
      outputSchema: profileOutput,
      annotations: {
        title: "Complete Onboarding",
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        const profile = db.withConnection((c) => {
          c.exec(
            "DELETE FROM knowledge; DELETE FROM knowledge_groups; DELETE FROM knowledge_group_names;",
          );
          for (const [topic, confidence] of Object.entries(args.topics)) {
            db.upsertKnowledge(c, topic, Math.max(0, Math.min(10, confidence)));
          }
          if (args.groups) {
            for (const [groupName, topics] of Object.entries(args.groups)) {
              for (const t of topics) {
                if (t in args.topics) db.assignTopicToGroup(c, t, groupName);
              }
            }
          }
          return coach.getProfile(c);
        });
        // Ensure the notebook file exists and is non-empty the INSTANT the profile is
        // saved — same call, same guarantee as before (never a window where
        // knowledge_ready is true but no notebook file exists at all). The skill
        // overwrites this placeholder with the real personalized notebook right after,
        // writing directly to LEARNING_STATE_PATH with its own file tools.
        mkdirSync(dirname(db.LEARNING_STATE_PATH), { recursive: true });
        if (!existsSync(db.LEARNING_STATE_PATH) || statSync(db.LEARNING_STATE_PATH).size === 0) {
          writeFileSync(db.LEARNING_STATE_PATH, "# devcoach — Coaching Notebook\n");
        }
        return structured(profile);
      } catch (err) {
        return errResult(`complete_onboarding failed: ${err}`);
      }
    },
  );

  server.registerTool(
    "preview_deep_scan",
    {
      title: "Preview Deep Scan",
      description:
        "Cheap, metadata-only pre-check for 'Automatic (Deep)' onboarding. Counts and lists Claude " +
        "Code projects whose last recorded activity falls within a rolling window (months back from " +
        "now) — a real date window, not a fixed top-N. Reads no prompt/conversation text, only " +
        "project paths and activity timestamps. Call this BEFORE spawning the deep-read subagent: " +
        "over_soft_limit true means there are enough candidates that the user should be asked " +
        "whether to narrow the window, proceed anyway, or pick specific projects.",
      inputSchema: z.object({
        months: z
          .number()
          .int()
          .min(1)
          .max(24)
          .default(3)
          .describe("Rolling window size in months, counting back from now"),
      }),
      outputSchema: deepScanOutput,
      annotations: {
        title: "Preview Deep Scan",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => {
      try {
        return structured({ ...scanRecentProjectWindow(args.months) });
      } catch (err) {
        return errResult(`preview_deep_scan failed: ${err}`);
      }
    },
  );

  // ── State reads — tools, not resources (tool names resolve in every client) ──

  const readOnly = (title: string) => ({
    title,
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  });

  server.registerTool(
    "get_briefing",
    {
      title: "Lesson Briefing",
      description:
        "Everything needed before delivering a lesson, in ONE call: onboarding status, rate limit, " +
        "taught topics, knowledge profile, the coaching notebook text and its notebook_path. Same " +
        "data as the devcoach://briefing resource — call the tool, it needs no server name.",
      inputSchema: z.object({}),
      annotations: readOnly("Lesson Briefing"),
    },
    () => stateResult("get_briefing", briefingPayload()),
  );

  server.registerTool(
    "get_onboarding",
    {
      title: "Onboarding Status & Detected Stack",
      description:
        "Onboarding status (knowledge_ready, notebook_ready, needs_onboarding), the stack detected " +
        "across the full Claude Code history with per-project provenance, the default topics and " +
        "the notebook_path. Same data as the devcoach://onboarding resource.",
      inputSchema: z.object({}),
      annotations: readOnly("Onboarding Status & Detected Stack"),
    },
    () => stateResult("get_onboarding", onboardingPayload()),
  );

  server.registerTool(
    "get_profile",
    {
      title: "Knowledge Profile",
      description:
        "Current knowledge map: topics with confidence 0–10 and their groups. Same data as the " +
        "devcoach://profile resource.",
      inputSchema: z.object({}),
      outputSchema: profileOutput,
      annotations: readOnly("Knowledge Profile"),
    },
    () => stateResult("get_profile", profilePayload()),
  );

  // ── Lesson sharing ───────────────────────────────────────────────────────

  server.registerTool(
    "share_lesson",
    {
      title: "Share Lesson",
      description:
        "Hand a lesson to another person. transport 'text' (default) returns the card plus a one-line " +
        "code to paste anywhere; 'link' a server-less URL that previews the lesson and imports it " +
        "into their dashboard; 'file' the contents of a .devcoach.md file. Only title, summary, " +
        "body, topic, categories and level travel unless include_context is true; local paths " +
        "never do. Pick the lesson with get_lessons first.",
      inputSchema: z.object({
        lesson_id: z.string().describe("Lesson id (from get_lessons)"),
        transport: z
          .enum(["text", "link", "file"])
          .default("text")
          .describe("text = card + code to paste; link = share URL; file = .devcoach.md contents"),
        include_context: z
          .boolean()
          .default(false)
          .describe(
            "Include project/branch/commit/task context (off by default — privacy). Local paths are never included.",
          ),
        shared_by: z
          .string()
          .nullish()
          .describe(
            "Sender name. Omit → the share_name setting, then git user.name. Empty string → anonymous.",
          ),
      }),
      outputSchema: shareOutput,
      annotations: readOnly("Share Lesson"),
    },
    (args) => {
      try {
        const found = db.withConnection((c) => {
          const lesson = db.getLessonById(c, args.lesson_id);
          if (!lesson) return null;
          const sharedBy = resolveSharedBy({
            explicit: args.shared_by ?? null,
            setting: db.getSettings(c).share_name,
            gitUserName: detectGitUserName(),
          });
          return buildSharePayload(lesson, { includeContext: args.include_context, sharedBy });
        });
        if (!found) {
          return errResult(
            `share_lesson: lesson '${args.lesson_id}' not found — call get_lessons to pick one`,
          );
        }
        return structured({
          transport: args.transport,
          code: encodeShareCode(found),
          text: args.transport === "text" ? renderShareText(found) : null,
          link: args.transport === "link" ? renderShareLink(found) : null,
          markdown: args.transport === "file" ? renderShareMarkdownFile(found) : null,
          filename: args.transport === "file" ? sharedLessonFilename(found) : null,
          shared_by: found.shared_by,
          include_context: args.include_context,
          reply_check: SHARE_REPLY_CHECK[args.transport],
        });
      } catch (err) {
        return errResult(`share_lesson failed: ${err}`);
      }
    },
  );

  server.registerTool(
    "import_lesson",
    {
      title: "Import Lesson",
      description:
        "Store a lesson someone shared. Pass whatever the user handed you, verbatim: the " +
        "devcoach:lesson:1:… code, the whole copied card, the share link, a URL to the lesson " +
        "text, the contents of a .devcoach.md file, or a lessons JSON export. The lesson joins the " +
        "coaching log as their own (feedback works as usual) but never counts against the daily " +
        "limit; re-importing the same share is reported as a duplicate, not an error.",
      inputSchema: z.object({
        payload: z
          .string()
          .min(1)
          .describe("The code, link, URL, card text, file text or JSON — verbatim"),
      }),
      outputSchema: importOutput,
      annotations: {
        title: "Import Lesson",
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const raw =
          isHttpUrl(args.payload) && !args.payload.includes("#devcoach:lesson:")
            ? await fetchSharedInput(args.payload)
            : args.payload;
        const result = db.withConnection((c) => coach.importSharedInput(c, raw));
        return structured({ ...result, reply_check: IMPORT_REPLY_CHECK });
      } catch (err) {
        if (err instanceof ShareInputError) return errResult(`import_lesson: ${err.message}`);
        return errResult(`import_lesson failed: ${err}`);
      }
    },
  );

  // ── Resources ────────────────────────────────────────────────────────────

  const meta = (title: string, description: string) => ({
    title,
    description,
    mimeType: "application/json",
  });

  server.registerResource(
    "profile",
    "devcoach://profile",
    meta("Knowledge Profile", "Current knowledge map — topics, confidence scores, and groups."),
    (uri) => jsonResource(uri, profilePayload()),
  );

  server.registerResource(
    "notebook",
    "devcoach://notebook",
    {
      title: "Coaching Notebook",
      description:
        "The coaching notebook (learning-state.md): observations, recurring patterns, " +
        "recommended focus, and open hypotheses about the user. Read it to decide what to teach.",
      mimeType: "text/markdown",
    },
    (uri) => {
      let text = "";
      try {
        if (existsSync(db.LEARNING_STATE_PATH)) text = readFileSync(db.LEARNING_STATE_PATH, "utf8");
      } catch {
        // notebook not readable yet — return empty
      }
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
    },
  );

  server.registerResource(
    "settings",
    "devcoach://settings",
    meta("Settings", "Current coaching settings (rate limits, UI theme)."),
    (uri) => {
      try {
        return jsonResource(
          uri,
          db.withConnection((c) => db.getSettings(c)),
        );
      } catch (err) {
        return jsonResource(uri, { error: String(err) });
      }
    },
  );

  server.registerResource(
    "recent-lessons",
    "devcoach://lessons/recent",
    meta("Recent Lessons", "Last 10 lessons from the current week."),
    (uri) => {
      try {
        return jsonResource(
          uri,
          db.withConnection((c) => db.getLessons(c, { period: "week", page: 1, per_page: 10 })),
        );
      } catch (err) {
        return jsonResource(uri, [{ error: String(err) }]);
      }
    },
  );

  server.registerResource(
    "stats",
    "devcoach://stats",
    meta("Stats", "Aggregate coaching statistics: counts and weakest/strongest topics."),
    (uri) => {
      try {
        return jsonResource(
          uri,
          db.withConnection((c) => coach.getStats(c)),
        );
      } catch (err) {
        return jsonResource(uri, { error: String(err) });
      }
    },
  );

  server.registerResource(
    "taught-topics",
    "devcoach://taught-topics",
    meta(
      "Taught Topics",
      "All topic_ids already taught — read before selecting a new lesson topic.",
    ),
    (uri) => {
      try {
        return jsonResource(
          uri,
          db.withConnection((c) => coach.listTaughtTopics(c)),
        );
      } catch {
        return jsonResource(uri, []);
      }
    },
  );

  server.registerResource(
    "rate-limit",
    "devcoach://rate-limit",
    meta("Rate Limit", "Current rate-limit status and running lesson total."),
    (uri) => {
      try {
        const { r, total } = db.withConnection((c) => ({
          r: coach.checkRateLimit(c),
          total: db.countFilteredLessons(c),
        }));
        const payload: Record<string, unknown> = { allowed: r.allowed, total_lessons: total };
        if (r.reason != null) payload.reason = r.reason;
        return jsonResource(uri, payload);
      } catch (err) {
        return jsonResource(uri, {
          allowed: false,
          reason: `Rate limit check unavailable: ${err}`,
        });
      }
    },
  );

  server.registerResource(
    "briefing",
    "devcoach://briefing",
    meta(
      "Lesson Briefing",
      "Everything needed before delivering a lesson in ONE read: onboarding status, " +
        "rate limit, taught topics, knowledge profile, and the coaching notebook.",
    ),
    (uri) => jsonResource(uri, briefingPayload()),
  );

  server.registerResource(
    "context",
    "devcoach://context",
    meta("Workspace Context", "Auto-detected git context and most-used lesson metadata defaults."),
    (uri) => {
      try {
        const git = detectGitContext();
        const usage = db.withConnection((c) => db.getUsageDefaults(c));
        return jsonResource(uri, { git, usage_defaults: usage });
      } catch (err) {
        return jsonResource(uri, { error: String(err) });
      }
    },
  );

  server.registerResource(
    "onboarding",
    "devcoach://onboarding",
    meta(
      "Onboarding",
      "Onboarding status, the stack detected across the full Claude Code history " +
        "(with per-project provenance), and project topic defaults.",
    ),
    (uri) => jsonResource(uri, onboardingPayload()),
  );

  server.registerResource(
    "lesson",
    new ResourceTemplate("devcoach://lessons/{lesson_id}", { list: undefined }),
    meta("Lesson", "A single lesson by id."),
    (uri, variables) => {
      try {
        const lessonId = String(variables.lesson_id);
        const lesson = db.withConnection((c) => db.getLessonById(c, lessonId));
        if (!lesson) return jsonResource(uri, { error: `Lesson '${lessonId}' not found` });
        return jsonResource(uri, lesson);
      } catch (err) {
        return jsonResource(uri, { error: String(err) });
      }
    },
  );

  // ── Prompt ───────────────────────────────────────────────────────────────

  server.registerPrompt(
    "devcoach_instructions",
    {
      title: "devcoach coaching instructions",
      description:
        "Full coaching instructions for the devcoach skill (SKILL.md plus its reference files).",
    },
    () => {
      // Clients without a skill directory (Claude Desktop) can't do progressive
      // disclosure — inline the reference files after the main instructions.
      const refs = readSkillReferences()
        .map((r) => `\n\n---\n\n<!-- reference: ${r.name} -->\n\n${r.content}`)
        .join("");
      return {
        messages: [{ role: "user", content: { type: "text", text: readSkill() + refs } }],
      };
    },
  );

  return server;
}

export async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
