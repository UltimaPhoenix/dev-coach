// CLI subcommands — Commander dispatcher,
// zero-dependency styled output (term.ts), Stop hooks (exit 0; silent, or a {decision:block} cue).
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { Command } from "commander";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { detectStack } from "../core/detect";
import { detectGitContext } from "../core/git";
import { readSkill, readSkillReferences } from "../skill";
import { VERSION } from "../version";
import {
  type Column,
  c,
  colorize,
  confidenceBar,
  confidenceColor,
  renderTable,
  rule,
} from "./term";

const log = (s = ""): void => {
  console.log(s);
};
const levelColor = (lvl: string): string =>
  lvl === "junior"
    ? c.green(lvl)
    : lvl === "mid"
      ? c.yellow(lvl)
      : lvl === "senior"
        ? c.red(lvl)
        : lvl;
const feedbackIcon = (fb: string | null): string =>
  fb === "know" ? ` ${c.green("✓")}` : fb === "dont_know" ? ` ${c.red("✗")}` : "";
const feedbackLabel = (fb: string | null): string =>
  fb === "know"
    ? c.green("✓ I know this")
    : fb === "dont_know"
      ? c.red("✗ I don't know this")
      : c.dim("no feedback");

// ── Display commands ─────────────────────────────────────────────────────────

/** Render the knowledge map as a Topic/Group/Confidence/Bar table (shared by `profile` + `setup`). */
function renderProfileTable(profile: ReturnType<typeof coach.getProfile>, title: string): string {
  const topicGroup = new Map<string, string>();
  for (const g of profile.groups) for (const t of g.topics) topicGroup.set(t, g.name);
  const rows = [...profile.knowledge]
    .sort((a, b) => b.confidence - a.confidence)
    .map((e) => {
      const color = confidenceColor(e.confidence);
      return [
        e.topic,
        topicGroup.get(e.topic) ?? "Other",
        colorize(color, `${e.confidence}/10`),
        colorize(color, confidenceBar(e.confidence)),
      ];
    });
  return renderTable(
    title,
    [
      { header: "Topic" },
      { header: "Group" },
      { header: "Confidence", justify: "right" },
      { header: "Bar" },
    ],
    rows,
  );
}

function cmdProfile(): void {
  const profile = db.withConnection((conn) => coach.getProfile(conn));
  log(renderProfileTable(profile, "Knowledge Map"));
}

interface LessonsOpts {
  period: string;
  category: string | null;
  project: string | null;
  repository: string | null;
  branch: string | null;
  commit: string | null;
  starred: boolean;
  feedback: string | null;
  level: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  sort: string;
  order: string;
}

function cmdLessons(o: LessonsOpts): void {
  const lessons = db.withConnection((conn) =>
    db.getLessons(conn, {
      period: o.period === "all" ? null : o.period,
      category: o.category,
      level: o.level,
      project: o.project,
      repository: o.repository,
      branch: o.branch,
      commit: o.commit,
      starred: o.starred ? true : null,
      feedback: o.feedback,
      date_from: o.dateFrom,
      date_to: o.dateTo,
      sort: o.sort,
      order: o.order,
    }),
  );
  if (lessons.length === 0) {
    log(c.dim("No lessons found."));
    return;
  }
  const hasMeta = lessons.some((l) => l.project || l.branch || l.commit_hash);
  const columns: Column[] = [
    { header: "" },
    { header: "Date" },
    { header: "Topic" },
    { header: "Title" },
    { header: "Level", justify: "center" },
    { header: "Categories" },
  ];
  if (hasMeta) columns.push({ header: "Project" }, { header: "Branch" }, { header: "Commit" });
  const rows = lessons.map((l) => {
    const row = [
      l.starred ? c.yellow("★") : c.dim("·"),
      l.timestamp.slice(0, 10),
      c.cyan(l.topic_id),
      l.title + feedbackIcon(l.feedback),
      levelColor(l.level),
      l.categories.join(", "),
    ];
    if (hasMeta) {
      row.push(
        l.project ?? "",
        l.branch ? c.magenta(l.branch) : "",
        l.commit_hash ? c.cyan(l.commit_hash.slice(0, 7)) : "",
      );
    }
    return row;
  });
  log(renderTable("Lessons", columns, rows));
}

function cmdLesson(id: string): void {
  const lesson = db.withConnection((conn) => db.getLessonById(conn, id));
  if (lesson === null) {
    log(c.red(`Lesson '${id}' not found.`));
    process.exit(1);
  }
  log(rule(c.bold(lesson.title)));
  log(`${c.dim("ID:")}         ${lesson.id}`);
  log(`${c.dim("Date:")}        ${lesson.timestamp.slice(0, 19).replace("T", " ")}`);
  log(`${c.dim("Topic:")}       ${lesson.topic_id}`);
  log(`${c.dim("Categories:")}  ${lesson.categories.join(", ")}`);
  log(`${c.dim("Level:")}       ${levelColor(lesson.level)}`);
  const starLabel = lesson.starred ? c.yellow("★ starred") : c.dim("☆ not starred");
  log(
    `${c.dim("Star:")}        ${starLabel}   ${c.dim("Feedback:")} ${feedbackLabel(lesson.feedback)}`,
  );
  if (lesson.task_context) log(`${c.dim("Context:")}     ${lesson.task_context}`);
  if (lesson.project || lesson.repository || lesson.branch || lesson.commit_hash || lesson.folder) {
    const parts: string[] = [];
    if (lesson.project) parts.push(`project=${lesson.project}`);
    if (lesson.repository) parts.push(`repo=${lesson.repository}`);
    if (lesson.branch) parts.push(`branch=${c.magenta(lesson.branch)}`);
    if (lesson.commit_hash) parts.push(`commit=${c.cyan(lesson.commit_hash.slice(0, 7))}`);
    if (lesson.folder) parts.push(`folder=${lesson.folder}`);
    log(`${c.dim("Git:")}         ${parts.join(" · ")}`);
  }
  log(rule());
  log(lesson.summary);
}

