#!/usr/bin/env node
// End-to-end test of the coaching loop against REAL headless Claude Code sessions.
// Local-only (needs an authenticated `claude` CLI + spends tokens) — NOT run in CI.
//
//   npm run test:e2e            build + run both scenarios
//   node scripts/e2e-claude.mjs [--keep]
//
// Two isolation modes:
//   • hermetic — when CLAUDE_CODE_OAUTH_TOKEN is set (create one with `claude
//     setup-token`): everything runs in a throwaway HOME, including Claude's own
//     config. Fully isolated.
//   • attached (default) — Claude runs with the user's real config/auth (macOS
//     Keychain auth does not survive a HOME override), while ALL devcoach state is
//     isolated via the DEVCOACH_DIR env override, which the hooks and the MCP server
//     inherit. The user's real ~/.devcoach is never touched; if the user's settings
//     already wire devcoach hooks, those entries are reused (adding a second set
//     would double-count interactions).
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bin = join(root, "dist", "bin.js");
const keep = process.argv.includes("--keep");
const hermetic = Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN);

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const fatal = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};

// ── Preflight ─────────────────────────────────────────────────────────────────
if (!existsSync(bin))
  fatal("dist/bin.js not found — run `npm run build` first (or use npm run test:e2e)");
if (spawnSync("which", ["claude"], { encoding: "utf8" }).status !== 0)
  fatal("`claude` CLI not found on PATH — install Claude Code first");

// ── Sandbox setup ─────────────────────────────────────────────────────────────
const sandbox = mkdtempSync(join(tmpdir(), "dc-e2e-"));
const dataDir = join(sandbox, "devcoach"); // devcoach DB/notebook, both modes
const dbPath = join(dataDir, "coaching.db");
// DEVCOACH_CLAUDE_DIR points the history scan at an empty sandbox dir so the MCP
// server spawned by claude never reads the real ~/.claude history in attached mode.
const env = {
  ...process.env,
  DEVCOACH_DIR: dataDir,
  DEVCOACH_CLAUDE_DIR: join(sandbox, "claude-data"),
  NO_COLOR: "1",
};
const claudeArgs = [];
console.log(
  `mode: ${hermetic ? "hermetic (sandbox HOME)" : "attached (real Claude config, sandboxed DEVCOACH_DIR)"}`,
);
console.log(`sandbox: ${sandbox}\n`);

const hookEntry = (cmd, timeout) => ({
  hooks: [{ type: "command", command: `node ${bin} ${cmd}`, timeout }],
});
const desiredHooks = {
  Stop: [hookEntry("stop-hook", 60)],
  UserPromptSubmit: [hookEntry("prompt-hook", 30)],
};

if (hermetic) {
  const home = join(sandbox, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  env.HOME = home;
  writeFileSync(join(home, ".claude.json"), JSON.stringify({ hasCompletedOnboarding: true }));
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify({ hooks: desiredHooks }));
  // The coaching skill, so the cue's Skill-tool invocation path is exercised.
  const skillDir = join(home, ".claude", "skills", "devcoach");
  mkdirSync(skillDir, { recursive: true });
  cpSync(join(root, "assets", "SKILL.md"), join(skillDir, "SKILL.md"));
  cpSync(join(root, "assets", "references"), join(skillDir, "references"), { recursive: true });
} else {
  // Attached: reuse the user's devcoach hooks if present (they inherit DEVCOACH_DIR,
  // so they still write to the sandbox); otherwise inject ours via --settings.
  let hasHooks = false;
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8"));
    hasHooks = Object.values(settings.hooks ?? {}).some((entries) =>
      (entries ?? []).some((e) =>
        (e.hooks ?? []).some(
          (h) => (h.command ?? "").includes("devcoach") || (h.command ?? "").includes("dev-coach"),
        ),
      ),
    );
  } catch {
    // unreadable settings → treat as no hooks
  }
  if (hasHooks) {
    console.log("using the devcoach hooks already wired in ~/.claude/settings.json");
    console.log("  note: those hooks run the INSTALLED devcoach — if it is older than this repo,");
    console.log("  hook-side behaviour (cue text) reflects the installed version.");
  } else {
    const extra = join(sandbox, "settings.json");
    writeFileSync(extra, JSON.stringify({ hooks: desiredHooks }));
    claudeArgs.push("--settings", extra);
    console.log("no devcoach hooks in the user settings — injecting them via --settings");
  }
}

// devcoach profile in the sandboxed DEVCOACH_DIR. Pacing starts far away (99) so the
// auth preflight turn doesn't trigger coaching; scenarios flip it to 0 afterwards.
const cli = (...args) => execFileSync("node", [bin, ...args], { env, encoding: "utf8" });
cli("knowledge-add", "typescript", "--confidence", "4");
cli("set", "nudge_every", "99");
cli("set", "min_gap_minutes", "0");
cli("set", "max_per_day", "99");
// Seed the notebook too: with it missing, devcoach://onboarding reports
// notebook_ready:false and the skill runs onboarding INSIDE scenario 1's lesson
// turn — the scenarios must exercise the normal, fully-onboarded lesson path.
writeFileSync(
  join(dataDir, "learning-state.md"),
  "# devcoach — Coaching Notebook\n\n## Observations\nSeeded by e2e.\n",
);

const mcpConfig = join(sandbox, "mcp.json");
writeFileSync(
  mcpConfig,
  JSON.stringify({ mcpServers: { devcoach: { command: "node", args: [bin, "mcp"] } } }),
);

const cwd = mkdtempSync(join(tmpdir(), "dc-e2e-cwd-")); // neutral cwd: no repo CLAUDE.md

