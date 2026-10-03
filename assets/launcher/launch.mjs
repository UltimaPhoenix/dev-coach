#!/usr/bin/env node
// devcoach launcher — the single source for the Claude Code plugin and the Gemini CLI extension
// (scripts/sync-plugin.mjs copies it into both; never edit the copies).
//
// The host ships only config + this file: the devcoach binary comes from npm. On first use the
// *pinned* version (the package.json beside scripts/) is installed once into a persistent data
// dir, then every start (the MCP server, each hook) imports it in-process.
//
// What this file guarantees, because each of these once produced a mute "failed to connect":
//   • a runtime directory exists only when its install FINISHED — npm runs in a temp dir that is
//     renamed into place, so an interrupted install can never look installed;
//   • concurrent starts (the MCP server and the first prompt's hook race on a fresh machine)
//     cannot corrupt each other: the first rename wins, the others use its result;
//   • a hook never makes the user wait for npm: it starts the install in the background;
//   • every failure says why, where the host can show it (see reportFailure).
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIN_NODE_MAJOR = 24;
const INSTALL_TIMEOUT_MS = 180_000;
const WAIT_STEP_MS = 250;
const HOOK_RETRY_AFTER_MS = 10 * 60_000; // a failed background install is retried at most this often
const NOTICE_EVERY_MS = 24 * 60 * 60_000; // one visible notice a day, never one per prompt
const LOG_TAIL_LINES = 15;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** The Node requirement as a sentence, or null when `version` is new enough. */
export function nodeProblem(version) {
  const major = Number.parseInt(String(version).split(".")[0] ?? "0", 10);
  if (major >= MIN_NODE_MAJOR) return null;
  return (
    `Node ${version} is too old: devcoach needs Node ${MIN_NODE_MAJOR} or newer ` +
    "(it uses the built-in node:sqlite). Upgrade Node (e.g. `brew upgrade node`), then restart."
  );
}

/** A hook subcommand: must never block a prompt nor break a turn. */
export function isHookMode(mode) {
  return /-hook$/.test(mode ?? "") || mode === "lesson-ready";
}

/** A directory-safe key for what gets installed (a version, or a test tarball spec). */
export function runtimeKey(spec) {
  return String(spec)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-80);
}

function loadContext() {
  const config = JSON.parse(readFileSync(join(here, "launch.config.json"), "utf8"));
  const pinned = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).dependencies.devcoach;
  // DEVCOACH_RUNTIME_DIR / DEVCOACH_RUNTIME_SPEC: test and e2e overrides, like DEVCOACH_DIR.
  const spec = process.env.DEVCOACH_RUNTIME_SPEC || pinned;
  const data =
    process.env.DEVCOACH_RUNTIME_DIR ||
    (config.dataEnv && process.env[config.dataEnv]) ||
    (config.dataHome ? join(homedir(), ...config.dataHome) : join(root, ".data"));
  const runtimeRoot = join(data, "runtime");
  const runtimeDir = join(runtimeRoot, runtimeKey(spec));
  return {
    config,
    pinned,
    spec,
    data,
    runtimeRoot,
    runtimeDir,
    binJs: join(runtimeDir, "node_modules", "devcoach", "dist", "bin.js"),
    log: join(data, "install.log"),
    failure: join(data, "install-failed.json"),
    notice: join(data, "notice.stamp"),
  };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Temp dirs of installs of THIS runtime: [{ dir, pid }]. */
function installsInProgress(ctx) {
  const prefix = `${runtimeKey(ctx.spec)}.tmp-`;
  let names = [];
  try {
    names = readdirSync(ctx.runtimeRoot);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(prefix))
    .map((n) => ({ dir: join(ctx.runtimeRoot, n), pid: Number(n.slice(prefix.length)) }));
}

/** Another live process is installing: wait for its result instead of running a second npm. */
function waitForOtherInstall(ctx) {
  const deadline = Date.now() + INSTALL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (existsSync(ctx.binJs)) return true;
    const live = installsInProgress(ctx).filter((i) => i.pid !== process.pid && alive(i.pid));
    if (live.length === 0) return existsSync(ctx.binJs);
    sleep(WAIT_STEP_MS);
  }
  return existsSync(ctx.binJs);
}

