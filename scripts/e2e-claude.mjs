#!/usr/bin/env node
// End-to-end tests against REAL headless Claude Code sessions: every way devcoach gets installed,
// crossed with the kinds of session a user actually has (first one ever, explicit setup, a lesson,
// small talk, plan mode, a restored backup, a server that is not there).
// Local-only (needs an authenticated `claude` CLI and SPENDS TOKENS) — never run in CI.
//
//   npm run test:e2e                     the smoke set (see SMOKE below)
//   npm run test:e2e -- --all            the whole grid
//   npm run test:e2e -- --list           what exists, and how many claude calls each run makes
//   npm run test:e2e -- --only plugin-tree:fresh-cue,mcp-entry:lesson
//   E2E_MODEL=haiku npm run test:e2e     a cheaper model (default: the CLI's own default)
//   … --keep                             keep the sandboxes for inspection
//
// Isolation: every scenario gets its own sandbox — DEVCOACH_DIR (database, notebook),
// DEVCOACH_CLAUDE_DIR (an empty history for the onboarding scan), DEVCOACH_RUNTIME_DIR (the
// plugin launcher's install) and a neutral cwd. Claude itself runs with the user's real auth
// ("attached"; macOS Keychain auth does not survive a HOME override) unless
// CLAUDE_CODE_OAUTH_TOKEN is set, in which case HOME is sandboxed too ("hermetic"). The user's
// real ~/.devcoach is never touched. The marketplace devcoach plugins are switched off for the
// run through --settings, except in the `plugin-market` method, which tests exactly that install.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "bin.js");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const keep = flag("--keep");
const hermetic = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);
const model = process.env.E2E_MODEL;

const fatal = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ── Installation methods ──────────────────────────────────────────────────────
// Each returns what a `claude -p` call needs: extra args, extra env, the tool-name prefix.
const MARKET_PLUGINS = [
  "devcoach@ultimaphoenix",
  "devcoach@ultimaphoenix-beta",
  "devcoach@devcoach",
];
const pluginsOff = Object.fromEntries(MARKET_PLUGINS.map((p) => [p, false]));
const hookEntry = (command, timeout) => ({ hooks: [{ type: "command", command, timeout }] });

let tarball; // the working tree, packed once, for the plugin launcher to install
function workingTreeTarball() {
  if (!tarball) {
    const dir = mkdtempSync(join(tmpdir(), "dc-e2e-pack-"));
    const name = execFileSync("npm", ["pack", "--silent", "--pack-destination", dir], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .at(-1);
    tarball = join(dir, name);
  }
  return tarball;
}

function installedMarketPlugin() {
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
    const wanted = option("--channel");
    const enabled = Object.entries(settings.enabledPlugins ?? {})
      .filter(([id, on]) => on && MARKET_PLUGINS.includes(id))
      .map(([id]) => id);
    if (wanted) return `devcoach@ultimaphoenix${wanted === "beta" ? "-beta" : ""}`;
    return enabled[0] ?? null;
  } catch {
    return null;
  }
}

