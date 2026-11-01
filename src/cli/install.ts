// Install + doctor: the per-client config writers (Claude Code is the default target; Gemini
// CLI and Codex CLI are beta targets) and the read-only wiring diagnosis. devcoach wires two
// things into an agent — the hooks that cue a lesson and the skill that delivers it; the model
// then runs `devcoach api …` in the agent's shell. All three clients share the same hook JSON
// layout ({hooks: {Event: [{hooks: [{type:"command", …}]}]}}), so one self-healing upsert
// serves every config file; what differs per client is only the file path, the event names,
// and the timeout unit (Claude/Codex: seconds, Gemini: milliseconds).
//
// Up to 2.x devcoach also registered itself as an MCP server (Claude Code, Claude Desktop,
// Gemini, Codex). It no longer runs as one, so `install` and `uninstall` remove that old
// registration wherever they find it, and `doctor` warns about one left behind.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { describeRuntime, describeWhere } from "../core/runtime";
import { readSkill, readSkillReferences } from "../skill";
import { VERSION } from "../version";
import { resolveCommand } from "./path-lookup";
import { c } from "./term";

const log = (s = ""): void => {
  console.log(s);
};

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
interface HooksFile {
  hooks?: Record<string, HookEntry[] | undefined>;
  mcpServers?: Record<string, unknown>;
  enabledPlugins?: Record<string, boolean>;
  [k: string]: unknown;
}

/** Claude Desktop's config file — only ever read to remove the MCP entry a 2.x devcoach wrote. */
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
const CLAUDE_CODE_CONFIG = join(homedir(), ".claude.json");
const CLAUDE_CODE_SETTINGS = join(homedir(), ".claude", "settings.json");
const CLAUDE_CODE_SKILL_DIR = join(homedir(), ".claude", "skills", "devcoach");
const GEMINI_DIR = join(homedir(), ".gemini");
const GEMINI_SETTINGS = join(GEMINI_DIR, "settings.json");
const GEMINI_EXTENSION_MANIFEST = join(
  GEMINI_DIR,
  "extensions",
  "devcoach",
  "gemini-extension.json",
);
const CODEX_DIR = join(homedir(), ".codex");
const CODEX_HOOKS_JSON = join(CODEX_DIR, "hooks.json");
const CODEX_CONFIG_TOML = join(CODEX_DIR, "config.toml");
// The Agent Skills standard's cross-tool user directory: Codex reads it natively and
// Gemini CLI treats it as a precedence alias of ~/.gemini/skills — one copy serves both.
const AGENTS_SKILL_DIR = join(homedir(), ".agents", "skills", "devcoach");

// PATH lookups go through resolveCommand: `;`-separated with PATHEXT on Windows.
const findOnPath = (bin: string): string | null => resolveCommand(bin);
const onPath = (bin: string): boolean => findOnPath(bin) !== null;

/**
 * Hook command prefix. Hooks may run with a minimal GUI PATH, so prefer the absolute
 * binary path — except when the PATH hit lives in an ephemeral per-shell dir (fnm
 * multishells), where the bare name outlives the path. `npx -y devcoach` is the last
 * resort: it works everywhere but needs the npx cache (or network) on every stop — and
 * the only choice when the hit itself is npx's cache (`npx -y devcoach install`).
 */