function cmdStar(id: string, starred: boolean): void {
  const found = db.withConnection((conn) => {
    if (db.getLessonById(conn, id) === null) return false;
    db.setStar(conn, id, starred);
    return true;
  });
  if (!found) {
    log(c.red(`Lesson '${id}' not found.`));
    process.exit(1);
  }
  log(
    starred
      ? `Lesson ${c.cyan(id)} → ${c.yellow("★ starred")}`
      : `Lesson ${c.cyan(id)} → ${c.dim("☆ unstarred")}`,
  );
}

function cmdDelete(id: string): void {
  const found = db.withConnection((conn) => db.deleteLesson(conn, id));
  if (!found) {
    log(c.red(`Lesson '${id}' not found.`));
    process.exit(1);
  }
  log(`Lesson ${c.cyan(id)} deleted.`);
}

function cmdFeedback(id: string, feedback: string): void {
  if (!["know", "dont_know", "clear"].includes(feedback)) {
    log(c.red(`Invalid feedback '${feedback}'. Use: know | dont_know | clear`));
    process.exit(1);
  }
  const feedbackValue = feedback === "clear" ? null : feedback;
  const result = db.withConnection((conn) => {
    const topicId = coach.recordFeedback(conn, id, feedbackValue);
    if (topicId === null) return null;
    const row = conn.prepare("SELECT confidence FROM knowledge WHERE topic = ?").get(topicId) as
      | { confidence: number }
      | undefined;
    return { topicId, newConf: row ? row.confidence : 5 };
  });
  if (result === null) {
    log(c.red(`Lesson '${id}' not found.`));
    process.exit(1);
  }
  let confLabel: string;
  if (feedbackValue === "know" || feedbackValue === "dont_know") {
    const oldConf = result.newConf + (feedbackValue === "know" ? -1 : 1);
    confLabel = `${c.cyan(result.topicId)} confidence: ${oldConf} → ${c.bold(String(result.newConf))}`;
  } else {
    confLabel = "feedback cleared";
  }
  const icon =
    feedbackValue === "know"
      ? c.green("✓ I know this")
      : feedbackValue === "dont_know"
        ? c.red("✗ I don't know this")
        : c.dim("cleared");
  log(`Lesson ${c.cyan(id)} → ${icon}  (${confLabel})`);
}

function cmdSettings(): void {
  const s = db.withConnection((conn) => db.getSettings(conn));
  const gapH = Math.floor(s.min_gap_minutes / 60);
  const gapM = s.min_gap_minutes % 60;
  const gapLabel = gapH ? `${gapH}h ${gapM}m` : `${gapM}m`;
  log(
    renderTable(
      "Settings",
      [{ header: "Key" }, { header: "Value", justify: "right" }],
      [
        ["max_per_day", String(s.max_per_day)],
        ["min_gap_minutes", `${s.min_gap_minutes} (${gapLabel})`],
        ["nudge_every", s.nudge_every === 0 ? "0 (off)" : String(s.nudge_every)],
        ["nudge_scope", s.nudge_scope],
      ],
    ),
  );
}

function cmdStats(): void {
  const { stats, rateLimit, settings } = db.withConnection((conn) => ({
    stats: coach.getStats(conn),
    rateLimit: coach.checkRateLimit(conn),
    settings: db.getSettings(conn),
  }));
  const num = (k: string): number => Number(stats[k] ?? 0);
  const rlLabel = rateLimit.allowed ? c.green("Available now") : c.yellow(rateLimit.reason ?? "");
  log(
    renderTable(
      "Coaching Stats",
      [{ header: "Metric" }, { header: "Value", justify: "right" }],
      [
        ["Total lessons", String(num("total_lessons"))],
        ["Lessons today (24h)", `${num("lessons_today")} / ${settings.max_per_day}`],
        ["Lessons this week", String(num("lessons_this_week"))],
        ["Next lesson", rlLabel],
      ],
      false,
    ),
  );

  const weakest = (stats.weakest_topics ?? []) as { topic: string; confidence: number }[];
  const strongest = (stats.strongest_topics ?? []) as { topic: string; confidence: number }[];
  if (weakest.length || strongest.length) {
    const rows: string[][] = [];
    for (let i = 0; i < Math.max(weakest.length, strongest.length); i++) {
      const w = weakest[i];
      const s = strongest[i];
      rows.push([
        w ? `${c.red(w.topic)} ${c.dim(`(${w.confidence})`)}` : "",
        s ? `${c.green(s.topic)} ${c.dim(`(${s.confidence})`)}` : "",
      ]);
    }
    log(
      renderTable(undefined, [{ header: "Weakest topics" }, { header: "Strongest topics" }], rows),
    );
  }

  const hint = skillHint();
  if (hint) log(`\n${hint}`);
}

function cmdSet(key: string, value: string): void {
  const validKeys = ["max_per_day", "min_gap_minutes", "nudge_every", "nudge_scope"];
  if (!validKeys.includes(key)) {
    log(c.red(`Unknown key '${key}'. Valid keys: ${validKeys.join(", ")}`));
    process.exit(1);
  }
  if (key === "nudge_scope" && value !== "session" && value !== "global") {
    log(c.red(`Invalid nudge_scope '${value}'. Use: session | global`));
    process.exit(1);
  }
  if (key === "nudge_every") {
    const n = Number.parseInt(value, 10);
    if (!Number.isInteger(n) || n < 0) {
      log(c.red(`Invalid nudge_every '${value}'. Use a non-negative integer (0 = off).`));
      process.exit(1);
    }
  }
  db.withConnection((conn) => db.setSetting(conn, key, value));
  log(c.green(`Set ${key} = ${value}`));
}

function cmdKnowledgeAdd(topic: string, confidence: number, group: string | null): void {
  const t = topic.trim();
  if (!t) {
    log(c.red("Topic name must not be empty."));
    process.exit(1);
  }
  db.withConnection((conn) => {
    db.upsertKnowledge(conn, t, confidence);
    if (group && group !== "Other") db.assignTopicToGroup(conn, t, group);
  });
  const groupLabel = group && group !== "Other" ? ` → ${c.cyan(group)}` : "";
  log(`${c.green("Added")} ${c.bold(t)} (confidence ${c.cyan(String(confidence))})${groupLabel}`);
}

