// The operations the coaching skill drives through `devcoach api <operation>`: one table of
// named, Zod-validated operations whose JSON result the model reads back from stdout. This is
// the model's whole interface to devcoach — the hooks cue a turn, the skill says which
// operation to run, this file says what each one does. 25 operations; the names are part of
// the contract the skill, the hook cues and the plugin commands rely on.
//
// Rules every operation keeps: validate with a tight schema (`.describe()` on each field, so
// `devcoach api --json` documents itself), never throw (a failure is `{ ok: false, error }`
// with a recovery hint), and when the user must see something the operation cannot show —
// a lesson card, a share code — say so in a `reply_check` field the model reads.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { scanRecentProjectWindow } from "../core/claude-history";
import * as coach from "../core/coach";
import * as courses from "../core/courses";
import * as db from "../core/db";
import { detectGitContext, detectGitUserName } from "../core/git";
import {
  CourseStatusSchema,
  CourseStepKindSchema,
  CourseStepStatusSchema,
  confidenceInputSchema,
  type Lesson,
  LevelSchema,
  parseLesson,
  RepositoryPlatformSchema,
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
import { briefingPayload, onboardingPayload, type Payload, profilePayload } from "./state";

export type ApiResult = { ok: true; result: unknown } | { ok: false; error: string };

const ok = (result: unknown): ApiResult => ({ ok: true, result });
const fail = (error: string): ApiResult => ({ ok: false, error });

export interface Operation<I = unknown> {
  name: string;
  title: string;
  description: string;
  input: z.ZodType<I>;
  /** Reads state only — safe to repeat, changes nothing. */
  readOnly: boolean;
  /** Deletes or overwrites what the user built (lessons, the profile). */
  destructive: boolean;
  run(args: I): ApiResult | Promise<ApiResult>;
}

function define<I>(op: Operation<I>): Operation {
  return op as unknown as Operation;
}

/** A state read: `{ error }` from a payload builder becomes a failed result. */
const stateResult = (name: string, payload: Payload): ApiResult =>
  typeof payload.error === "string" ? fail(`${name} failed: ${payload.error}`) : ok(payload);

const CARD_REPLY_CHECK =
  "Saved — but saving does NOT display anything. The user sees ONLY plain text you write in " +
  "your reply; the title and body you passed to this command are invisible to them, and having " +
  "composed them does not count as having shown the card. Did you already write the full card " +
  "(both ### band headings + title line + body + tip) as plain reply text, outside any tool " +
  "call? If yes: output nothing. If no: write the card now, as the final text of your reply. " +
  "Never write it twice.";

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
  "to track the topic with `devcoach api add_topic` — only on confirmation.";

const COURSE_REPLY_CHECK =
  "Write ONE self-contained HTML document at document_path (inline CSS + JS, no external URLs, " +
  'no fetch, no <form>, no alert/confirm/prompt) with one <section id="step-N"> per step, using ' +
  'your file tools — never paste HTML into the chat. Code goes in <pre><code class="language-…"> ' +
  'and the document carries ONE <script data-devcoach="highlighter"></script> placeholder: ' +
  "devcoach fills it with the highlighter when you register steps (never write one yourself, " +
  "never re-read the whole file afterwards). Then register every section with " +
  "`devcoach api add_course_step` (position order, anchor = the section id). Teach one step per " +
  "message and tell the user the course is on the dashboard under Courses (/devcoach:ui).";

const portSchema = z.number().int().default(7860).describe("Port (default 7860)");
const portInRange = (port: number) => port >= 1024 && port <= 65535;

// ── Lessons ────────────────────────────────────────────────────────────────

const logLesson = define({
  name: "log_lesson",
  title: "Log Lesson",
  description:
    "Save a delivered lesson to the coaching log. Git metadata (project, repository, branch, " +
    "commit_hash, folder, repository_platform) is auto-detected from the workspace when omitted. " +
    "timestamp is always stamped with the current time — there is no field for it. Resets the " +
    "lesson pacing. Returns the saved lesson with every field resolved.",
  input: z.object({
    id: z.string().describe("Unique lesson id (a kebab-case slug of the title)"),
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
  readOnly: false,
  destructive: false,
  run(args) {
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
          args.repository_platform ?? git.repository_platform ?? usage.repository_platform ?? null,
      });
      db.withConnection((c) => {
        db.insertLesson(c, lesson);
        // A lesson was delivered → reset the interaction-pacing counters.
        db.resetNudge(c);
      });
      // The card is chat output devcoach cannot verify, so the result carries a conditional
      // self-check: a model that skipped the card prints it now; one that printed it stops.
      // Never echo the rendered card here — an echo once made the model print it twice.
      return ok({ ...lesson, reply_check: CARD_REPLY_CHECK });
    } catch (err) {
      return fail(`log_lesson failed: ${err}`);
    }
  },
});