const METHODS = {
  "plugin-tree": {
    about:
      "--plugin-dir plugin/, the launcher installing a tarball of the working tree (real first-run install)",
    prefix: "mcp__plugin_devcoach_devcoach__",
    setup(sb) {
      const settings = join(sb.dir, "settings.json");
      writeFileSync(settings, JSON.stringify({ enabledPlugins: pluginsOff }));
      return {
        // No --strict-mcp-config here: it would drop the plugin's own server too.
        args: ["--plugin-dir", join(root, "plugin"), "--settings", settings],
        env: {
          DEVCOACH_RUNTIME_DIR: join(sb.dir, "runtime"),
          DEVCOACH_RUNTIME_SPEC: `file:${workingTreeTarball()}`,
        },
      };
    },
    // The CLI for seeding goes through the same launcher the session uses.
    cli: () => ["node", [join(root, "plugin", "scripts", "launch.mjs")]],
  },
  "plugin-market": {
    about:
      "the plugin as installed on this PC from the marketplace (the released artifact; --channel stable|beta)",
    prefix: "mcp__plugin_devcoach_devcoach__",
    available: () =>
      installedMarketPlugin()
        ? null
        : "no devcoach marketplace plugin is enabled in ~/.claude/settings.json",
    setup(sb) {
      const id = installedMarketPlugin();
      const settings = join(sb.dir, "settings.json");
      writeFileSync(settings, JSON.stringify({ enabledPlugins: { ...pluginsOff, [id]: true } }));
      return { args: ["--settings", settings], env: {}, note: id };
    },
    cli: () => ["node", [bin]],
  },
  "mcp-entry": {
    about: "a plain MCP entry + hooks in settings (the shape `devcoach install` writes for npx)",
    prefix: "mcp__devcoach__",
    setup(sb, { server = true } = {}) {
      const mcp = join(sb.dir, "mcp.json");
      writeFileSync(
        mcp,
        JSON.stringify({
          mcpServers: server ? { devcoach: { command: "node", args: [bin, "mcp"] } } : {},
        }),
      );
      const settings = join(sb.dir, "settings.json");
      writeFileSync(
        settings,
        JSON.stringify({
          enabledPlugins: pluginsOff,
          hooks: {
            Stop: [hookEntry(`node ${bin} stop-hook`, 60)],
            UserPromptSubmit: [hookEntry(`node ${bin} prompt-hook`, 30)],
          },
        }),
      );
      return {
        args: ["--mcp-config", mcp, "--strict-mcp-config", "--settings", settings],
        env: {},
      };
    },
    cli: () => ["node", [bin]],
  },
  homebrew: {
    about:
      "the Homebrew-installed `devcoach` binary as server and hooks (skipped when not installed)",
    prefix: "mcp__devcoach__",
    available: () =>
      existsSync("/opt/homebrew/bin/devcoach")
        ? null
        : "/opt/homebrew/bin/devcoach is not installed",
    setup(sb) {
      const brew = "/opt/homebrew/bin/devcoach";
      const mcp = join(sb.dir, "mcp.json");
      writeFileSync(
        mcp,
        JSON.stringify({ mcpServers: { devcoach: { command: brew, args: ["mcp"] } } }),
      );
      const settings = join(sb.dir, "settings.json");
      writeFileSync(
        settings,
        JSON.stringify({
          enabledPlugins: pluginsOff,
          hooks: {
            Stop: [hookEntry(`${brew} stop-hook`, 60)],
            UserPromptSubmit: [hookEntry(`${brew} prompt-hook`, 30)],
          },
        }),
      );
      return {
        args: ["--mcp-config", mcp, "--strict-mcp-config", "--settings", settings],
        env: {},
      };
    },
    cli: () => ["/opt/homebrew/bin/devcoach", []],
  },
};

// ── Sandbox + a claude call ───────────────────────────────────────────────────
const TOOLS = [
  "get_onboarding",
  "complete_onboarding",
  "preview_deep_scan",
  "get_briefing",
  "get_profile",
  "log_lesson",
  "skip_lesson",
  "get_lessons",
  "submit_feedback",
  "star_lesson",
  "update_knowledge",
  "add_topic",
  "add_group",
  "update_settings",
]; // prettier-ignore

function makeSandbox(methodId, kindId, setupOpts) {
  const dir = mkdtempSync(join(tmpdir(), `dc-e2e-${methodId}-${kindId}-`));
  const sb = { dir, data: join(dir, "devcoach"), cwd: join(dir, "cwd") };
  mkdirSync(sb.cwd, { recursive: true });
  sb.dbPath = join(sb.data, "coaching.db");
  sb.notebook = join(sb.data, "learning-state.md");
  const method = METHODS[methodId];
  const { args, env, note } = method.setup(sb, setupOpts);
  sb.note = note;
  sb.env = {
    ...process.env,
    DEVCOACH_DIR: sb.data,
    DEVCOACH_CLAUDE_DIR: join(dir, "claude-data"),
    NO_COLOR: "1",
    ...env,
  };
  delete sb.env.FORCE_COLOR; // it overrides NO_COLOR and makes every child Node warn about it
  if (hermetic) {
    const home = join(dir, "home");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
    sb.env.HOME = home;
  }
  const allowed = [
    "Skill",
    "Read",
    "Write",
    "Edit",
    "Glob",
    ...TOOLS.map((t) => method.prefix + t),
  ];
  sb.args = [...args, "--allowedTools", allowed.join(","), ...(model ? ["--model", model] : [])];
  sb.cli = (...a) => {
    const [cmd, pre] = method.cli(sb);
    return execFileSync(cmd, [...pre, ...a], { env: sb.env, encoding: "utf8" });
  };
  sb.calls = 0;
  return sb;
}