function cmdKnowledgeRemove(topic: string): void {
  const removed = db.withConnection((conn) => db.deleteKnowledge(conn, topic));
  log(
    removed
      ? `${c.green("Removed")} ${c.bold(topic)} from knowledge map`
      : c.yellow(`Topic '${topic}' not found.`),
  );
}

function cmdGroupAdd(name: string): void {
  const groupName = name.trim();
  if (!groupName || groupName === "Other") {
    log(c.red("Invalid group name."));
    process.exit(1);
  }
  db.withConnection((conn) => db.addGroup(conn, groupName));
  log(
    `${c.green(`Group '${c.cyan(groupName)}' ready.`)} Assign topics with: devcoach group-assign <topic> "${groupName}"`,
  );
}

function cmdGroupRemove(name: string): void {
  const count = db.withConnection((conn) => db.deleteGroup(conn, name));
  log(
    count
      ? `${c.green(`Removed group '${c.cyan(name)}'`)}`
      : c.yellow(`Group '${name}' not found.`),
  );
}

function cmdGroupAssign(topic: string, group: string): void {
  const ok = db.withConnection((conn) => {
    const row = conn.prepare("SELECT topic FROM knowledge WHERE topic = ?").get(topic);
    if (row === undefined) return false;
    if (group === "Other") db.unassignTopicFromGroup(conn, topic);
    else db.assignTopicToGroup(conn, topic, group);
    return true;
  });
  if (!ok) {
    log(c.red(`Topic '${topic}' not in knowledge map. Add it first.`));
    process.exit(1);
  }
  log(
    group === "Other"
      ? `${c.green("Moved")} ${c.bold(topic)} → Other (ungrouped)`
      : `${c.green("Moved")} ${c.bold(topic)} → ${c.cyan(group)}`,
  );
}

function cmdBackup(output: string): void {
  const { lessonsCount, knowledgeCount, data } = db.withConnection((conn) => ({
    lessonsCount: db.exportLessons(conn).length,
    knowledgeCount: db.getKnowledgeEntries(conn).length,
    data: db.createBackupZip(conn),
  }));
  writeFileSync(output, data);
  const notebookNote = existsSync(db.LEARNING_STATE_PATH) ? " + notebook" : "";
  log(
    `${c.green("Backup saved:")} ${output}  (${c.cyan(String(lessonsCount))} lessons, ${c.cyan(String(knowledgeCount))} topics${notebookNote})`,
  );
}

function cmdRestore(input: string): void {
  if (!existsSync(input)) {
    log(c.red(`File not found: ${input}`));
    process.exit(1);
  }
  const result = db.withConnection((conn) => db.restoreBackupZip(conn, readFileSync(input)));
  if (result.settings) log(`${c.green("✓")} Settings restored`);
  if (result.topics)
    log(`${c.green("✓")} Knowledge map restored (${c.cyan(String(result.topics))} topics)`);
  const parts = [`${c.cyan(String(result.lessons))} imported`];
  if (result.skipped) parts.push(`${c.yellow(String(result.skipped))} duplicates skipped`);
  if (result.invalid) parts.push(`${c.red(String(result.invalid))} rejected (invalid)`);
  log(`${c.green("✓")} Lessons: ${parts.join(", ")}`);
  if (result.learning_state) log(`${c.green("✓")} Notebook restored`);
}

// ── Install ──────────────────────────────────────────────────────────────────

interface McpConfig {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}
interface HookCmd {
  type: string;
  command: string;
  timeout?: number;
}
interface HookEntry {
  hooks?: HookCmd[];
}
interface CodeSettings {
  hooks?: Record<string, HookEntry[] | undefined>;
  enabledPlugins?: Record<string, boolean>;
  [k: string]: unknown;
}

function claudeDesktopConfigPath(): string {
  const sys = platform();
  if (sys === "darwin") {
    return join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  }
  if (sys === "win32") {
    const appdata = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    return join(appdata, "Claude", "claude_desktop_config.json");
  }
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdg, "Claude", "claude_desktop_config.json");
}
const CLAUDE_CODE_SETTINGS = join(homedir(), ".claude", "settings.json");
const CLAUDE_CODE_SKILL_DIR = join(homedir(), ".claude", "skills", "devcoach");
const SKILL_STAMP = join(CLAUDE_CODE_SKILL_DIR, ".devcoach-version");

function findOnPath(bin: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (!dir) continue;
    try {
      accessSync(join(dir, bin), constants.X_OK);
      return join(dir, bin);
    } catch {
      // not here — keep scanning
    }
  }
  return null;
}
const onPath = (bin: string): boolean => findOnPath(bin) !== null;

function detectInstallMethod(): { command: string; args: string[] } {
  if (onPath("devcoach")) return { command: "devcoach", args: ["mcp"] };
  return { command: "npx", args: ["-y", "devcoach", "mcp"] };
}

/**
 * Hook command prefix. Hooks may run with a minimal GUI PATH, so prefer the absolute
 * binary path — except when the PATH hit lives in an ephemeral per-shell dir (fnm
 * multishells), where the bare name outlives the path. `npx -y devcoach` is the last
 * resort: it works everywhere but needs the npx cache (or network) on every stop.
 */
function hookPrefix(): string {
  const hit = findOnPath("devcoach");
  if (!hit) return "npx -y devcoach";
  return hit.includes("fnm_multishells") ? "devcoach" : hit;
}

function installViaClaudeCli(scope: string, force: boolean): string {
  if (!onPath("claude")) return "";
  if (force)
    spawnSync("claude", ["mcp", "remove", "--scope", scope, "devcoach"], { encoding: "utf8" });
  const m = detectInstallMethod();
  const res = spawnSync(
    "claude",
    ["mcp", "add", "--scope", scope, "devcoach", m.command, "--", ...m.args],
    { encoding: "utf8" },
  );
  if (res.status === 0)
    return `${c.green("✓")} Registered via \`claude mcp add\` (scope: ${scope})`;
  const combined = `${res.stderr ?? ""}${res.stdout ?? ""}`.toLowerCase();
  if (combined.includes("already")) {
    return `${c.yellow("Already registered")} in Claude Code (use --force to overwrite)`;
  }
  return `${c.red("claude mcp add failed:")} ${(res.stderr || res.stdout || "").trim()}`;
}