const skipLesson = define({
  name: "skip_lesson",
  title: "Skip Lesson",
  description:
    "Decline a lesson cue: run this when the coaching hook asked for a lesson but the " +
    "completed work does not warrant one (pure questions, chat, nothing technical). " +
    "Re-arms the pacing counter so the cue is not repeated immediately. " +
    "Never run it after delivering a lesson — log_lesson already resolves the cue.",
  input: z.object({
    reason: z
      .string()
      .min(1)
      .describe("One line: why no lesson was warranted (shown in `devcoach doctor`)"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      db.withConnection((c) => db.clearCuePending(c, args.reason));
      return ok({
        skipped: true,
        reply_check: "Cue skipped — pacing re-armed. Output nothing to the user.",
      });
    } catch (err) {
      return fail(`skip_lesson failed: ${err}`);
    }
  },
});

const getLessons = define({
  name: "get_lessons",
  title: "Get Lessons",
  description:
    "Query the coaching lesson history. All filters combine. period defaults to all; " +
    "date_from/date_to override period; limit caps results newest-first (0 = all).",
  input: z.object({
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
  readOnly: true,
  destructive: false,
  run(args) {
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
      return ok(lessons);
    } catch {
      return ok([]);
    }
  },
});

const starLesson = define({
  name: "star_lesson",
  title: "Star Lesson",
  description:
    "Set the starred (favourite) flag on a lesson. Returns true if found and updated. Idempotent.",
  input: z.object({
    lesson_id: z.string().describe("Lesson id"),
    starred: z.boolean().describe("true to favourite, false to unmark"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      return ok(db.withConnection((c) => db.setStar(c, args.lesson_id, args.starred)));
    } catch (err) {
      return fail(`star_lesson failed for '${args.lesson_id}': ${err}`);
    }
  },
});

const deleteLesson = define({
  name: "delete_lesson",
  title: "Delete Lesson",
  description: "Permanently delete a lesson by id. Returns true if found and deleted.",
  input: z.object({ lesson_id: z.string().describe("Lesson id to delete") }),
  readOnly: false,
  destructive: true,
  run(args) {
    try {
      return ok(db.withConnection((c) => db.deleteLesson(c, args.lesson_id)));
    } catch (err) {
      return fail(`delete_lesson failed for '${args.lesson_id}': ${err}`);
    }
  },
});

const submitFeedback = define({
  name: "submit_feedback",
  title: "Submit Feedback",
  description:
    "Record the user's answer under a lesson card. know = already knew it (confidence +1); " +
    "understood = new and now clear (no confidence change); dont_know = couldn't follow this " +
    "session (no confidence change; the lesson becomes a course seed); clear = remove the " +
    "answer. Idempotent — repeating the stored answer changes nothing. Returns true when the " +
    "lesson exists.",
  input: z.object({
    lesson_id: z.string().describe("Lesson id"),
    feedback: z
      .enum(["know", "understood", "dont_know", "clear"])
      .describe("know | understood | dont_know | clear"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      const value = args.feedback === "clear" ? null : args.feedback;
      const result = db.withConnection((c) => coach.recordFeedback(c, args.lesson_id, value));
      return ok(result !== null);
    } catch (err) {
      return fail(`submit_feedback failed for '${args.lesson_id}': ${err}`);
    }
  },
});

// ── Knowledge map ──────────────────────────────────────────────────────────

const updateKnowledge = define({
  name: "update_knowledge",
  title: "Update Knowledge",
  description:
    "Adjust the confidence score for a topic by delta (e.g. +1 or -1). Returns the new " +
    "confidence (0-10). Creates the topic at confidence 5 if it does not exist.",
  input: z.object({
    topic: z.string().describe("Topic id, e.g. 'python'"),
    delta: z.number().int().describe("Signed change to apply, e.g. +1 or -1"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      return ok(db.withConnection((c) => coach.applyKnowledgeDelta(c, args.topic, args.delta)));
    } catch (err) {
      return fail(`update_knowledge failed for '${args.topic}': ${err}`);
    }
  },
});

const addTopic = define({
  name: "add_topic",
  title: "Add Topic",
  description:
    "Add a topic to the knowledge map, or update its confidence if it exists. Optionally assign " +
    "it to a group (auto-created). Prefer a single-word topic id. Idempotent.",
  input: z.object({
    topic: z.string().describe("Topic id — prefer a single word, max 3 words"),
    confidence: confidenceInputSchema.default(5).describe("Initial confidence 0-10 (default 5)"),
    group: z.string().nullish().describe("Optional group name; 'Other' if omitted"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      db.withConnection((c) => {
        db.upsertKnowledge(c, args.topic, args.confidence);
        if (args.group && args.group !== "Other") db.assignTopicToGroup(c, args.topic, args.group);
      });
      return ok(true);
    } catch (err) {
      return fail(`add_topic failed for '${args.topic}': ${err}`);
    }
  },
});

const removeTopic = define({
  name: "remove_topic",
  title: "Remove Topic",
  description: "Remove a topic from the knowledge map entirely. Returns true if it existed.",
  input: z.object({ topic: z.string().describe("Topic id to remove") }),
  readOnly: false,
  destructive: true,
  run(args) {
    try {
      return ok(db.withConnection((c) => db.deleteKnowledge(c, args.topic)));
    } catch (err) {
      return fail(`remove_topic failed for '${args.topic}': ${err}`);
    }
  },
});

const addGroup = define({
  name: "add_group",
  title: "Add Group",
  description:
    "Create a new (initially empty) knowledge group. Idempotent — returns true either way.",
  input: z.object({ name: z.string().describe("Group name, e.g. 'Machine Learning'") }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      db.withConnection((c) => db.addGroup(c, args.name.trim()));
      return ok(true);
    } catch (err) {
      return fail(`add_group failed for '${args.name}': ${err}`);
    }
  },
});

const removeGroup = define({
  name: "remove_group",
  title: "Remove Group",
  description: "Delete a knowledge group. Its topics move to Other. Returns true if it existed.",
  input: z.object({ name: z.string().describe("Group name to delete") }),
  readOnly: false,
  destructive: true,
  run(args) {
    try {
      return ok(db.withConnection((c) => db.deleteGroup(c, args.name)));
    } catch (err) {
      return fail(`remove_group failed for '${args.name}': ${err}`);
    }
  },
});

// ── Settings & dashboard ───────────────────────────────────────────────────

const updateSettings = define({
  name: "update_settings",
  title: "Update Settings",
  description:
    "Update a coaching setting. max_per_day: integer 1-20. min_gap_minutes: integer 0-1440 " +
    "(0 = no cooldown). nudge_every: integer 0-1000 interactions between lesson cues " +
    "(0 = cue every turn). nudge_scope: 'session' | 'global'. share_name: the sender name " +
    "proposed when sharing a lesson (max 80 chars, empty clears). Returns the full updated settings.",
  input: z.object({
    key: z
      .enum(["max_per_day", "min_gap_minutes", "nudge_every", "nudge_scope", "share_name"])
      .describe("Setting key"),
    value: z
      .string()
      .describe(
        "New value (integer string; 'session'|'global' for nudge_scope; free text for share_name)",
      ),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    const save = (v: string): ApiResult => {
      try {
        return ok(
          db.withConnection((c) => {
            db.setSetting(c, args.key, v);
            return db.getSettings(c);
          }),
        );
      } catch (err) {
        return fail(`update_settings failed for '${args.key}': ${err}`);
      }
    };
    if (args.key === "share_name") {
      if (args.value.trim().length > db.SHARE_NAME_MAX) {
        return fail(`share_name must be at most ${db.SHARE_NAME_MAX} characters`);
      }
      return save(db.normalizeShareName(args.value));
    }
    if (args.key === "nudge_scope") {
      if (args.value !== "session" && args.value !== "global") {
        return fail("nudge_scope must be 'session' or 'global'");
      }
      return save(args.value);
    }
    const intVal = Number.parseInt(args.value, 10);
    if (Number.isNaN(intVal)) return fail(`Value must be an integer, got '${args.value}'`);
    if (args.key === "max_per_day" && !(intVal >= 1 && intVal <= 20)) {
      return fail("max_per_day must be between 1 and 20");
    }
    if (args.key === "min_gap_minutes" && !(intVal >= 0 && intVal <= 1440)) {
      return fail("min_gap_minutes must be between 0 and 1440");
    }
    if (args.key === "nudge_every" && !(intVal >= 0 && intVal <= 1000)) {
      return fail("nudge_every must be between 0 and 1000");
    }
    return save(String(intVal));
  },
});

const openUi = define({
  name: "open_ui",
  title: "Open UI",
  description:
    "Launch the devcoach web dashboard in the background and return its URL. " +
    "Reports `already_running` when one answers on the port. port must be 1024-65535.",
  input: z.object({ port: portSchema }),
  readOnly: false,
  destructive: false,
  async run(args) {
    const port = args.port;
    if (!portInRange(port)) return fail(`port ${port} is out of valid range (1024-65535)`);
    const url = `http://localhost:${port}`;
    // A detached child on a busy port would just die unseen (stdio is ignored) — say so instead.
    const { pingUi } = await import("../web/app");
    if (await pingUi(port)) return ok({ status: "already_running", port, url });
    const child = spawn(process.execPath, [process.argv[1] ?? "", "ui", "--port", String(port)], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return ok({ status: "starting", port, url });
  },
});

const stopUi = define({
  name: "stop_ui",
  title: "Stop UI",
  description:
    "Stop the devcoach web dashboard listening on port (whoever started it — open_ui or a " +
    "terminal). Graceful: in-flight requests finish first. Reports stopped=false when nothing " +
    "is running there. port must be 1024-65535.",
  input: z.object({ port: portSchema }),
  readOnly: false,
  destructive: false,
  async run(args) {
    const port = args.port;
    if (!portInRange(port)) return fail(`port ${port} is out of valid range (1024-65535)`);
    const { stopUi: stop } = await import("../web/app");
    return ok({ stopped: await stop(port), port });
  },
});

// ── Onboarding & state reads ───────────────────────────────────────────────

const completeOnboarding = define({
  name: "complete_onboarding",
  title: "Complete Onboarding",
  description:
    "Save the user's initial knowledge profile and mark onboarding complete. Wipes any " +
    "default-seeded profile. topics: {topic_id: confidence_0_to_10}. groups: {group_name: [topic_id,...]} " +
    "(topics not in any group go to 'Other'). Ensures learning-state.md exists and is non-empty " +
    "(a placeholder if needed) — there is no notebook field here. Write the real personalized " +
    "notebook yourself right after, directly to the notebook_path that get_onboarding reports. " +
    "Returns the updated profile.",
  input: z.object({
    topics: z.record(z.string(), confidenceInputSchema).describe("{topic_id: confidence 0-10}"),
    groups: z
      .record(z.string(), z.array(z.string()))
      .optional()
      .describe("{group_name: [topic_id, ...]}"),
  }),
  readOnly: false,
  destructive: true,
  run(args) {
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
      // The notebook file exists and is non-empty the INSTANT the profile is saved — never a
      // window where knowledge_ready is true but no notebook file exists at all. The skill
      // overwrites this placeholder with the real notebook right after, with its own file tools.
      mkdirSync(dirname(db.LEARNING_STATE_PATH), { recursive: true });
      if (!existsSync(db.LEARNING_STATE_PATH) || statSync(db.LEARNING_STATE_PATH).size === 0) {
        writeFileSync(db.LEARNING_STATE_PATH, "# devcoach — Coaching Notebook\n");
      }
      return ok(profile);
    } catch (err) {
      return fail(`complete_onboarding failed: ${err}`);
    }
  },
});

const previewDeepScan = define({
  name: "preview_deep_scan",
  title: "Preview Deep Scan",
  description:
    "Cheap, metadata-only pre-check for 'Automatic (Deep)' onboarding. Counts and lists Claude " +
    "Code projects whose last recorded activity falls within a rolling window (months back from " +
    "now) — a real date window, not a fixed top-N. Reads no prompt/conversation text, only " +
    "project paths and activity timestamps. Run it BEFORE spawning the deep-read subagent: " +
    "over_soft_limit true means there are enough candidates that the user should be asked " +
    "whether to narrow the window, proceed anyway, or pick specific projects.",
  input: z.object({
    months: z
      .number()
      .int()
      .min(1)
      .max(24)
      .default(3)
      .describe("Rolling window size in months, counting back from now"),
  }),
  readOnly: true,
  destructive: false,
  run(args) {
    try {
      return ok({ ...scanRecentProjectWindow(args.months) });
    } catch (err) {
      return fail(`preview_deep_scan failed: ${err}`);
    }
  },
});

const getBriefing = define({
  name: "get_briefing",
  title: "Lesson Briefing",
  description:
    "Everything needed before delivering a lesson, in ONE call: onboarding status, rate limit, " +
    "taught topics, knowledge profile, the coaching notebook text and its notebook_path.",
  input: z.object({}),
  readOnly: true,
  destructive: false,
  run: () => stateResult("get_briefing", briefingPayload()),
});

const getOnboarding = define({
  name: "get_onboarding",
  title: "Onboarding Status & Detected Stack",
  description:
    "Onboarding status (knowledge_ready, notebook_ready, needs_onboarding), the stack detected " +
    "across the full Claude Code history with per-project provenance, the default topics, the " +
    "notebook_path and next_step — what to do with this payload.",
  input: z.object({}),
  readOnly: true,
  destructive: false,
  run: () => stateResult("get_onboarding", onboardingPayload()),
});

const getProfile = define({
  name: "get_profile",
  title: "Knowledge Profile",
  description: "Current knowledge map: topics with confidence 0–10 and their groups.",
  input: z.object({}),
  readOnly: true,
  destructive: false,
  run: () => stateResult("get_profile", profilePayload()),
});

// ── Lesson sharing ─────────────────────────────────────────────────────────

const shareLesson = define({
  name: "share_lesson",
  title: "Share Lesson",
  description:
    "Hand a lesson to another person. transport 'text' (default) returns the card plus a one-line " +
    "code to paste anywhere; 'link' a server-less URL that previews the lesson and imports it " +
    "into their dashboard; 'file' the contents of a .devcoach.md file. Only title, summary, " +
    "body, topic, categories and level travel unless include_context is true; local paths " +
    "never do. Pick the lesson with get_lessons first.",
  input: z.object({
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
  readOnly: true,
  destructive: false,
  run(args) {
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
        return fail(
          `share_lesson: lesson '${args.lesson_id}' not found — run get_lessons to pick one`,
        );
      }
      return ok({
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
      return fail(`share_lesson failed: ${err}`);
    }
  },
});

const importLesson = define({
  name: "import_lesson",
  title: "Import Lesson",
  description:
    "Store a lesson someone shared. Pass whatever the user handed you, verbatim: the " +
    "devcoach:lesson:1:… code, the whole copied card, the share link, a URL to the lesson " +
    "text, the contents of a .devcoach.md file, or a lessons JSON export. The lesson joins the " +
    "coaching log as their own (feedback works as usual) but never counts against the daily " +
    "limit; re-importing the same share is reported as a duplicate, not an error.",
  input: z.object({
    payload: z
      .string()
      .min(1)
      .describe("The code, link, URL, card text, file text or JSON — verbatim"),
  }),
  readOnly: false,
  destructive: false,
  async run(args) {
    try {
      const raw =
        isHttpUrl(args.payload) && !args.payload.includes("#devcoach:lesson:")
          ? await fetchSharedInput(args.payload)
          : args.payload;
      const result = db.withConnection((c) => coach.importSharedInput(c, raw));
      return ok({ ...result, reply_check: IMPORT_REPLY_CHECK });
    } catch (err) {
      if (err instanceof ShareInputError) return fail(`import_lesson: ${err.message}`);
      return fail(`import_lesson failed: ${err}`);
    }
  },
});

// ── Courses ────────────────────────────────────────────────────────────────
// A course is one rich, self-contained HTML document the model writes itself (like the
// notebook) at the path create_course returns; add_course_step registers each section as a
// step, update_course_progress tracks it, get_courses reads it all back. The dashboard shows
// the document in a sandboxed frame — devcoach never inlines or sanitises it.

const createCourse = define({
  name: "create_course",
  title: "Create Course",
  description:
    "Start a step-by-step course, usually from a lesson the user couldn't follow. Pass the " +
    "prerequisite chain you explored ([{concept, known}], top-down). Returns the course row, " +
    "course_dir and document_path — write the document there yourself, then run " +
    "add_course_step for each section.",
  input: z.object({
    title: z.string().min(1).describe("Course title, e.g. 'From sums to logarithms'"),
    topic_id: z.string().min(1).describe("The lesson-style topic id the course belongs to"),
    goal: z.string().nullish().describe("One sentence: what the user will be able to do"),
    lesson_id: z
      .string()
      .nullish()
      .describe("The seed lesson's id, when the course grows from one"),
    prerequisites: z
      .array(z.object({ concept: z.string().min(1), known: z.boolean() }))
      .default([])
      .describe("The explored chain, top-down: [{concept, known}]"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      const created = db.withConnection((c) => {
        const seed = args.lesson_id ? db.getLessonById(c, args.lesson_id) : null;
        if (args.lesson_id && !seed) {
          throw new courses.CourseError(
            `lesson '${args.lesson_id}' not found — run get_lessons to pick one`,
          );
        }
        const course = courses.createCourse(c, {
          title: args.title,
          topic_id: args.topic_id,
          goal: args.goal ?? null,
          lesson_id: args.lesson_id ?? null,
          prerequisites: args.prerequisites,
        });
        return { course, seed };
      });
      return ok({
        ...created.course,
        course_dir: courses.courseDir(created.course.id),
        document_path: courses.documentPath(created.course.id),
        seed_context: created.seed
          ? {
              task_context: created.seed.task_context,
              project: created.seed.project,
              repository: created.seed.repository,
              branch: created.seed.branch,
            }
          : null,
        reply_check: COURSE_REPLY_CHECK,
      });
    } catch (err) {
      return fail(`create_course failed: ${err}`);
    }
  },
});

const addCourseStep = define({
  name: "add_course_step",
  title: "Add Course Step",
  description:
    "Register a step of a course: the section with id=<anchor> must already exist in the " +
    "course document. Appended by default; pass `after` to insert it after that step (0 = first) — " +
    "the following steps are renumbered.",
  input: z.object({
    course_id: z.string().describe("Course id (from create_course)"),
    title: z.string().min(1).describe("Step title"),
    kind: CourseStepKindSchema.describe("concept | example | practice | check"),
    anchor: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .describe("The section's id in the document, e.g. step-1"),
    after: z
      .number()
      .int()
      .min(0)
      .nullish()
      .describe("Insert after this step number (0 = first); omit to append"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      return ok(
        db.withConnection((c) => {
          const step = courses.addStep(c, args.course_id, {
            title: args.title,
            kind: args.kind,
            anchor: args.anchor,
            after: args.after,
          });
          return { ...courses.getCourse(c, args.course_id), step };
        }),
      );
    } catch (err) {
      return fail(`add_course_step failed: ${err}`);
    }
  },
});

const updateCourseProgress = define({
  name: "update_course_progress",
  title: "Update Course Progress",
  description:
    "With position: set that step to todo | done | skipped (the course completes itself once " +
    "every step is done or skipped). Without position: set the course to active | completed | " +
    "abandoned.",
  input: z.object({
    course_id: z.string().describe("Course id"),
    position: z
      .number()
      .int()
      .min(1)
      .nullish()
      .describe("Step number (1-based); omit for the course"),
    status: z
      .string()
      .describe("Step: todo | done | skipped — course: active | completed | abandoned"),
  }),
  readOnly: false,
  destructive: false,
  run(args) {
    try {
      const out = db.withConnection((c) => {
        if (args.position != null) {
          const status = CourseStepStatusSchema.parse(args.status);
          return courses.setStepStatus(c, args.course_id, args.position, status);
        }
        return courses.setCourseStatus(c, args.course_id, CourseStatusSchema.parse(args.status));
      });
      if (!out) {
        return fail(
          `update_course_progress: course '${args.course_id}'${
            args.position != null ? ` step ${args.position}` : ""
          } not found — run get_courses`,
        );
      }
      return ok(out);
    } catch (err) {
      return fail(`update_course_progress failed: ${err}`);
    }
  },
});

const getCourses = define({
  name: "get_courses",
  title: "Get Courses",
  description:
    "List courses with their steps and progress; filter by id, seed lesson or status. " +
    "'continue the course' = status active.",
  input: z.object({
    course_id: z.string().nullish().describe("One course"),
    lesson_id: z.string().nullish().describe("Courses seeded by this lesson"),
    status: CourseStatusSchema.nullish().describe("active | completed | abandoned"),
  }),
  readOnly: true,
  destructive: false,
  run(args) {
    try {
      const list = db.withConnection((c) => {
        if (args.course_id) {
          const one = courses.getCourse(c, args.course_id);
          return one ? [one] : [];
        }
        return courses.listCourses(c, { lesson_id: args.lesson_id, status: args.status });
      });
      return ok({
        courses: list.map((course) => ({ ...course, course_dir: courses.courseDir(course.id) })),
      });
    } catch {
      return ok({ courses: [] });
    }
  },
});

// ── The table ──────────────────────────────────────────────────────────────

export const OPERATIONS: readonly Operation[] = [
  logLesson,
  skipLesson,
  getLessons,
  starLesson,
  deleteLesson,
  submitFeedback,
  updateKnowledge,
  addTopic,
  removeTopic,
  addGroup,
  removeGroup,
  updateSettings,
  openUi,
  stopUi,
  completeOnboarding,
  previewDeepScan,
  getBriefing,
  getOnboarding,
  getProfile,
  shareLesson,
  importLesson,
  createCourse,
  addCourseStep,
  updateCourseProgress,
  getCourses,
];

export function findOperation(name: string): Operation | null {
  return OPERATIONS.find((op) => op.name === name) ?? null;
}

/**
 * Validate `input` against the operation's schema and run it. Invalid input is a failed result
 * naming every problem (never an exception); so is anything the operation itself refuses.
 */
export async function runOperation(op: Operation, input: unknown): Promise<ApiResult> {
  const parsed = op.input.safeParse(input);
  if (!parsed.success) {
    return fail(`${op.name}: invalid input — ${z.prettifyError(parsed.error)}`);
  }
  try {
    return await op.run(parsed.data);
  } catch (err) {
    return fail(`${op.name} failed: ${err}`);
  }
}

/** The catalogue `devcoach api --json` prints: every operation with its input as JSON Schema. */
export function describeOperations(): Record<string, unknown>[] {
  return OPERATIONS.map((op) => ({
    name: op.name,
    title: op.title,
    description: op.description,
    read_only: op.readOnly,
    destructive: op.destructive,
    input: z.toJSONSchema(op.input),
  }));
}