/** One `claude -p` turn. Returns every assistant text block, the session id and the MCP status. */
function claude(sb, prompt, { resume, planMode } = {}) {
  sb.calls += 1;
  const res = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      ...(resume ? ["--resume", resume] : []),
      ...(planMode ? ["--permission-mode", "plan"] : []),
      ...sb.args,
    ],
    { env: sb.env, cwd: sb.cwd, encoding: "utf8", timeout: 420_000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) fatal(`claude -p failed to spawn: ${res.error.message}`);
  // stream-json: `-p` prints only the FINAL message, but a lesson card is legitimately printed
  // BEFORE the log_lesson call — collect every assistant text block of the turn.
  let out = "";
  let session = null;
  let servers = [];
  const toolCalls = [];
  for (const line of (res.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type === "system" && evt.subtype === "init") {
        session = evt.session_id ?? session;
        servers = evt.mcp_servers ?? servers;
      } else if (evt.type === "assistant") {
        for (const block of evt.message?.content ?? []) {
          if (block.type === "text" && block.text) out += `${block.text}\n`;
          if (block.type === "tool_use") toolCalls.push(block.name);
        }
      } else if (evt.type === "result") {
        session = evt.session_id ?? session;
        if (typeof evt.result === "string" && !out.includes(evt.result)) out += `${evt.result}\n`;
      }
    } catch {
      out += `${line}\n`; // a non-JSON line (e.g. "Not logged in") — keep it visible
    }
  }
  return { out, session, servers, toolCalls, status: res.status, err: res.stderr ?? "" };
}