// Read a JSON config file safely: missing → empty object; malformed → error (never overwrite it).
type JsonRead<T> = { ok: true; data: T } | { ok: false; error: string };
function readJsonFile<T extends object>(path: string): JsonRead<T> {
  if (!existsSync(path)) return { ok: true, data: {} as T };
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return { ok: true, data: (parsed ?? {}) as T };
  } catch {
    return {
      ok: false,
      error: `${c.red("✗")} ${path} is not valid JSON — fix it and re-run (left unchanged)`,
    };
  }
}

function installTo(path: string, entry: object, force: boolean): string {
  const read = readJsonFile<McpConfig>(path);
  if (!read.ok) return read.error;
  const data = read.data;
  data.mcpServers ??= {};
  const servers = data.mcpServers;
  if (servers.devcoach && !force) {
    return `${c.yellow("Already registered")} in ${path} (use --force to overwrite)`;
  }
  servers.devcoach = entry;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return `${c.green("✓")} Installed into ${path}`;
}

/** The exact hook layout devcoach owns: one merged Stop entry + the priming hook. */
function desiredHooks(): Record<string, HookEntry> {
  const prefix = hookPrefix();
  return {
    Stop: { hooks: [{ type: "command", command: `${prefix} stop-hook`, timeout: 60 }] },
    UserPromptSubmit: {
      hooks: [{ type: "command", command: `${prefix} prompt-hook`, timeout: 30 }],
    },
  };
}

/** True when the devcoach Claude Code plugin is enabled — it ships the same hooks. */
function pluginHooksActive(data: CodeSettings): boolean {
  return Object.entries(data.enabledPlugins ?? {}).some(
    ([name, enabled]) => enabled && name.startsWith("devcoach@"),
  );
}

/**
 * Install (or repair) the devcoach hooks in ~/.claude/settings.json. The entries are
 * fully devcoach-owned — like the skill, a stale or legacy layout (two Stop entries,
 * npx prefix, missing timeout) is normalized WITHOUT --force; user hooks are untouched.
 */
function installHook(): string {
  const path = CLAUDE_CODE_SETTINGS;
  const read = readJsonFile<CodeSettings>(path);
  if (!read.ok) return read.error;
  const data = read.data;
  if (pluginHooksActive(data)) {
    return (
      `${c.yellow("Skipped")} — the devcoach plugin already provides the hooks ` +
      "(installing both would double-count interactions)"
    );
  }
  data.hooks ??= {};
  const hooks = data.hooks;
  let changed = false;
  for (const [event, desired] of Object.entries(desiredHooks())) {
    hooks[event] ??= [];
    const list = hooks[event];
    const ours = list
      .map((e, i): [HookEntry, number] => [e, i])
      .filter(([e]) => (e.hooks ?? []).some((h) => (h.command ?? "").includes("devcoach")))
      .map(([, i]) => i);
    const [only] = ours;
    if (
      ours.length === 1 &&
      only !== undefined &&
      JSON.stringify(list[only]) === JSON.stringify(desired)
    )
      continue;
    for (const i of ours.toReversed()) list.splice(i, 1);
    list.push(desired);
    changed = true;
  }
  if (!changed) return `${c.yellow("Already installed")} in ${path} (current layout)`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return `${c.green("✓")} Hooks installed into ${path} (Stop + UserPromptSubmit)`;
}

// ── Claude Code skill ────────────────────────────────────────────────────────
// ~/.claude/skills/devcoach/SKILL.md is fully owned by devcoach (content = bundled
// assets/SKILL.md), so an outdated copy is refreshed without --force — that is the whole
// point of re-running `devcoach install` after an upgrade (npm, Homebrew, …).

type SkillStatus = "missing" | "outdated" | "current";

function skillStatus(): SkillStatus {
  if (!existsSync(join(CLAUDE_CODE_SKILL_DIR, "SKILL.md"))) return "missing";
  try {
    if (readFileSync(SKILL_STAMP, "utf8").trim() === VERSION) return "current";
  } catch {
    // no readable stamp → predates version stamping → outdated
  }
  return "outdated";
}

function installSkill(force: boolean): string {
  if (!force && skillStatus() === "current") {
    return `${c.yellow("Already installed")} in ${CLAUDE_CODE_SKILL_DIR} (current version)`;
  }
  mkdirSync(CLAUDE_CODE_SKILL_DIR, { recursive: true });
  writeFileSync(join(CLAUDE_CODE_SKILL_DIR, "SKILL.md"), readSkill());
  const refs = readSkillReferences();
  if (refs.length) {
    const refDir = join(CLAUDE_CODE_SKILL_DIR, "references");
    mkdirSync(refDir, { recursive: true });
    for (const ref of refs) writeFileSync(join(refDir, ref.name), ref.content);
  }
  writeFileSync(SKILL_STAMP, `${VERSION}\n`);
  return `${c.green("✓")} Installed into ${CLAUDE_CODE_SKILL_DIR}`;
}

/** One-line upgrade hint for the welcome screen and `stats` — empty string when nothing to say. */
function skillHint(): string {
  const status = skillStatus();
  if (status === "outdated") {
    return `${c.yellow("→")} The devcoach Claude Code skill is out of date — run ${c.bold("devcoach install")} to refresh it.`;
  }
  if (status === "missing") {
    // Only nudge users who already wired devcoach into Claude Code (Stop hooks present):
    // Desktop-only or not-yet-installed users would see a false alarm.
    const read = readJsonFile<CodeSettings>(CLAUDE_CODE_SETTINGS);
    const hooked =
      read.ok &&
      (read.data.hooks?.Stop ?? []).some((e) =>
        (e.hooks ?? []).some((h) => (h.command ?? "").includes("devcoach")),
      );
    if (hooked) {
      return `${c.yellow("→")} The devcoach Claude Code skill is not installed — run ${c.bold("devcoach install")} to add it.`;
    }
  }
  return "";
}