function hookPrefix(): string {
  const hit = findOnPath("devcoach");
  if (!hit || hit.includes("/_npx/") || hit.includes("\\_npx\\")) return "npx -y devcoach";
  if (hit.includes("fnm_multishells")) return "devcoach";
  return hit.includes(" ") ? `"${hit}"` : hit;
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

/** The exact hook layout devcoach owns in Claude Code: one merged Stop entry + the priming hook. */
function desiredHooks(): Record<string, HookEntry> {
  const prefix = hookPrefix();
  return {
    Stop: { hooks: [{ type: "command", command: `${prefix} stop-hook`, timeout: 60 }] },
    UserPromptSubmit: {
      hooks: [{ type: "command", command: `${prefix} prompt-hook`, timeout: 30 }],
    },
  };
}

/** Gemini CLI's stop/prompt pair (AfterAgent/BeforeAgent) — timeouts in milliseconds. */
function desiredGeminiHooks(): Record<string, HookEntry> {
  const prefix = hookPrefix();
  return {
    AfterAgent: {
      hooks: [{ type: "command", command: `${prefix} gemini-stop-hook`, timeout: 60000 }],
    },
    BeforeAgent: {
      hooks: [{ type: "command", command: `${prefix} gemini-prompt-hook`, timeout: 30000 }],
    },
  };
}

/** Codex CLI cloned Claude Code's hook schema: same event names, timeouts in seconds. */
function desiredCodexHooks(): Record<string, HookEntry> {
  const prefix = hookPrefix();
  return {
    Stop: { hooks: [{ type: "command", command: `${prefix} codex-stop-hook`, timeout: 60 }] },
    UserPromptSubmit: {
      hooks: [{ type: "command", command: `${prefix} codex-prompt-hook`, timeout: 30 }],
    },
  };
}

/** The enabled devcoach Claude Code plugins (`devcoach@<marketplace>`), release and beta alike. */
function enabledDevcoachPlugins(data: HooksFile): string[] {
  return Object.entries(data.enabledPlugins ?? {})
    .filter(([name, enabled]) => enabled && name.startsWith("devcoach@"))
    .map(([name]) => name);
}

/** True when a devcoach Claude Code plugin is enabled — it ships the same hooks. */
function pluginHooksActive(data: HooksFile): boolean {
  return enabledDevcoachPlugins(data).length > 0;
}

/** True when the devcoach Gemini extension is installed — it ships the same hooks + skill. */
function geminiExtensionActive(): boolean {
  return existsSync(GEMINI_EXTENSION_MANIFEST);
}

/**
 * Match any devcoach hook command, past or present: the installed binary (`devcoach`,
 * `npx -y devcoach`) AND dev-tree layouts (`node …/dev-coach/dist/bin.js`), across every
 * hook-subcommand generation. A bare `includes("devcoach")` missed the dev-tree paths
 * (they spell it `dev-coach`), leaving stale entries behind to double-count interactions.
 * Require binary hint + subcommand so a user hook that merely mentions devcoach never
 * matches. The `-` in `gemini-stop-hook`/`codex-stop-hook` is a word boundary, so the
 * per-client subcommands match without widening the pattern.
 */
function isDevcoachHookCommand(cmd: string): boolean {
  return (
    /dev-?coach/i.test(cmd) && /\b(?:stop-hook|prompt-hook|onboard-hook|lesson-ready)\b/.test(cmd)
  );
}

/**
 * Install (or repair) a devcoach-owned hook pair in a client's JSON hooks file. The
 * entries are fully devcoach-owned — like the skill, a stale or legacy layout (two Stop
 * entries, npx prefix, missing timeout) is normalized WITHOUT --force; user hooks and
 * other events are untouched.
 */
function upsertOwnedHooks(path: string, desired: Record<string, HookEntry>): string {
  const read = readJsonFile<HooksFile>(path);
  if (!read.ok) return read.error;
  const data = read.data;
  data.hooks ??= {};
  const hooks = data.hooks;
  let changed = false;
  for (const [event, desiredEntry] of Object.entries(desired)) {
    hooks[event] ??= [];
    const list = hooks[event];
    const ours = list
      .map((e, i): [HookEntry, number] => [e, i])
      .filter(([e]) => (e.hooks ?? []).some((h) => isDevcoachHookCommand(h.command ?? "")))
      .map(([, i]) => i);
    const [only] = ours;
    if (
      ours.length === 1 &&
      only !== undefined &&
      JSON.stringify(list[only]) === JSON.stringify(desiredEntry)
    )
      continue;
    for (const i of ours.toReversed()) list.splice(i, 1);
    list.push(desiredEntry);
    changed = true;
  }
  if (!changed) return `${c.yellow("Already installed")} in ${path} (current layout)`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return `${c.green("✓")} Hooks installed into ${path} (${Object.keys(desired).join(" + ")})`;
}

function installHook(): string {
  const read = readJsonFile<HooksFile>(CLAUDE_CODE_SETTINGS);
  if (!read.ok) return read.error;
  if (pluginHooksActive(read.data)) {
    return (
      `${c.yellow("Skipped")} — the devcoach plugin already provides the hooks ` +
      "(installing both would double-count interactions)"
    );
  }
  return upsertOwnedHooks(CLAUDE_CODE_SETTINGS, desiredHooks());
}

function installGeminiHook(): string {
  if (geminiExtensionActive()) {
    return (
      `${c.yellow("Skipped")} — the devcoach Gemini extension already provides the hooks ` +
      "(installing both would double-count interactions)"
    );
  }
  return upsertOwnedHooks(GEMINI_SETTINGS, desiredGeminiHooks());
}

// ── Skill ────────────────────────────────────────────────────────────────────
// A skill dir (~/.claude/skills/devcoach, ~/.agents/skills/devcoach) is fully owned by
// devcoach (content = bundled assets/SKILL.md), so an outdated copy is refreshed without
// --force — that is the whole point of re-running `devcoach install` after an upgrade
// (npm, Homebrew, …). The `.devcoach-version` stamp is per-dir.

type SkillStatus = "missing" | "outdated" | "current";

function skillStatusAt(dir: string): SkillStatus {
  if (!existsSync(join(dir, "SKILL.md"))) return "missing";
  try {
    if (readFileSync(join(dir, ".devcoach-version"), "utf8").trim() === VERSION) return "current";
  } catch {
    // no readable stamp → predates version stamping → outdated
  }
  return "outdated";
}

function installSkillTo(dir: string, force: boolean): string {
  if (!force && skillStatusAt(dir) === "current") {
    return `${c.yellow("Already installed")} in ${dir} (current version)`;
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), readSkill());
  const refs = readSkillReferences();
  if (refs.length) {
    const refDir = join(dir, "references");
    mkdirSync(refDir, { recursive: true });
    for (const ref of refs) writeFileSync(join(refDir, ref.name), ref.content);
  }
  writeFileSync(join(dir, ".devcoach-version"), `${VERSION}\n`);
  return `${c.green("✓")} Installed into ${dir}`;
}