const query = (sb, sql) => {
  if (!existsSync(sb.dbPath)) return null;
  const conn = new DatabaseSync(sb.dbPath);
  try {
    return conn.prepare(sql).get() ?? null;
  } catch {
    return null;
  } finally {
    conn.close();
  }
};
const count = (sb, table) => Number(query(sb, `SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0);
const notebookText = (sb) => (existsSync(sb.notebook) ? readFileSync(sb.notebook, "utf8") : "");
const BAND = /### ─+ 🎓 devcoach ─+/g;
const TECH_PROMPT =
  "Review this TypeScript function and point out the bug, briefly:\n\n" +
  "```ts\nfunction sum(xs: number[]): number {\n  let total = 0;\n  for (let i = 0; i <= xs.length; i++) total += xs[i];\n  return total;\n}\n```";

function seedProfile(sb, { notebook = true } = {}) {
  sb.cli("knowledge-add", "typescript", "--confidence", "4");
  sb.cli("set", "nudge_every", "0"); // every eligible stop cues
  sb.cli("set", "min_gap_minutes", "240");
  sb.cli("set", "max_per_day", "99");
  if (notebook) {
    writeFileSync(
      sb.notebook,
      "# devcoach — Coaching Notebook\n\n## Observations\nSeeded by e2e.\n",
    );
  }
}

// ── Session kinds ─────────────────────────────────────────────────────────────
// Each: { about, calls (claude turns), run(sb, check) }.
const KINDS = {
  "fresh-cue": {
    about:
      "no profile → the stop hook cues onboarding → the user picks Automatic → profile + notebook saved",
    calls: 2,
    run(sb, check) {
      const t1 = claude(sb, TECH_PROMPT);
      const server = t1.servers.find((s) => /devcoach/.test(s.name));
      check(
        "the devcoach server is connected in the very first session",
        server?.status === "connected",
        JSON.stringify(t1.servers.map((s) => `${s.name}:${s.status}`)),
      );
      check(
        "the first turn ends by offering setup, leading with Automatic",
        /automatic/i.test(t1.out),
        t1.out.slice(-160).replace(/\s+/g, " "),
      );
      check("nothing is saved before the user chooses", count(sb, "knowledge") === 0);
      const t2 = claude(sb, "Automatic", { resume: t1.session });
      check(
        "complete_onboarding was called",
        t2.toolCalls.some((n) => n.endsWith("complete_onboarding")),
        t2.toolCalls.join(", "),
      );
      check(
        "the knowledge map has topics",
        count(sb, "knowledge") > 0,
        `${count(sb, "knowledge")} topics`,
      );
      check(
        "the notebook was written",
        notebookText(sb).length > 200,
        `${notebookText(sb).length} chars`,
      );
      check("no lesson was delivered in the onboarding turn", count(sb, "lessons") === 0);
    },
  },
  "fresh-explicit": {
    about:
      "no profile → the user asks for setup in words (what /devcoach:setup runs) → saved in one turn",
    calls: 1,
    run(sb, check) {
      const t = claude(
        sb,
        "Set up devcoach for me. I choose Automatic mode: do not ask me to pick, I confirm Automatic.",
      );
      check(
        "complete_onboarding was called",
        t.toolCalls.some((n) => n.endsWith("complete_onboarding")),
        t.toolCalls.join(", "),
      );
      check(
        "the knowledge map has topics",
        count(sb, "knowledge") > 0,
        `${count(sb, "knowledge")} topics`,
      );
      check(
        "the notebook was written",
        notebookText(sb).length > 200,
        `${notebookText(sb).length} chars`,
      );
      check("no lesson was delivered in the onboarding turn", count(sb, "lessons") === 0);
    },
  },
  lesson: {
    about: "onboarded, technical task → one visible lesson card, one logged lesson",
    calls: 1,
    run(sb, check) {
      seedProfile(sb);
      let t = claude(sb, TECH_PROMPT);
      let bands = (t.out.match(BAND) ?? []).length;
      if (count(sb, "lessons") !== 1 || bands === 0) {
        console.log("    (retrying once — model nondeterminism)");
        t = claude(sb, "Now review the same pattern in a for-of variant and comment briefly.");
        bands = (t.out.match(BAND) ?? []).length;
      }
      check(
        "exactly one lesson row was logged",
        count(sb, "lessons") === 1,
        `got ${count(sb, "lessons")}`,
      );
      // log_lesson does not echo the card — a second print is the double-card regression.
      check("the card is printed exactly once", bands === 1, `bands: ${bands}`);
      check(
        "cue resolved (no pending retry)",
        Number(query(sb, "SELECT pending FROM cue_state WHERE id = 1")?.pending ?? 0) === 0,
      );
    },
  },
  skip: {
    about: "onboarded, small talk → skip_lesson, no card, no stray feedback line",
    calls: 1,
    run(sb, check) {
      seedProfile(sb);
      sb.cli("set", "min_gap_minutes", "0");
      const t = claude(sb, "Ciao! Come stai oggi? Nessuna domanda tecnica, solo due chiacchiere.");
      check("no lesson row was logged", count(sb, "lessons") === 0);
      check("no lesson card in the reply", (t.out.match(BAND) ?? []).length === 0);
      check("no stray feedback line after the skip", !/Did that land/.test(t.out));
      const reason = query(
        sb,
        "SELECT last_skip_reason FROM cue_state WHERE id = 1",
      )?.last_skip_reason;
      check(
        "the model declined explicitly via skip_lesson",
        typeof reason === "string" && reason.length > 0,
        reason ? `reason: "${reason}"` : "no skip recorded",
      );
    },
  },
  "plan-mode": {
    about: "no profile, plan mode → no onboarding cue, nothing saved",
    calls: 1,
    run(sb, check) {
      const t = claude(
        sb,
        "Plan how you would add a --json flag to a small CLI. Two bullet points.",
        { planMode: true },
      );
      check(
        "no setup question in a plan-mode turn",
        !/automatic \(deep\)|how (do|would) you (want|like) to set (it|devcoach) up/i.test(t.out),
      );
      check("nothing was saved", count(sb, "knowledge") === 0);
    },
  },
  restored: {
    about: "knowledge present, notebook missing (a restored backup) → only the notebook step runs",
    calls: 1,
    run(sb, check) {
      seedProfile(sb, { notebook: false });
      sb.cli("set", "nudge_every", "99");
      const before = count(sb, "knowledge");
      claude(
        sb,
        "Check my devcoach setup and finish whatever is still missing. Do not ask me anything.",
      );
      check(
        "the notebook was written",
        notebookText(sb).length > 200,
        `${notebookText(sb).length} chars`,
      );
      check(
        "the knowledge map was left as it was",
        count(sb, "knowledge") === before,
        `${before} → ${count(sb, "knowledge")}`,
      );
    },
  },
  "server-down": {
    about:
      "hooks alive, MCP server missing → the cue's fallback: one line pointing at setup, nothing improvised",
    calls: 1,
    only: ["mcp-entry"],
    setupOpts: { server: false },
    run(sb, check) {
      const t = claude(sb, TECH_PROMPT);
      check(
        "the reply says the server is not connected / points at setup",
        /not connected|\/devcoach:setup|\/mcp/i.test(t.out),
        t.out.slice(-200).replace(/\s+/g, " "),
      );
      check("no profile was improvised", count(sb, "knowledge") === 0);
    },
  },
};

const SMOKE = ["plugin-tree:fresh-cue", "plugin-tree:lesson", "mcp-entry:fresh-explicit"];
const grid = Object.keys(METHODS).flatMap((m) =>
  Object.entries(KINDS)
    .filter(([, k]) => !k.only || k.only.includes(m))
    .map(([k]) => `${m}:${k}`),
);

// ── Selection ─────────────────────────────────────────────────────────────────
const only = option("--only");
const selected = only ? only.split(",") : flag("--all") ? grid : SMOKE;
for (const id of selected) if (!grid.includes(id)) fatal(`unknown scenario "${id}" — see --list`);
const callsOf = (ids) => ids.reduce((n, id) => n + KINDS[id.split(":")[1]].calls, 0);

if (flag("--list")) {
  console.log("Installation methods:");
  for (const [id, m] of Object.entries(METHODS)) console.log(`  ${id.padEnd(14)} ${m.about}`);
  console.log("\nSession kinds:");
  for (const [id, k] of Object.entries(KINDS))
    console.log(`  ${id.padEnd(14)} ${k.about} (${k.calls} claude call${k.calls > 1 ? "s" : ""})`);
  console.log(`\nSmoke (default): ${SMOKE.join(", ")} — ${callsOf(SMOKE)} claude calls`);
  console.log(`All (--all): ${grid.length} scenarios — ${callsOf(grid)} claude calls`);
  process.exit(0);
}

// ── Preflight ─────────────────────────────────────────────────────────────────
if (!existsSync(bin))
  fatal("dist/bin.js not found — run `npm run build` first (or use npm run test:e2e)");
if (spawnSync("which", ["claude"], { encoding: "utf8" }).status !== 0)
  fatal("`claude` CLI not found on PATH — install Claude Code first");

console.log(
  `mode: ${hermetic ? "hermetic (sandbox HOME)" : "attached (real Claude auth, sandboxed devcoach state)"}${model ? ` · model ${model}` : ""}`,
);
console.log(
  `${selected.length} scenario${selected.length > 1 ? "s" : ""}, about ${callsOf(selected) + 1} claude calls (plus retries)\n`,
);

console.log("preflight: checking claude auth…");
const probe = makeSandbox("mcp-entry", "preflight");
probe.cli("knowledge-add", "typescript", "--confidence", "4"); // a profile: the auth check must not onboard
probe.cli("set", "nudge_every", "99");
const smoke = claude(probe, "Reply with exactly: ok");
if (smoke.status !== 0 || /not logged in/i.test(smoke.out)) {
  console.error((smoke.err || smoke.out).slice(0, 2000));
  fatal(
    hermetic
      ? "claude -p failed with the sandbox HOME — is CLAUDE_CODE_OAUTH_TOKEN valid?"
      : "claude -p failed with the real config — log in first (`claude login`), or set CLAUDE_CODE_OAUTH_TOKEN for hermetic mode.",
  );
}
if (!keep) rmSync(probe.dir, { recursive: true, force: true });
console.log("preflight ok\n");

// ── Run ───────────────────────────────────────────────────────────────────────
const results = [];
for (const id of selected) {
  const [methodId, kindId] = id.split(":");
  const method = METHODS[methodId];
  const kind = KINDS[kindId];
  const unavailable = method.available?.();
  if (unavailable) {
    console.log(`▷ ${id} — skipped: ${unavailable}\n`);
    results.push({ id, name: "(skipped)", pass: true, skipped: true });
    continue;
  }
  const sb = makeSandbox(methodId, kindId, kind.setupOpts);
  console.log(`▶ ${id}${sb.note ? ` (${sb.note})` : ""}\n  ${kind.about}`);
  const check = (name, pass, detail = "") => {
    results.push({ id, name, pass: Boolean(pass) });
    console.log(`    ${pass ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
  };
  try {
    kind.run(sb, check);
  } catch (err) {
    check("scenario ran to the end", false, String(err?.message ?? err).slice(0, 300));
  }
  console.log(
    `  ${sb.calls} claude call${sb.calls > 1 ? "s" : ""}${keep ? ` · sandbox ${sb.dir}` : ""}\n`,
  );
  if (!keep) rmSync(sb.dir, { recursive: true, force: true });
}

// ── Report ────────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
const checks = results.filter((r) => !r.skipped);
console.log("─".repeat(72));
for (const id of selected) {
  const mine = results.filter((r) => r.id === id);
  const state = mine.some((r) => r.skipped)
    ? "skipped"
    : mine.every((r) => r.pass)
      ? "pass"
      : "FAIL";
  console.log(`${state.padEnd(8)} ${id}`);
  for (const r of mine.filter((x) => !x.pass)) console.log(`           ❌ ${r.name}`);
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (tarball && !keep) rmSync(dirname(tarball), { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
