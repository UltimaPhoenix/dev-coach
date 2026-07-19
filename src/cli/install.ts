// Install + doctor: the per-client config writers (Claude Code / Claude Desktop are the
// stable defaults; Gemini CLI and Codex CLI are beta targets) and the read-only wiring
// diagnosis. All three CLI clients share the same hook JSON layout ({hooks: {Event:
// [{hooks: [{type:"command", …}]}]}}), so one self-healing upsert serves every config
// file; what differs per client is only the file path, the event names, and the
// timeout unit (Claude/Codex: seconds, Gemini: milliseconds).
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import * as coach from "../core/coach";
import * as db from "../core/db";
import { readSkill, readSkillReferences } from "../skill";
import { VERSION } from "../version";
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

/**
 * Register the MCP server through a beta client's own CLI (`gemini mcp add` / `codex
 * mcp add`) — the client then owns scope and file placement. Returns "" when the
 * client binary is not on PATH so the caller can fall back. (`installViaClaudeCli`
 * stays separate to keep its long-standing output byte-stable.)
 */
function installViaClientCli(bin: string, addArgs: string[], removeArgs: string[] | null): string {
  if (!onPath(bin)) return "";
  if (removeArgs) spawnSync(bin, removeArgs, { encoding: "utf8" });
  const res = spawnSync(bin, addArgs, { encoding: "utf8" });
  if (res.status === 0) return `${c.green("✓")} Registered via \`${bin} mcp add\``;
  const combined = `${res.stderr ?? ""}${res.stdout ?? ""}`.toLowerCase();
  if (combined.includes("already")) {
    return `${c.yellow("Already registered")} in ${bin} (use --force to overwrite)`;
  }
  return `${c.red(`${bin} mcp add failed:`)} ${(res.stderr || res.stdout || "").trim()}`;
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

/** True when the devcoach Claude Code plugin is enabled — it ships the same hooks. */
function pluginHooksActive(data: HooksFile): boolean {
  return Object.entries(data.enabledPlugins ?? {}).some(
    ([name, enabled]) => enabled && name.startsWith("devcoach@"),
  );
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

// ── Install ──────────────────────────────────────────────────────────────────

export interface InstallOpts {
  claudeCode: boolean;
  claudeDesktop: boolean;
  gemini: boolean;
  codex: boolean;
  force: boolean;
  skipHook: boolean;
}

export function cmdInstall(o: InstallOpts): void {
  // Bare `devcoach install` keeps its original meaning: the Claude pair. The beta
  // targets (--gemini, --codex) are opt-in and can be combined with any other flag.
  const anyExplicit = o.claudeCode || o.claudeDesktop || o.gemini || o.codex;
  const doCode = o.claudeCode || !anyExplicit;
  const doDesktop = o.claudeDesktop || !anyExplicit;
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
    log(`  Skill…       ${installSkillTo(CLAUDE_CODE_SKILL_DIR, o.force)}`);
    log();
  }

  if (doDesktop) {
    log(c.bold("Claude Desktop"));
    log(`  MCP server…  ${installTo(claudeDesktopConfigPath(), m, o.force)}`);
    needsRestart = true;
    log();
  }

  if (o.gemini) {
    log(c.bold("Gemini CLI (beta)"));
    let msg = installViaClientCli(
      "gemini",
      ["mcp", "add", "-s", "user", "devcoach", m.command, ...m.args],
      o.force ? ["mcp", "remove", "-s", "user", "devcoach"] : null,
    );
    if (!msg) msg = installTo(GEMINI_SETTINGS, m, o.force);
    log(`  MCP server…  ${msg}`);
    if (!o.skipHook) log(`  Hooks…       ${installGeminiHook()}`);
    log(`  Skill…       ${installGeminiSkill(o.force)}`);
    log();
  }

  if (o.codex) {
    log(c.bold("Codex CLI (beta)"));
    let msg = installViaClientCli(
      "codex",
      ["mcp", "add", "devcoach", "--", m.command, ...m.args],
      o.force ? ["mcp", "remove", "devcoach"] : null,
    );
    if (!msg) {
      // Codex stores MCP servers in TOML, which devcoach deliberately does not write —
      // hand the user the exact snippet instead of risking their config.
      msg =
        `${c.yellow("Manual step")} — codex CLI not found. Add to ${CODEX_CONFIG_TOML}:\n` +
        `                 [mcp_servers.devcoach]\n` +
        `                 command = "${m.command}"\n` +
        `                 args = [${m.args.map((a) => `"${a}"`).join(", ")}]`;
    }
    log(`  MCP server…  ${msg}`);
    if (!o.skipHook)
      log(`  Hooks…       ${upsertOwnedHooks(CODEX_HOOKS_JSON, desiredCodexHooks())}`);
    log(`  Skill…       ${installSkillTo(AGENTS_SKILL_DIR, o.force)}`);
    log(
      `  ${c.yellow("→")} Codex asks once to trust new hooks — approve devcoach on the next run.`,
    );
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
  if (read.data.mcpServers?.devcoach) r.ok("MCP server registered (settings.json)");
  else
    r.warn(
      "MCP server not found in settings.json — it may be registered elsewhere " +
        `(check with ${c.bold("gemini mcp list")})`,
    );
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
  // MCP config is TOML — a text scan is enough for a read-only diagnosis.
  const toml = existsSync(CODEX_CONFIG_TOML) ? readFileSync(CODEX_CONFIG_TOML, "utf8") : "";
  if (/\[mcp_servers\.devcoach\]/.test(toml)) r.ok("MCP server registered (config.toml)");
  else
    r.warn(
      "MCP server not found in config.toml — it may be registered elsewhere " +
        `(check with ${c.bold("codex mcp list")})`,
    );
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
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (nodeMajor >= 24) ok(`Node ${process.versions.node} (≥ 24)`);
  else bad(`Node ${process.versions.node} — devcoach needs Node ≥ 24 (embedded node:sqlite)`);

  log(c.bold("\nClaude Code wiring"));
  const read = readJsonFile<HooksFile>(CLAUDE_CODE_SETTINGS);
  if (!read.ok) {
    bad(`${CLAUDE_CODE_SETTINGS} is not valid JSON — hooks cannot run`);
  } else {
    const pluginOn = pluginHooksActive(read.data);
    const ours = collectDevcoachHooks(read.data);
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

    const mcpRead = readJsonFile<McpConfig>(join(homedir(), ".claude.json"));
    if (mcpRead.ok && mcpRead.data.mcpServers?.devcoach) ok("MCP server registered (user scope)");
    else
      warn(
        "MCP server not found in ~/.claude.json — it may be registered elsewhere " +
          `(check with ${c.bold("claude mcp get devcoach")})`,
      );
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