interface InstallOpts {
  claudeCode: boolean;
  claudeDesktop: boolean;
  force: boolean;
  skipHook: boolean;
}

function cmdInstall(o: InstallOpts): void {
  const doCode = o.claudeCode || !o.claudeDesktop;
  const doDesktop = o.claudeDesktop || !o.claudeCode;
  const m = detectInstallMethod();
  let needsRestart = false;

  log(c.bold("Setting up devcoach") + c.dim(`  (${m.command} ${m.args.join(" ")})`));
  log();

  if (doCode) {
    log(c.bold("Claude Code"));
    // "user" scope = all projects — matches the user-level Stop hooks (~/.claude/settings.json).
    let msg = installViaClaudeCli("user", o.force);
    if (!msg) {
      const codeConfig = join(homedir(), ".claude.json");
      msg = installTo(codeConfig, { type: "stdio", env: {}, ...m }, o.force);
      needsRestart = true;
    }
    log(`  MCP server…  ${msg}`);
    if (!o.skipHook) log(`  Hooks…       ${installHook()}`);
    log(`  Skill…       ${installSkill(o.force)}`);
    log();
  }

  if (doDesktop) {
    log(c.bold("Claude Desktop"));
    log(`  MCP server…  ${installTo(claudeDesktopConfigPath(), m, o.force)}`);
    needsRestart = true;
    log();
  }

  if (needsRestart) log(`${c.yellow("→")} Restart Claude Desktop to pick up the new server.\n`);
  log(
    c.dim(
      "Tip: run devcoach backup to export your profile, lessons and settings.\n" +
        "     run devcoach restore <file> to import a backup on a new machine.\n" +
        "     After upgrading devcoach (npm, Homebrew), re-run devcoach install to refresh the skill.",
    ),
  );
}

// ── Doctor ───────────────────────────────────────────────────────────────────

/**
 * Read-only diagnosis of the devcoach ⇄ Claude Code wiring, ending with a verdict on
 * whether the next eligible stop would cue a lesson and why. Always exits 0 — doctor
 * reports problems, it never is one.
 */
function cmdDoctor(): void {
  const ok = (s: string): void => log(`  ${c.green("✓")} ${s}`);
  const warn = (s: string): void => log(`  ${c.yellow("→")} ${s}`);
  const bad = (s: string): void => log(`  ${c.red("✗")} ${s}`);

  log(`\n${c.bold("devcoach doctor")} ${c.dim(`v${VERSION}`)}\n`);

  log(c.bold("Environment"));
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor >= 24) ok(`Node ${process.versions.node} (≥ 24)`);
  else bad(`Node ${process.versions.node} — devcoach needs Node ≥ 24 (embedded node:sqlite)`);

  log(c.bold("\nClaude Code wiring"));
  const read = readJsonFile<CodeSettings>(CLAUDE_CODE_SETTINGS);
  if (!read.ok) {
    bad(`${CLAUDE_CODE_SETTINGS} is not valid JSON — hooks cannot run`);
  } else {
    const pluginOn = pluginHooksActive(read.data);
    const ours: { event: string; cmd: HookCmd }[] = [];
    for (const [event, entries] of Object.entries(read.data.hooks ?? {})) {
      for (const e of entries ?? []) {
        for (const h of e.hooks ?? []) {
          if ((h.command ?? "").includes("devcoach")) ours.push({ event, cmd: h });
        }
      }
    }
    if (pluginOn && ours.length) {
      bad(
        "devcoach hooks are registered TWICE (plugin + settings.json) — interactions are " +
          "double-counted. Disable the plugin or remove the settings.json entries.",
      );
    } else if (pluginOn) {
      ok("hooks provided by the devcoach plugin");
    } else if (!ours.length) {
      bad(`no devcoach hooks in ${CLAUDE_CODE_SETTINGS} — run ${c.bold("devcoach install")}`);
    } else {
      const legacy = ours.filter(
        ({ cmd }) => cmd.command.includes("onboard-hook") || cmd.command.includes("lesson-ready"),
      );
      if (legacy.length)
        warn(
          `legacy two-entry Stop layout — run ${c.bold("devcoach install")} to merge into one ` +
            "stop-hook entry (fewer spawns per stop)",
        );
      else ok(`Stop hook wired (${ours.filter((o) => o.event === "Stop").length} entry)`);
      if (!ours.some((o) => o.event === "UserPromptSubmit"))
        warn(
          `no UserPromptSubmit priming hook — run ${c.bold("devcoach install")} to add it ` +
            "(lessons land more reliably)",
        );
      else ok("UserPromptSubmit priming hook wired");
      for (const { cmd } of ours) {
        const bin = cmd.command.split(" ")[0] ?? "";
        if (bin.startsWith("/") && !existsSync(bin))
          bad(`hook command not found: ${bin} — re-run ${c.bold("devcoach install")}`);
        if (cmd.command.startsWith("npx "))
          warn("hook runs via npx — needs the npx cache (or network) on every stop");
        if (cmd.timeout == null) warn(`hook entry has no timeout (${cmd.command})`);
      }
    }

    const skill = skillStatus();
    if (skill === "current") ok("Claude Code skill installed (current version)");
    else if (pluginOn) ok("Claude Code skill bundled with the plugin");
    else if (skill === "outdated")
      warn(`Claude Code skill is out of date — run ${c.bold("devcoach install")}`);
    else warn(`Claude Code skill not installed — run ${c.bold("devcoach install")}`);

    const mcpRead = readJsonFile<McpConfig>(join(homedir(), ".claude.json"));
    if (mcpRead.ok && mcpRead.data.mcpServers?.devcoach) ok("MCP server registered (user scope)");
    else
      warn(
        "MCP server not found in ~/.claude.json — it may be registered elsewhere " +
          `(check with ${c.bold("claude mcp get devcoach")})`,
      );
  }

  log(c.bold("\nDatabase & pacing"));
  if (!existsSync(db.DB_PATH)) {
    warn(`no database yet (${db.DB_PATH}) — onboarding runs on the first technical task`);
    log();
    return;
  }
  try {
    db.withConnection((conn) => {
      ok(`database opens (${db.DB_PATH})`);
      if (db.isOnboardingComplete(conn).knowledge_ready) ok("onboarding complete");
      else warn("onboarding not complete — the next stop cues it");
      const settings = db.getSettings(conn);
      log(
        `    settings: max_per_day=${settings.max_per_day} · min_gap_minutes=${settings.min_gap_minutes} · ` +
          `nudge_every=${settings.nudge_every} · nudge_scope=${settings.nudge_scope}`,
      );
      const sessions = db.listNudgeSessions(conn);
      const total = sessions.reduce((sum, s) => sum + s.interactions, 0);
      log(
        `    pacing: ${sessions.length} session(s) counted, ${total} interaction(s) total` +
          (sessions[0]
            ? ` — latest ${sessions[0].session_id.slice(0, 8)}… at ${sessions[0].interactions}`
            : ""),
      );
      const cue = db.getCueState(conn);
      if (cue.pending) warn(`a cue is pending since ${cue.last_cue_at} (retry threshold armed)`);
      else if (cue.last_skip_reason) log(`    last skip: "${cue.last_skip_reason}"`);
      if (cue.display_pending)
        warn("a lesson was logged and the next stop will verify its card is visible");
      const rate = coach.checkRateLimit(conn);
      if (rate.allowed) ok("rate limit: allowed");
      else warn(`rate limit: ${rate.reason}`);

      log(c.bold("\nVerdict"));
      const verdict = coach.explainCue(conn, sessions[0]?.session_id ?? null);
      if (verdict.wouldCue) ok("the next eligible stop WOULD cue a lesson");
      else warn("the next eligible stop would NOT cue a lesson:");
      for (const reason of verdict.reasons) log(`      · ${reason}`);
    });
  } catch (err) {
    bad(`database check failed: ${err}`);
  }
  log();
}

