#!/usr/bin/env node
// devcoach launcher — what the Claude Code plugin ships (scripts/sync-plugin.mjs copies it into
// plugin/scripts/; never edit the copy).
//
// The plugin ships only config + this file: the devcoach binary comes from npm. On first use the
// *pinned* version (the package.json beside scripts/) is installed once into a persistent data
// dir, then every start imports it in-process. The only thing this file ever starts is the MCP
// server: the hooks are `mcp_tool` entries that call the server's own hook tools, so no hook
// process exists.
//
//   launch.mjs mcp        install if needed, then hand off to the server (exit 1 + the reason when
//                         devcoach cannot run — exit 0 read as a mute "failed to connect")
//   launch.mjs doctor     install if needed, then print the diagnosis (exit 1 when devcoach cannot run)
//   launch.mjs --install  install only
//
// What this file guarantees, because each of these once produced a mute "failed to connect":
//   • a runtime directory exists only when its install FINISHED — npm runs in a temp dir that is
//     renamed into place, so an interrupted install can never look installed;
//   • concurrent starts cannot corrupt each other: the first rename wins, the others use its result;
//   • every failure says why, where the host can show it (see reportFailure).
import { spawnSync } from "node:child_process";
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
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const MIN_NODE_MAJOR = 24;
const INSTALL_TIMEOUT_MS = 180_000;
const WAIT_STEP_MS = 250;
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
  const pkgDir = join(runtimeDir, "node_modules", "devcoach");
  return {
    config,
    pinned,
    spec,
    data,
    runtimeRoot,
    runtimeDir,
    pkgDir,
    binJs: join(pkgDir, "dist", "bin.js"),
    log: join(data, "install.log"),
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
  // npm's output goes to the log: it must never reach the MCP server's stdout (the protocol).
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
  prune(ctx);
  return null;
}

/** The version the installed tree declares, when one is installed. */
function installedVersion(ctx) {
  try {
    return String(JSON.parse(readFileSync(join(ctx.pkgDir, "package.json"), "utf8")).version);
  } catch {
    return null;
  }
}

/** The full picture, for `doctor`: what is wrong (`reason`), or that everything is in place. */
function diagnosis(ctx, reason) {
  const npm = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  const tail = reason ? logTail(ctx) : "";
  const installed = installedVersion(ctx);
  return [
    reason
      ? `${ctx.config.label}: the devcoach runtime is not available.`
      : `${ctx.config.label}: devcoach ${installed ?? ctx.spec} is installed — the MCP server starts from it.`,
    ...(reason ? [`  reason:   ${reason}`] : []),
    `  node:     ${process.versions.node} (needs ≥ ${MIN_NODE_MAJOR}) — ${process.execPath}`,
    `  npm:      ${npm.status === 0 ? npm.stdout.trim() : "not found on PATH"}`,
    `  pinned:   devcoach ${ctx.spec}`,
    `  runtime:  ${ctx.runtimeDir}${existsSync(ctx.binJs) ? "" : " (not installed)"}`,
    `  log:      ${ctx.log}`,
    ...(tail ? ["  last lines of the log:", ...tail.split("\n").map((l) => `    ${l}`)] : []),
  ].join("\n");
}

/**
 * Say why devcoach cannot run, where the host shows it, and exit 1:
 *   doctor → the full diagnosis (what /devcoach:setup reads)
 *   other  → one line on stderr (the host's MCP log)
 */
function reportFailure(ctx, mode, reason) {
  console.error(mode === "doctor" ? diagnosis(ctx, reason) : `${ctx.config.label}: ${reason}`);
  process.exit(1);
}

async function main() {
  const mode = process.argv[2] ?? "mcp";
  const ctx = loadContext();

  const node = nodeProblem(process.versions.node);
  if (node) reportFailure(ctx, mode, node);

  if (!existsSync(ctx.binJs)) {
    const reason = ensureRuntime(ctx);
    if (reason) reportFailure(ctx, mode, reason);
  }
  if (mode === "--install") process.exit(0);
  if (mode === "doctor") {
    console.log(diagnosis(ctx, null));
    process.exit(0);
  }

  // Hand off in-process to the real binary: the MCP server over stdio.
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