const ALLOWED = [
  "Skill",
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  "Read",
  "mcp__devcoach__log_lesson",
  "mcp__devcoach__skip_lesson",
  "mcp__devcoach__get_lessons",
  "mcp__devcoach__submit_feedback",
  "mcp__devcoach__star_lesson",
  "mcp__devcoach__update_notebook",
].join(",");

function claude(prompt) {
  // stream-json: `claude -p` prints only the FINAL message, but the lesson card is
  // legitimately printed in the assistant message BEFORE the log_lesson tool call —
  // collect every assistant text block of the turn instead.
  const res = spawnSync(
    "claude",
    [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      mcpConfig,
      "--strict-mcp-config",
      "--allowedTools",
      ALLOWED,
      ...claudeArgs,
    ],
    { env, cwd, encoding: "utf8", timeout: 300_000, maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error) fatal(`claude -p failed to spawn: ${res.error.message}`);
  let out = "";
  for (const line of (res.stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const evt = JSON.parse(line);
      if (evt.type === "assistant") {
        for (const block of evt.message?.content ?? []) {
          if (block.type === "text" && block.text) out += `${block.text}\n`;
        }
      } else if (evt.type === "result" && typeof evt.result === "string") {
        // interleaved-visibility safety net: the result repeats the final text
        if (!out.includes(evt.result)) out += `${evt.result}\n`;
      }
    } catch {
      out += `${line}\n`; // non-JSON line (e.g. "Not logged in") — keep it visible
    }
  }
  return { out, err: res.stderr ?? "", status: res.status };
}

const lessonCount = () => {
  const db = new DatabaseSync(dbPath);
  try {
    return Number(db.prepare("SELECT COUNT(*) AS n FROM lessons").get().n);
  } finally {
    db.close();
  }
};
const cueState = () => {
  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare("SELECT pending, last_skip_reason FROM cue_state WHERE id = 1").get() ?? {};
  } finally {
    db.close();
  }
};

// ── Preflight: auth ───────────────────────────────────────────────────────────
console.log("preflight: checking claude auth…");
const smoke = claude("Reply with exactly: ok");
if (smoke.status !== 0 || /not logged in/i.test(smoke.out)) {
  console.error((smoke.err || smoke.out).slice(0, 2000));
  fatal(
    hermetic
      ? "claude -p failed with the sandbox HOME — is CLAUDE_CODE_OAUTH_TOKEN valid?"
      : "claude -p failed with the real config — log in first (`claude login`), or set CLAUDE_CODE_OAUTH_TOKEN for hermetic mode.",
  );
}
console.log("preflight ok\n");
cli("set", "nudge_every", "0"); // now every eligible stop cues
// A realistic gap isolates the double-print check: without it, the stop right after
// log_lesson re-cues (pacing disabled + no gap) and the model legitimately prints a
// second card — the deferred same-turn re-cue, not the double-print bug under test.
cli("set", "min_gap_minutes", "240");

const BAND = /### ─+ 🎓 devcoach ─+/g;

// ── Scenario 1: technical task → visible lesson card + logged lesson ──────────
console.log("scenario 1: technical task → lesson card + log_lesson");
const before = lessonCount();
let s1 = claude(
  "Review this TypeScript function and point out the bug, briefly:\n\n" +
    "```ts\nfunction sum(xs: number[]): number {\n  let total = 0;\n  for (let i = 0; i <= xs.length; i++) total += xs[i];\n  return total;\n}\n```",
);
let gained = lessonCount() - before;
let bands = (s1.out.match(BAND) ?? []).length;
if (gained !== 1 || bands === 0) {
  console.log("  (retrying once — model nondeterminism)");
  s1 = claude("Now review the same pattern in a for-of variant and comment briefly.");
  gained = lessonCount() - before;
  bands = (s1.out.match(BAND) ?? []).length;
}
check("exactly one lesson row was logged", gained === 1, `got ${gained}`);
check("the lesson card is visible in the reply", bands >= 1, `bands: ${bands}`);
// log_lesson does not echo the card — a second print is the double-card
// regression, not tolerable slack.
check("the card is printed exactly once", bands === 1, `bands: ${bands}`);
check("cue resolved (no pending retry)", Number(cueState().pending ?? 0) === 0);

// ── Scenario 2: non-technical prompt → skip_lesson, no card ───────────────────
console.log("\nscenario 2: non-technical prompt → skip_lesson, no card");
// The skip path needs a cue to decline — drop the gap again so the lesson logged in
// scenario 1 doesn't rate-limit this turn's cue.
cli("set", "min_gap_minutes", "0");
const before2 = lessonCount();
const s2 = claude("Ciao! Come stai oggi? Nessuna domanda tecnica, solo due chiacchiere.");
const bands2 = (s2.out.match(BAND) ?? []).length;
check("no lesson row was logged", lessonCount() === before2, `delta ${lessonCount() - before2}`);
check("no lesson card in the reply", bands2 === 0, `bands: ${bands2}`);
// A declined cue must be fully silent — the feedback prompt belongs only under a
// delivered card (observed regression: a stray line after skip_lesson).
check("no stray feedback line after the skip", !/Did that land/.test(s2.out));
const skipReason = cueState().last_skip_reason;
check(
  "the model declined explicitly via skip_lesson",
  typeof skipReason === "string" && skipReason.length > 0,
  skipReason ? `reason: "${skipReason}"` : "no skip recorded",
);

// ── Wrap up ───────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (keep) console.log(`sandbox kept at ${sandbox}`);
else {
  rmSync(sandbox, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
}
process.exit(failed.length ? 1 : 0);