function installGeminiSkill(force: boolean): string {
  if (geminiExtensionActive()) {
    return `${c.yellow("Skipped")} — bundled with the devcoach Gemini extension`;
  }
  return installSkillTo(AGENTS_SKILL_DIR, force);
}

/** True when a devcoach hook is wired for `event` in the JSON hooks file at `path`. */
function hasDevcoachHooks(path: string, event: string): boolean {
  const read = readJsonFile<HooksFile>(path);
  return (
    read.ok &&
    (read.data.hooks?.[event] ?? []).some((e) =>
      (e.hooks ?? []).some((h) => isDevcoachHookCommand(h.command ?? "")),
    )
  );
}

/** One-line upgrade hint for the welcome screen and `stats` — empty string when nothing to say. */
export function skillHint(): string {
  const targets: { name: string; dir: string; cmd: string; hooked: () => boolean }[] = [
    {
      name: "Claude Code",
      dir: CLAUDE_CODE_SKILL_DIR,
      cmd: "devcoach install",
      hooked: () => hasDevcoachHooks(CLAUDE_CODE_SETTINGS, "Stop"),
    },
    {
      // Gemini and Codex read the same ~/.agents/skills copy — one hint covers both.
      name: "Gemini/Codex",
      dir: AGENTS_SKILL_DIR,
      cmd: "devcoach install --gemini (or --codex)",
      hooked: () =>
        hasDevcoachHooks(GEMINI_SETTINGS, "AfterAgent") ||
        hasDevcoachHooks(CODEX_HOOKS_JSON, "Stop"),
    },
  ];
  for (const t of targets) {
    const status = skillStatusAt(t.dir);
    if (status === "outdated") {
      return `${c.yellow("→")} The devcoach ${t.name} skill is out of date — run ${c.bold(t.cmd)} to refresh it.`;
    }
    // Only nudge users who already wired devcoach hooks for the target: others would
    // see a false alarm.
    if (status === "missing" && t.hooked()) {
      return `${c.yellow("→")} The devcoach ${t.name} skill is not installed — run ${c.bold(t.cmd)} to add it.`;
    }
  }
  return "";
}

// ── Old MCP registrations ────────────────────────────────────────────────────
// A devcoach older than 3.0 registered itself as an MCP server. A host that still starts
// `devcoach mcp` only sees it exit with the reason, so both `install` and `uninstall` take the
// entry away: through the client's own CLI when it is on PATH (its bookkeeping stays
// consistent), straight from the JSON file otherwise. Nothing is spawned when the file has
// no entry — the common case on every install.

/** What became of one registration. `none` = there was nothing to remove. */
interface McpCleanup {
  status: "removed" | "none" | "manual" | "failed";
  message: string;
}

const notRegistered = (where: string): McpCleanup => ({
  status: "none",
  message: `${c.yellow("Not registered")} in ${where}`,
});

/** True when `mcpServers.devcoach` is in the JSON config at `path`. */
function hasMcpEntry(path: string): boolean {
  const read = readJsonFile<McpConfig>(path);
  return read.ok && Boolean(read.data.mcpServers?.devcoach);
}

/** True when Codex's config.toml has a `[mcp_servers.devcoach]` table (a text scan is enough). */
function hasCodexMcpEntry(): boolean {
  try {
    return /\[mcp_servers\.devcoach\]/.test(readFileSync(CODEX_CONFIG_TOML, "utf8"));
  } catch {
    return false;
  }
}