function logTail(ctx) {
  try {
    return readFileSync(ctx.log, "utf8").trimEnd().split("\n").slice(-LOG_TAIL_LINES).join("\n");
  } catch {
    return "";
  }
}

/** Old layouts, other versions and the leftovers of dead installs. */
function prune(ctx) {
  const keep = runtimeKey(ctx.spec);
  for (const name of readdirSync(ctx.runtimeRoot)) {
    if (name === keep) continue;
    const pid = Number(name.split(".tmp-")[1]);
    if (name.includes(".tmp-") && alive(pid)) continue;
    rmSync(join(ctx.runtimeRoot, name), { recursive: true, force: true });
  }
  // The pre-2.6.4 layout installed straight into the data dir.
  for (const legacy of ["node_modules", "package.json", "package-lock.json"]) {
    rmSync(join(ctx.data, legacy), { recursive: true, force: true });
  }
}

/**
 * Make sure the pinned runtime is installed. Returns null, or the reason it could not be.
 * npm installs into `<runtime>.tmp-<pid>` and the directory is renamed into place on success.
 */
export function ensureRuntime(ctx) {
  if (existsSync(ctx.binJs)) return null;
  mkdirSync(ctx.runtimeRoot, { recursive: true });
  if (waitForOtherInstall(ctx)) return null;

  const tmp = `${ctx.runtimeDir}.tmp-${process.pid}`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(
    join(tmp, "package.json"),
    JSON.stringify({
      name: "devcoach-runtime",
      private: true,
      dependencies: { devcoach: ctx.spec },
    }),
  );
  writeFileSync(ctx.log, `[${new Date().toISOString()}] npm install devcoach@${ctx.spec}\n`);
  const out = openSync(ctx.log, "a");
  // npm's output goes to the log: it must never reach the MCP server's stdout (the protocol)
  // nor a hook's stdout (the cue).
  const r = spawnSync(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-progress"],
    {
      cwd: tmp,
      stdio: ["ignore", out, out],
      timeout: INSTALL_TIMEOUT_MS,
      shell: process.platform === "win32", // npm is npm.cmd there
    },
  );
  closeSync(out);

  const installed = existsSync(join(tmp, "node_modules", "devcoach", "dist", "bin.js"));
  if (r.status !== 0 || !installed) {
    rmSync(tmp, { recursive: true, force: true });
    if (r.error?.code === "ENOENT") {
      return "`npm` was not found on the PATH this session uses. Install Node with npm (e.g. `brew install node`), then restart.";
    }
    if (r.error?.code === "ETIMEDOUT") {
      return `installing devcoach ${ctx.spec} took longer than ${INSTALL_TIMEOUT_MS / 1000} s — check the network, then restart. Log: ${ctx.log}`;
    }
    return `could not install devcoach ${ctx.spec} from npm (network needed on first use). Log: ${ctx.log}`;
  }
  try {
    renameSync(tmp, ctx.runtimeDir);
  } catch {
    // Lost the race: another start renamed first. Its tree is complete — use it.
    rmSync(tmp, { recursive: true, force: true });
    if (!existsSync(ctx.binJs))
      return `could not move the installed runtime into ${ctx.runtimeDir}`;
  }
  rmSync(ctx.failure, { force: true });
  prune(ctx);
  return null;
}

function recordFailure(ctx, reason) {
  try {
    mkdirSync(ctx.data, { recursive: true });
    writeFileSync(ctx.failure, JSON.stringify({ at: new Date().toISOString(), reason }));
  } catch {
    // a read-only data dir: the reason still reaches the caller
  }
}

function lastFailure(ctx) {
  try {
    const { at, reason } = JSON.parse(readFileSync(ctx.failure, "utf8"));
    return { ageMs: Date.now() - Date.parse(at), reason: String(reason) };
  } catch {
    return null;
  }
}