// ── Setup wizard (interactive) ───────────────────────────────────────────────

async function cmdSetup(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (msg: string, def = ""): Promise<string> => {
    const suffix = def ? ` [${def}]` : "";
    const val = (await rl.question(`${msg}${suffix}: `)).trim();
    return val || def;
  };
  const askInt = async (msg: string, def: number, lo: number, hi: number): Promise<number> => {
    for (;;) {
      const raw = await ask(msg, String(def));
      const v = Number.parseInt(raw, 10);
      if (!Number.isNaN(v) && v >= lo && v <= hi) return v;
      log(c.red(`Must be ${lo}–${hi}.`));
    }
  };

  try {
    log(rule(c.bold("devcoach setup")));

    log(`\n${c.bold("Step 1")} — Restore from backup`);
    const backupPath = await ask("Path to existing backup zip (Enter to skip)", "");
    if (backupPath) {
      if (!existsSync(backupPath)) {
        log(c.red(`File not found: ${backupPath}`));
        process.exit(1);
      }
      const result = db.withConnection((conn) =>
        db.restoreBackupZip(conn, readFileSync(backupPath)),
      );
      log(
        `${c.green("✓")} Restored: ${result.topics} topics, ${result.lessons} lessons${result.learning_state ? ", notebook" : ""}`,
      );
      log(c.green("Setup complete!"));
      return;
    }

    log(`\n${c.bold("Step 2")} — Build your knowledge profile`);
    const mode = (
      await ask("Mode: [a]utomatic (detect from files) / [m]anual (type your stack)", "a")
    ).toLowerCase();
    const topics: Record<string, number> = {};

    if (mode.startsWith("a")) {
      const git = detectGitContext();
      const cwd = git.folder ?? process.cwd();
      const detected = detectStack(cwd);
      const keys = Object.keys(detected).sort((a, b) => a.localeCompare(b));
      if (keys.length) {
        log(`\n${c.dim(`Detected from ${c.cyan(cwd)}:`)}`);
        for (const topic of keys) {
          const defaultConf = detected[topic] ?? 5;
          const raw = await ask(
            `  ${c.cyan(topic)} (Enter=keep, 0-10=override, s=skip)`,
            String(defaultConf),
          );
          if (raw.toLowerCase() === "s") continue;
          const v = Number.parseInt(raw, 10);
          topics[topic] = Number.isNaN(v) ? defaultConf : Math.max(0, Math.min(10, v));
        }
      } else {
        log(c.dim("No technology files detected in current directory."));
      }
      const extra = await ask("\nAdd additional topics (comma-separated, or Enter to skip)", "");
      for (const t of extra
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)) {
        topics[t] = await askInt(`  Confidence for ${c.cyan(t)}`, 5, 0, 10);
      }
    } else {
      log(c.dim("\nEnter topics: 'topic_id confidence' (e.g. python 7). Blank line when done."));
      for (;;) {
        const entry = (await ask("Topic (Enter when done)", "")).trim();
        if (!entry) break;
        const parts = entry.split(/\s+/);
        const t = parts[0] ?? "";
        const v = Number.parseInt(parts[1] ?? "", 10);
        const conf = Number.isNaN(v) ? 5 : Math.max(0, Math.min(10, v));
        topics[t] = conf;
        log(`  ${c.green("+")} ${c.cyan(t)} → ${conf}`);
      }
    }

    const groups: Record<string, string[]> = {};
    if (Object.keys(topics).length) {
      log(`\n${c.bold("Step 3")} — Organise into groups`);
      const doGroups = (await ask("Organise topics into groups? [y/N]", "n")).toLowerCase();
      if (doGroups.startsWith("y")) {
        const existingGroups: string[] = [];
        for (const t of Object.keys(topics).sort((a, b) => a.localeCompare(b))) {
          const suggestion = existingGroups.length ? existingGroups.join(", ") : "(none yet)";
          const g = await ask(
            `  Group for ${c.cyan(t)}  existing: ${c.dim(suggestion)}  (Enter=Other)`,
            "",
          );
          if (g && g !== "Other") {
            const list = groups[g] ?? [];
            list.push(t);
            groups[g] = list;
            if (!existingGroups.includes(g)) existingGroups.push(g);
          }
        }
      }
    }

    log(`\n${c.bold("Step 4")} — Rate-limit settings`);
    const maxPerDay = await askInt("Max lessons per day", 2, 1, 20);
    const minGap = await askInt("Min gap between lessons (minutes)", 240, 0, 1440);

    const profile = db.withConnection((conn) => {
      conn.exec(
        "DELETE FROM knowledge; DELETE FROM knowledge_groups; DELETE FROM knowledge_group_names;",
      );
      for (const [t, conf] of Object.entries(topics)) db.upsertKnowledge(conn, t, conf);
      for (const [g, ts] of Object.entries(groups))
        for (const t of ts) db.assignTopicToGroup(conn, t, g);
      db.setSetting(conn, "max_per_day", String(maxPerDay));
      db.setSetting(conn, "min_gap_minutes", String(minGap));
      return coach.getProfile(conn);
    });

    log(renderProfileTable(profile, "Knowledge Profile"));
    log(`\n${c.green("Setup complete!")} ${Object.keys(topics).length} topics saved.`);
  } finally {
    rl.close();
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
// The hook implementations live in ./hooks (a lean chunk loaded by src/bin.ts without
// the full CLI bundle); imported here for Commander registration, re-exported for the
// tests and for API stability.
import { cmdLessonReady, cmdOnboardHook, cmdPromptHook, cmdStopHook } from "./hooks";

export { buildLessonCue, type HookPayload, parseHookPayload } from "./hooks";
export { cmdLessonReady, cmdOnboardHook, cmdPromptHook, cmdStopHook };

// ── Welcome ──────────────────────────────────────────────────────────────────

function printWelcome(): void {
  const commands: [string, string][] = [
    ["mcp", "Start the MCP server (stdio) for Claude Code / Claude Desktop"],
    ["ui [--port N]", "Launch the web dashboard  (default port: 7860)"],
    ["setup", "First-run wizard: import backup or build your knowledge profile"],
    ["install", "Register the MCP server + Stop hooks + skill in Claude Code / Claude Desktop"],
    ["onboard-hook", "Claude Code Stop hook: cue onboarding when no profile exists"],
    ["lesson-ready", "Claude Code Stop hook: cue a lesson when one is due"],
    ["doctor", "Diagnose the Claude Code wiring — explains why a lesson would(n't) fire"],
    ["profile", "Show the knowledge map"],
    ["stats", "Coaching statistics and rate-limit status"],
    ["settings / set", "Show / update settings (max_per_day | min_gap_minutes)"],
    ["lessons / lesson", "List past lessons / show one in detail"],
    ["star / unstar / delete", "Manage a lesson"],
    ["feedback <id>", "Record know / dont_know feedback"],
    ["knowledge-add / -remove", "Add / remove a topic"],
    ["group-add / -remove / -assign", "Manage knowledge groups"],
    ["backup / restore", "Export / import a full backup zip"],
  ];
  log(`\n${c.bold(`devcoach ${c.dim(`v${VERSION}`)}`)}`);
  for (const [cmd, desc] of commands)
    log(`  ${c.cyan(`devcoach ${cmd}`.padEnd(32))} ${c.dim(desc)}`);
  log(
    `\n${c.dim("Run")} ${c.bold("devcoach <command> --help")} ${c.dim("for per-command options.")}\n`,
  );
  const hint = skillHint();
  if (hint) log(`${hint}\n`);
}

// ── Dispatch (Commander) ─────────────────────────────────────────────────────

function str(v: string | undefined): string | null {
  return v ?? null;
}

interface LessonsCliOpts {
  period?: string;
  category?: string;
  project?: string;
  repository?: string;
  branch?: string;
  commit?: string;
  starred?: boolean;
  feedback?: string;
  level?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  order?: string;
}

function buildProgram(): Command {
  const program = new Command();
  // exitOverride before adding subcommands so they inherit it — every parse/help/version
  // path then throws to runCli's catch instead of calling process.exit directly.
  program.exitOverride();
  program
    .name("devcoach")
    .description("devcoach — progressive technical coaching")
    .version(`devcoach ${VERSION}`, "-v, --version", "output the version number")
    .allowExcessArguments(false)
    .showHelpAfterError("(add --help for usage)")
    // Default action when no subcommand is given: branded welcome screen.
    .action(() => printWelcome());

  // The MCP server (SDK + zod schemas) and the web UI (Hono + views) are the two heavy
  // corners of the bundle — loaded on demand so plain CLI commands never parse them.
  program
    .command("mcp")
    .description("Start the MCP server (stdio transport)")
    .action(async () => {
      const { runStdio } = await import("../mcp/server");
      await runStdio();
    });

  program.command("profile").description("Show the knowledge map").action(cmdProfile);

  program
    .command("lessons")
    .description("List past lessons")
    .option("--period <period>", "today | week | month | year | all", "all")
    .option("--category <category>", "Filter by category tag")
    .option("--project <project>", "Filter by project (fuzzy)")
    .option("--repository <repository>", "Filter by repository (fuzzy)")
    .option("--branch <branch>", "Filter by branch (fuzzy)")
    .option("--commit <commit>", "Filter by commit hash prefix (fuzzy)")
    .option("--starred", "Show only starred lessons")
    .option("--feedback <feedback>", "know | dont_know | none")
    .option("--level <level>", "junior | mid | senior")
    .option("--date-from <date>", "Show lessons on or after this date (YYYY-MM-DD[THH:MM])")
    .option("--date-to <date>", "Show lessons on or before this date (YYYY-MM-DD[THH:MM])")
    .option("--sort <column>", "timestamp | level | topic_id | title | feedback", "timestamp")
    .option("--order <order>", "asc | desc", "desc")
    .action((opts: LessonsCliOpts) =>
      cmdLessons({
        period: opts.period ?? "all",
        category: str(opts.category),
        project: str(opts.project),
        repository: str(opts.repository),
        branch: str(opts.branch),
        commit: str(opts.commit),
        starred: Boolean(opts.starred),
        feedback: str(opts.feedback),
        level: str(opts.level),
        dateFrom: str(opts.dateFrom),
        dateTo: str(opts.dateTo),
        sort: opts.sort ?? "timestamp",
        order: opts.order ?? "desc",
      }),
    );

  program
    .command("lesson")
    .description("Show a single lesson in detail")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdLesson(id));

  program
    .command("star")
    .description("Mark a lesson as starred")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdStar(id, true));

  program
    .command("unstar")
    .description("Remove the starred mark from a lesson")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdStar(id, false));

  program
    .command("delete")
    .description("Permanently delete a lesson")
    .argument("<id>", "Lesson ID")
    .action((id: string) => cmdDelete(id));

  program
    .command("feedback")
    .description("Record know/dont_know feedback for a lesson")
    .argument("<id>", "Lesson ID")
    .argument("<value>", "know | dont_know | clear")
    .action((id: string, value: string) => cmdFeedback(id, value));

  program.command("settings").description("Show current settings").action(cmdSettings);

  program
    .command("stats")
    .description("Coaching statistics and rate-limit status")
    .action(cmdStats);

  program
    .command("set")
    .description("Update a setting (max_per_day | min_gap_minutes)")
    .argument("<key>", "Setting key")
    .argument("<value>", "New value")
    .action((key: string, value: string) => cmdSet(key, value));

  program
    .command("knowledge-add")
    .description("Add or update a topic in the knowledge map")
    .argument("<topic>", "Topic ID")
    .option("--confidence <n>", "Initial confidence 0-10", "5")
    .option("--group <group>", "Assign to a named group")
    .action((topic: string, opts: { confidence?: string; group?: string }) =>
      cmdKnowledgeAdd(
        topic,
        Math.max(0, Math.min(10, Number.parseInt(opts.confidence ?? "5", 10) || 5)),
        str(opts.group),
      ),
    );

  program
    .command("knowledge-remove")
    .description("Remove a topic from the knowledge map")
    .argument("<topic>", "Topic ID")
    .action((topic: string) => cmdKnowledgeRemove(topic));

  program
    .command("group-add")
    .description("Register a new knowledge group")
    .argument("<name>", "Group name")
    .action((name: string) => cmdGroupAdd(name));

  program
    .command("group-remove")
    .description("Delete a knowledge group (topics move to Other)")
    .argument("<name>", "Group name")
    .action((name: string) => cmdGroupRemove(name));

  program
    .command("group-assign")
    .description("Move a topic to a group")
    .argument("<topic>", "Topic ID")
    .argument("<group>", "Group name (use 'Other' to ungroup)")
    .action((topic: string, group: string) => cmdGroupAssign(topic, group));

  program
    .command("backup")
    .description("Export a full backup (settings + knowledge + lessons) as zip")
    .argument("[file]", "Output zip path", "devcoach-backup.zip")
    .action((file: string) => cmdBackup(file));

  program
    .command("restore")
    .description("Restore from a backup zip file")
    .argument("<file>", "Path to backup zip")
    .action((file: string) => cmdRestore(file));

  program
    .command("install")
    .description("Register the MCP server + Stop hooks + skill in Claude Code / Claude Desktop")
    .option("--claude-code", "Target Claude Code only")
    .option("--claude-desktop", "Target Claude Desktop only")
    .option("--force", "Overwrite existing devcoach entry")
    .option("--skip-hook", "Register MCP server only — skip the Stop hooks")
    .action(
      (opts: {
        claudeCode?: boolean;
        claudeDesktop?: boolean;
        force?: boolean;
        skipHook?: boolean;
      }) =>
        cmdInstall({
          claudeCode: Boolean(opts.claudeCode),
          claudeDesktop: Boolean(opts.claudeDesktop),
          force: Boolean(opts.force),
          skipHook: Boolean(opts.skipHook),
        }),
    );

  program
    .command("doctor")
    .description("Diagnose the devcoach ⇄ Claude Code wiring and the lesson pacing state")
    .action(cmdDoctor);

  program
    .command("ui")
    .description("Launch the web dashboard")
    .option("--port <port>", "Port", "7860")
    .action(async (opts: { port?: string }) => {
      const { startUi } = await import("../web/app");
      startUi(Number.parseInt(opts.port ?? "7860", 10) || 7860);
    });

  program
    .command("setup")
    .description("First-run wizard: import backup or build your knowledge profile")
    .action(cmdSetup);

  // Hooks — hidden from help; exit 0 always (silent, or a JSON directive on stdout).
  // Wrapped in arrows: Commander passes (options, command) to actions, which would
  // otherwise clobber the HookPayload default parameter.
  program
    .command("stop-hook", { hidden: true })
    .description("Claude Code Stop hook: onboarding check + lesson cue in one spawn")
    .action(() => cmdStopHook());
  program
    .command("prompt-hook", { hidden: true })
    .description("Claude Code UserPromptSubmit hook: prime the model when a lesson is due")
    .action(() => cmdPromptHook());
  program
    .command("onboard-hook", { hidden: true })
    .description("Claude Code Stop hook: cue onboarding (legacy two-entry layout)")
    .action(() => cmdOnboardHook());
  program
    .command("lesson-ready", { hidden: true })
    .description("Claude Code Stop hook: signal a lesson is due (legacy two-entry layout)")
    .action(() => cmdLessonReady());

  return program;
}

export async function runCli(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const code = (err as { code?: string }).code ?? "";
    // Only Commander's own errors are handled here. Anything else (a real handler error, or a
    // handler that already called process.exit) propagates untouched.
    if (!code.startsWith("commander.")) throw err;
    // Help/version are not errors — Commander already wrote the output; exit cleanly.
    if (
      code === "commander.helpDisplayed" ||
      code === "commander.help" ||
      code === "commander.version"
    ) {
      return;
    }
    // Parse/usage errors: Commander already printed a friendly message; exit 2.
    process.exit(2);
  }
}