/** Remove `mcpServers.devcoach` from a JSON config file; other keys are untouched. */
function removeMcpEntry(path: string): McpCleanup {
  if (!existsSync(path)) {
    return { status: "none", message: `${c.yellow("Not registered")} (${path} does not exist)` };
  }
  const read = readJsonFile<McpConfig>(path);
  if (!read.ok) return { status: "failed", message: read.error };
  const servers = read.data.mcpServers;
  if (!servers?.devcoach) return notRegistered(path);
  delete servers.devcoach;
  writeFileSync(path, `${JSON.stringify(read.data, null, 2)}\n`);
  return { status: "removed", message: `${c.green("✓")} Removed from ${path}` };
}

/** Unregister through a client's own CLI; null when the binary is not on PATH (caller falls back). */
function removeViaClientCli(bin: string, removeArgs: string[]): McpCleanup | null {
  if (!onPath(bin)) return null;
  const res = spawnSync(bin, removeArgs, { encoding: "utf8" });
  const combined = `${res.stderr ?? ""}${res.stdout ?? ""}`.toLowerCase();
  if (res.status === 0) {
    return { status: "removed", message: `${c.green("✓")} Removed via \`${bin} mcp remove\`` };
  }
  if (/not found|no .*server|does not exist|no such/.test(combined)) return notRegistered(bin);
  return {
    status: "failed",
    message: `${c.red(`${bin} mcp remove failed:`)} ${(res.stderr || res.stdout || "").trim()}`,
  };
}

/** The old entry in a JSON config: the client's CLI removes it when present, else the file is edited. */
function removeJsonMcp(path: string, bin: string, removeArgs: string[]): McpCleanup {
  if (!hasMcpEntry(path)) return removeMcpEntry(path); // says why there is nothing to do
  const viaCli = removeViaClientCli(bin, removeArgs);
  // The CLI's bookkeeping can differ from the file (another scope, an older layout): when it
  // knows no such server but the file still carries one, the file is what the host reads.
  return viaCli && viaCli.status !== "none" ? viaCli : removeMcpEntry(path);
}

function removeClaudeCodeMcp(): McpCleanup {
  return removeJsonMcp(CLAUDE_CODE_CONFIG, "claude", [
    "mcp",
    "remove",
    "--scope",
    "user",
    "devcoach",
  ]);
}

function removeGeminiMcp(): McpCleanup {
  return removeJsonMcp(GEMINI_SETTINGS, "gemini", ["mcp", "remove", "-s", "user", "devcoach"]);
}

/** Codex keeps MCP servers in TOML, which devcoach never writes: its CLI removes the entry, or the user does. */
function removeCodexMcp(): McpCleanup {
  if (!hasCodexMcpEntry()) return notRegistered(CODEX_CONFIG_TOML);
  return (
    removeViaClientCli("codex", ["mcp", "remove", "devcoach"]) ?? {
      status: "manual",
      message:
        `${c.yellow("Manual step")} — codex CLI not found. Delete the [mcp_servers.devcoach] table ` +
        `from ${CODEX_CONFIG_TOML}: devcoach no longer runs as an MCP server`,
    }
  );
}

// ── Install ──────────────────────────────────────────────────────────────────

export interface InstallOpts {
  claudeCode: boolean;
  gemini: boolean;
  codex: boolean;
  force: boolean;
  skipHook: boolean;
}

export function cmdInstall(o: InstallOpts): void {
  // Bare `devcoach install` keeps its original meaning: Claude Code. The beta targets
  // (--gemini, --codex) are opt-in and can be combined with any other flag.
  const anyExplicit = o.claudeCode || o.gemini || o.codex;
  const doCode = o.claudeCode || !anyExplicit;
  let desktopRemoved = false;
  // Printed only when there was something to take away: a fresh install has no old entry.
  const oldMcp = (cleanup: McpCleanup): void => {
    if (cleanup.status !== "none") log(`  Old MCP…     ${cleanup.message}`);
  };

  log(c.bold("Setting up devcoach"));
  log();

  if (doCode) {
    log(c.bold("Claude Code"));
    if (!o.skipHook) log(`  Hooks…       ${installHook()}`);
    log(`  Skill…       ${installSkillTo(CLAUDE_CODE_SKILL_DIR, o.force)}`);
    oldMcp(removeClaudeCodeMcp());
    const desktop = removeMcpEntry(claudeDesktopConfigPath());
    oldMcp(desktop);
    desktopRemoved = desktop.status === "removed";
    log();
  }

  if (o.gemini) {
    log(c.bold("Gemini CLI (beta)"));
    if (!o.skipHook) log(`  Hooks…       ${installGeminiHook()}`);
    log(`  Skill…       ${installGeminiSkill(o.force)}`);
    oldMcp(removeGeminiMcp());
    log();
  }

  if (o.codex) {
    log(c.bold("Codex CLI (beta)"));
    if (!o.skipHook)
      log(`  Hooks…       ${upsertOwnedHooks(CODEX_HOOKS_JSON, desiredCodexHooks())}`);
    log(`  Skill…       ${installSkillTo(AGENTS_SKILL_DIR, o.force)}`);
    oldMcp(removeCodexMcp());
    log(
      `  ${c.yellow("→")} Codex asks once to trust new hooks — approve devcoach on the next run.`,
    );
    log();
  }

  if (desktopRemoved)
    log(`${c.yellow("→")} Restart Claude Desktop to drop the old server entry.\n`);
  log(
    c.dim(
      "Tip: run devcoach backup to export your profile, lessons and settings.\n" +
        "     run devcoach restore <file> to import a backup on a new machine.\n" +
        "     After upgrading devcoach (npm, Homebrew), re-run devcoach install to refresh the skill.",
    ),
  );
}