/** True at most once per NOTICE_EVERY_MS (the stamp's mtime is the clock). */
function noticeDue(ctx) {
  try {
    if (Date.now() - statSync(ctx.notice).mtimeMs < NOTICE_EVERY_MS) return false;
  } catch {
    // no stamp yet
  }
  try {
    mkdirSync(ctx.data, { recursive: true });
    writeFileSync(ctx.notice, "");
    utimesSync(ctx.notice, new Date(), new Date());
  } catch {
    // cannot remember: better one notice too many than none
  }
  return true;
}

function diagnosis(ctx, reason) {
  const npm = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const tail = logTail(ctx);
  return [
    `${ctx.config.label}: the devcoach runtime is not available.`,
    `  reason:   ${reason}`,
    `  node:     ${process.versions.node} (needs ≥ ${MIN_NODE_MAJOR}) — ${process.execPath}`,
    `  npm:      ${npm.status === 0 ? npm.stdout.trim() : "not found on PATH"}`,
    `  pinned:   devcoach ${ctx.spec}`,
    `  runtime:  ${ctx.runtimeDir}${existsSync(ctx.binJs) ? "" : " (not installed)"}`,
    `  log:      ${ctx.log}`,
    ...(tail ? ["  last lines of the log:", ...tail.split("\n").map((l) => `    ${l}`)] : []),
  ].join("\n");
}

/**
 * Say why devcoach cannot run, where the host shows it:
 *   mcp   → stderr + exit 1 (the host's MCP log; exit 0 here read as a mute "failed to connect")
 *   hook  → one systemMessage a day when the host renders it, otherwise silence; always exit 0
 *   other → the full diagnosis (this is what `launch.mjs doctor` prints), exit 1
 */
function reportFailure(ctx, mode, reason) {
  if (isHookMode(mode)) {
    if (ctx.config.hookNotice && noticeDue(ctx)) {
      const hint = ctx.config.setupHint ? ` ${ctx.config.setupHint}` : "";
      process.stdout.write(
        `${JSON.stringify({ systemMessage: `🎓 devcoach is not running: ${reason}${hint}` })}\n`,
      );
    }
    process.exit(0);
  }
  if (mode === "mcp") {
    console.error(`${ctx.config.label}: ${reason}`);
    process.exit(1);
  }
  console.error(diagnosis(ctx, reason));
  process.exit(1);
}

/** A hook found no runtime: install in the background, let the prompt go. */
function installInBackground(ctx) {
  const failed = lastFailure(ctx);
  if (failed && failed.ageMs < HOOK_RETRY_AFTER_MS) return failed.reason;
  if (installsInProgress(ctx).some((i) => alive(i.pid))) return null;
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--install"], {
    detached: true,
    stdio: "ignore",
    env: process.env,
  });
  child.unref();
  return null;
}

async function main() {
  const mode = process.argv[2];
  const ctx = loadContext();

  const node = nodeProblem(process.versions.node);
  if (node) reportFailure(ctx, mode, node);

  if (mode === "--install") {
    const reason = ensureRuntime(ctx);
    if (reason) recordFailure(ctx, reason);
    process.exit(reason ? 1 : 0);
  }

  if (!existsSync(ctx.binJs)) {
    if (isHookMode(mode)) {
      const reason = installInBackground(ctx);
      if (reason) reportFailure(ctx, mode, reason);
      process.exit(0); // installing: nothing to say yet, and nothing to run
    }
    const reason = ensureRuntime(ctx);
    if (reason) {
      recordFailure(ctx, reason);
      reportFailure(ctx, mode, reason);
    }
  }

  // Hand off in-process to the real binary — it reads the subcommand from argv.
  process.env.DEVCOACH_LAUNCHER = `${ctx.config.label} · devcoach ${ctx.spec} · ${ctx.runtimeDir}`;
  try {
    await import(pathToFileURL(ctx.binJs).href);
  } catch (err) {
    // A tree that cannot be loaded is not a runtime: drop it so the next start reinstalls.
    if (err?.code === "ERR_MODULE_NOT_FOUND")
      rmSync(ctx.runtimeDir, { recursive: true, force: true });
    reportFailure(ctx, mode, `devcoach ${ctx.spec} could not start: ${err?.message ?? err}`);
  }
}

const invoked = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invoked === realpathSync(fileURLToPath(import.meta.url))) await main();