// ── Doctor ───────────────────────────────────────────────────────────────────

type Reporter = {
  ok: (s: string) => void;
  warn: (s: string) => void;
  bad: (s: string) => void;
};

/** Collect every devcoach hook entry from a JSON hooks file, keyed by event. */
function collectDevcoachHooks(data: HooksFile): { event: string; cmd: HookCmd }[] {
  const ours: { event: string; cmd: HookCmd }[] = [];
  for (const [event, entries] of Object.entries(data.hooks ?? {})) {
    for (const e of entries ?? []) {
      for (const h of e.hooks ?? []) {
        if (isDevcoachHookCommand(h.command ?? "")) ours.push({ event, cmd: h });
      }
    }
  }
  return ours;
}

/** Shared per-command sanity checks (binary exists, npx warning, timeout present). */
function checkHookCommands(
  r: Reporter,
  ours: { event: string; cmd: HookCmd }[],
  fix: string,
): void {
  for (const { cmd } of ours) {
    const bin = cmd.command.split(" ")[0] ?? "";
    if (bin.startsWith("/") && !existsSync(bin))
      r.bad(`hook command not found: ${bin} — re-run ${c.bold(fix)}`);
    if (cmd.command.startsWith("npx "))
      r.warn("hook runs via npx — needs the npx cache (or network) on every stop");
    if (cmd.timeout == null) r.warn(`hook entry has no timeout (${cmd.command})`);
  }
}

/** A registration from before 3.0 that was never cleaned up — `install` takes it away. */
function warnStaleMcp(r: Reporter, file: string, fix: string): void {
  r.warn(
    `a devcoach MCP server is still registered in ${file} — devcoach no longer runs as one; ` +
      `run ${c.bold(fix)} to remove it`,
  );
}

/**
 * The skill runs `devcoach api …` with the agent's shell tool, so the command must resolve
 * there: the plugin puts its bin/devcoach on that PATH while it is enabled; a Homebrew or npm
 * install puts the real one on the user's. Without either the skill falls back to npx.
 */
function checkDevcoachCommand(r: Reporter, pluginOn: boolean): void {
  const hit = findOnPath("devcoach");
  if (pluginOn) {
    r.ok(
      "`devcoach` command provided by the plugin (bin/devcoach)" +
        (hit ? `, also on this shell's PATH (${hit})` : ""),
    );
  } else if (hit) r.ok(`\`devcoach\` command on PATH (${hit})`);
  else
    r.warn(
      "`devcoach` is not on this shell's PATH — the skill runs `devcoach api …` in the agent's " +
        "shell: install it with Homebrew or `npm i -g devcoach`, or it falls back to `npx -y devcoach`",
    );
}

function doctorGemini(r: Reporter): void {
  log(c.bold("\nGemini CLI wiring (beta)"));
  const read = readJsonFile<HooksFile>(GEMINI_SETTINGS);
  const extOn = geminiExtensionActive();
  if (!read.ok) {
    r.bad(`${GEMINI_SETTINGS} is not valid JSON — hooks cannot run`);
    return;
  }
  const ours = collectDevcoachHooks(read.data);
  if (extOn && ours.length) {
    r.bad(
      "devcoach hooks are registered TWICE (extension + settings.json) — interactions are " +
        "double-counted. Uninstall the extension or remove the settings.json entries.",
    );
  } else if (extOn) {
    r.ok("hooks provided by the devcoach Gemini extension");
  } else if (!ours.length) {
    r.warn(`no devcoach hooks in ${GEMINI_SETTINGS} — run ${c.bold("devcoach install --gemini")}`);
  } else {
    if (ours.some((o) => o.event === "AfterAgent")) r.ok("AfterAgent stop hook wired");
    else r.warn(`no AfterAgent stop hook — run ${c.bold("devcoach install --gemini")}`);
    if (ours.some((o) => o.event === "BeforeAgent")) r.ok("BeforeAgent priming hook wired");
    else
      r.warn(
        `no BeforeAgent priming hook — run ${c.bold("devcoach install --gemini")} ` +
          "(lessons land more reliably)",
      );
    checkHookCommands(r, ours, "devcoach install --gemini");
  }
  const skill = skillStatusAt(AGENTS_SKILL_DIR);
  if (extOn) r.ok("skill bundled with the devcoach Gemini extension");
  else if (skill === "current") r.ok("skill installed (~/.agents/skills, current version)");
  else if (skill === "outdated")
    r.warn(`skill is out of date — run ${c.bold("devcoach install --gemini")}`);
  else r.warn(`skill not installed — run ${c.bold("devcoach install --gemini")}`);
  if (read.data.mcpServers?.devcoach) warnStaleMcp(r, GEMINI_SETTINGS, "devcoach install --gemini");
}

function doctorCodex(r: Reporter): void {
  log(c.bold("\nCodex CLI wiring (beta)"));
  const read = readJsonFile<HooksFile>(CODEX_HOOKS_JSON);
  if (!read.ok) {
    r.bad(`${CODEX_HOOKS_JSON} is not valid JSON — hooks cannot run`);
    return;
  }
  const ours = collectDevcoachHooks(read.data);
  if (!ours.length) {
    r.warn(`no devcoach hooks in ${CODEX_HOOKS_JSON} — run ${c.bold("devcoach install --codex")}`);
  } else {
    if (ours.some((o) => o.event === "Stop")) r.ok("Stop hook wired");
    else r.warn(`no Stop hook — run ${c.bold("devcoach install --codex")}`);
    if (ours.some((o) => o.event === "UserPromptSubmit"))
      r.ok("UserPromptSubmit priming hook wired");
    else
      r.warn(
        `no UserPromptSubmit priming hook — run ${c.bold("devcoach install --codex")} ` +
          "(lessons land more reliably)",
      );
    checkHookCommands(r, ours, "devcoach install --codex");
    r.warn("Codex runs hooks only after you trust them once — check the prompt on the next run");
  }
  const skill = skillStatusAt(AGENTS_SKILL_DIR);
  if (skill === "current") r.ok("skill installed (~/.agents/skills, current version)");
  else if (skill === "outdated")
    r.warn(`skill is out of date — run ${c.bold("devcoach install --codex")}`);
  else r.warn(`skill not installed — run ${c.bold("devcoach install --codex")}`);
  if (hasCodexMcpEntry()) warnStaleMcp(r, CODEX_CONFIG_TOML, "devcoach install --codex");
}

/**
 * Read-only diagnosis of the devcoach ⇄ agent wiring (Claude Code always; Gemini CLI
 * and Codex CLI when their config dirs exist), ending with a verdict on whether the
 * next eligible stop would cue a lesson and why. Always exits 0 — doctor reports
 * problems, it never is one.
 */
export function cmdDoctor(): void {
  const r: Reporter = {
    ok: (s: string): void => log(`  ${c.green("✓")} ${s}`),
    warn: (s: string): void => log(`  ${c.yellow("→")} ${s}`),
    bad: (s: string): void => log(`  ${c.red("✗")} ${s}`),
  };
  const { ok, warn, bad } = r;

  log(`\n${c.bold("devcoach doctor")} ${c.dim(`v${VERSION}`)}\n`);

  log(c.bold("Environment"));
  const runtime = describeRuntime();
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor >= 24) ok(`Node ${process.versions.node} via ${runtime.nodeManager} (≥ 24)`);
  else bad(`Node ${process.versions.node} — devcoach needs Node ≥ 24 (embedded node:sqlite)`);
  ok(`this devcoach: ${describeWhere(runtime.where)} (${runtime.entry})`);
  // Set by the plugin / extension launcher (assets/launcher/launch.mjs): which host started this
  // process and where its pinned runtime lives. Reaching this line at all means it loaded.
  if (process.env.DEVCOACH_LAUNCHER) ok(`Runtime: ${process.env.DEVCOACH_LAUNCHER}`);

  log(c.bold("\nClaude Code wiring"));
  const read = readJsonFile<HooksFile>(CLAUDE_CODE_SETTINGS);
  if (!read.ok) {
    bad(`${CLAUDE_CODE_SETTINGS} is not valid JSON — hooks cannot run`);
  } else {
    const pluginOn = pluginHooksActive(read.data);
    const ours = collectDevcoachHooks(read.data);
    const plugins = enabledDevcoachPlugins(read.data);
    if (plugins.length > 1) {
      // Release + beta channel both on: each ships the Stop hooks, so every stop counts twice.
      bad(
        `${plugins.length} devcoach plugins enabled (${plugins.join(", ")}) — their hooks fire ` +
          "twice and interactions are double-counted. Keep one enabled (/plugin).",
      );
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
      const stopCount = ours.filter((o) => o.event === "Stop").length;
      if (legacy.length)
        warn(
          `legacy two-entry Stop layout — run ${c.bold("devcoach install")} to merge into one ` +
            "stop-hook entry (fewer spawns per stop)",
        );
      else if (stopCount > 1)
        warn(
          `${stopCount} devcoach Stop entries — interactions are counted ${stopCount}× per stop; ` +
            `run ${c.bold("devcoach install")} to keep only the current one`,
        );
      else ok(`Stop hook wired (${stopCount} entry)`);
      if (!ours.some((o) => o.event === "UserPromptSubmit"))
        warn(
          `no UserPromptSubmit priming hook — run ${c.bold("devcoach install")} to add it ` +
            "(lessons land more reliably)",
        );
      else ok("UserPromptSubmit priming hook wired");
      checkHookCommands(r, ours, "devcoach install");
    }

    const skill = skillStatusAt(CLAUDE_CODE_SKILL_DIR);
    if (skill === "current") ok("Claude Code skill installed (current version)");
    else if (pluginOn) ok("Claude Code skill bundled with the plugin");
    else if (skill === "outdated")
      warn(`Claude Code skill is out of date — run ${c.bold("devcoach install")}`);
    else warn(`Claude Code skill not installed — run ${c.bold("devcoach install")}`);

    checkDevcoachCommand(r, pluginOn);
    if (hasMcpEntry(CLAUDE_CODE_CONFIG)) warnStaleMcp(r, CLAUDE_CODE_CONFIG, "devcoach install");
    const desktopConfig = claudeDesktopConfigPath();
    if (hasMcpEntry(desktopConfig)) warnStaleMcp(r, desktopConfig, "devcoach install");
  }

  // The beta targets appear only when their config dir exists — a Claude-only setup
  // keeps the exact pre-0.10 doctor output.
  if (existsSync(GEMINI_DIR)) doctorGemini(r);
  if (existsSync(CODEX_DIR)) doctorCodex(r);

  log(c.bold("\nDatabase & pacing"));
  if (!existsSync(db.DB_PATH)) {
    warn(`no database yet (${db.DB_PATH}) — onboarding runs on the first technical task`);
    log();
    return;
  }
  try {
    db.withConnection((conn) => {
      ok(`database opens (${db.DB_PATH})`);
      const compat = db.compatOf(conn);
      if (compat) {
        bad(db.readOnlyMessage(compat));
        log(
          `    this build is READ-ONLY on it: hooks cannot count interactions, lessons cannot be ` +
            `saved — update this install (brew upgrade devcoach / npm, or the plugin) or run the newer channel`,
        );
      } else {
        const meta = db.getSchemaMeta(conn);
        ok(
          `schema v${db.SCHEMA_VERSION}` +
            (meta.upgradedBy ? `, last upgraded by devcoach ${meta.upgradedBy}` : ""),
        );
      }
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

// ── Uninstall ────────────────────────────────────────────────────────────────
// The exact inverse of `install`: every devcoach-owned entry (hook entries, skill dirs, and
// the MCP registration an older devcoach wrote) is removed from each client, user content is
// never touched, and the coaching data survives unless --data is given. Homebrew formulae have
// no uninstall hook, so `brew uninstall` cannot run this — the formula's caveats point here.

/** Drop every devcoach-owned hook entry from a client's JSON hooks file; user hooks stay. */
function removeOwnedHooks(path: string): string {
  if (!existsSync(path)) return `${c.yellow("No hooks")} (${path} does not exist)`;
  const read = readJsonFile<HooksFile>(path);
  if (!read.ok) return read.error;
  const hooks = read.data.hooks ?? {};
  const cleared: string[] = [];
  for (const [event, list] of Object.entries(hooks)) {
    if (!list) continue;
    const kept = list.filter(
      (e) => !(e.hooks ?? []).some((h) => isDevcoachHookCommand(h.command ?? "")),
    );
    if (kept.length === list.length) continue;
    cleared.push(event);
    if (kept.length) hooks[event] = kept;
    else delete hooks[event];
  }
  if (cleared.length === 0) return `${c.yellow("No devcoach hooks")} in ${path}`;
  if (Object.keys(hooks).length === 0) delete read.data.hooks;
  writeFileSync(path, `${JSON.stringify(read.data, null, 2)}\n`);
  return `${c.green("✓")} Hooks removed from ${path} (${cleared.join(" + ")})`;
}

/** Delete a devcoach-owned skill directory (only ever one devcoach writes itself). */
function removeSkillDir(dir: string): string {
  if (!existsSync(join(dir, "SKILL.md"))) return `${c.yellow("Not installed")} (${dir})`;
  rmSync(dir, { recursive: true, force: true });
  return `${c.green("✓")} Removed ${dir}`;
}

export interface UninstallOpts {
  claudeCode: boolean;
  gemini: boolean;
  codex: boolean;
  all: boolean;
  data: boolean;
  yes: boolean;
}

async function confirmDeleteData(yes: boolean): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    log(
      `${c.yellow("→")} Not a terminal — pass --yes to delete ${db.DEVCOACH_DIR} without a prompt.`,
    );
    return false;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Delete ${db.DEVCOACH_DIR} — every lesson, your profile and the notebook? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function cmdUninstall(o: UninstallOpts): Promise<void> {
  // Bare `devcoach uninstall` mirrors bare `install`: Claude Code. --all covers every client.
  const anyExplicit = o.claudeCode || o.gemini || o.codex;
  const doCode = o.all || o.claudeCode || !anyExplicit;
  const doGemini = o.all || o.gemini;
  const doCodex = o.all || o.codex;

  log(c.bold("Removing devcoach from your agents"));
  log();

  if (doCode) {
    log(c.bold("Claude Code"));
    const settings = readJsonFile<HooksFile>(CLAUDE_CODE_SETTINGS);
    if (settings.ok && pluginHooksActive(settings.data)) {
      log(
        `  ${c.yellow("→")} The devcoach plugin is enabled — its hooks, skill and command go away with ` +
          "/plugin uninstall devcoach; only user-level entries are removed here.",
      );
    }
    log(`  Hooks…       ${removeOwnedHooks(CLAUDE_CODE_SETTINGS)}`);
    log(`  Skill…       ${removeSkillDir(CLAUDE_CODE_SKILL_DIR)}`);
    log(`  Old MCP…     ${removeClaudeCodeMcp().message}`);
    // Claude Desktop's file only ever held the entry a 2.x `install` wrote — silence when it has none.
    const desktop = removeMcpEntry(claudeDesktopConfigPath());
    if (desktop.status !== "none") log(`  Old MCP…     ${desktop.message}`);
    if (desktop.status === "removed")
      log(`  ${c.yellow("→")} Restart Claude Desktop to drop the server.`);
    log();
  }

  if (doGemini) {
    log(c.bold("Gemini CLI (beta)"));
    log(`  Hooks…       ${removeOwnedHooks(GEMINI_SETTINGS)}`);
    log(`  Old MCP…     ${removeGeminiMcp().message}`);
    if (geminiExtensionActive()) {
      log(
        `  ${c.yellow("→")} The devcoach Gemini extension is installed — remove it with: gemini extensions uninstall devcoach`,
      );
    }
    log();
  }

  if (doCodex) {
    log(c.bold("Codex CLI (beta)"));
    log(`  Hooks…       ${removeOwnedHooks(CODEX_HOOKS_JSON)}`);
    log(`  Old MCP…     ${removeCodexMcp().message}`);
    log();
  }

  if (doGemini || doCodex) {
    // Gemini and Codex share ~/.agents/skills/devcoach: keep it while the other client still uses it.
    const stillUsed =
      (!doGemini && hasDevcoachHooks(GEMINI_SETTINGS, "AfterAgent")) ||
      (!doCodex && hasDevcoachHooks(CODEX_HOOKS_JSON, "Stop"));
    log(c.bold("Shared skill (Gemini + Codex)"));
    log(
      `  Skill…       ${stillUsed ? `${c.yellow("Kept")} — still used by the other client (${AGENTS_SKILL_DIR})` : removeSkillDir(AGENTS_SKILL_DIR)}`,
    );
    log();
  }

  if (o.data) {
    log(c.bold("Coaching data"));
    if (!existsSync(db.DEVCOACH_DIR)) {
      log(`  ${c.yellow("Nothing to delete")} (${db.DEVCOACH_DIR} does not exist)`);
    } else if (await confirmDeleteData(o.yes)) {
      rmSync(db.DEVCOACH_DIR, { recursive: true, force: true });
      log(`  ${c.green("✓")} Deleted ${db.DEVCOACH_DIR}`);
    } else {
      log(`  ${c.yellow("Kept")} ${db.DEVCOACH_DIR}`);
    }
    log();
  } else {
    log(
      c.dim(
        `Your lessons, profile and notebook are still in ${db.DEVCOACH_DIR} — keep them for a\n` +
          "reinstall, or delete them with: devcoach uninstall --data  (devcoach backup first).",
      ),
    );
  }
  log(
    c.dim(
      "Then remove the program itself: brew uninstall devcoach · npm uninstall -g devcoach\n" +
        "(npx: nothing to remove).",
    ),
  );
}
