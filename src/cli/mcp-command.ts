// The command an MCP host starts devcoach with: finding it the way the host will, choosing a
// robust one at install time, and explaining why a host cannot start it. Built from one log:
// Claude Desktop printed `Failed to spawn process: No such file or directory` six times in six
// minutes, with a bare `devcoach` resolved on its own PATH — and devcoach had nothing to say,
// because it never ran. Every check here is what that log could not tell.
import { spawnSync } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  existsSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyPath, MIN_NODE_MAJOR } from "../core/runtime";
import { VERSION } from "../version";

export interface LookupEnv {
  /** The PATH to search (the host's when known, else this process's). */
  path?: string;
  /** Windows executable extensions (`.COM;.EXE;.BAT;.CMD` by default). */
  pathext?: string;
  platform?: NodeJS.Platform;
}

const isWin = (platform: NodeJS.Platform) => platform === "win32";
const hasSeparator = (name: string) => name.includes("/") || name.includes("\\");

/** `dir` + `file` with the separator `dir` already uses (Windows strings test on any OS). */
function joinLike(dir: string, file: string): string {
  if (dir.endsWith("/") || dir.endsWith("\\")) return dir + file;
  return `${dir}${dir.includes("\\") && !dir.includes("/") ? "\\" : "/"}${file}`;
}

function isExecutableFile(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (isWin(platform)) return true; // Windows has no execute bit: the extension decides
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a command the way a host's spawn does: an absolute or relative path as is, a bare name
 * through PATH — split on `;` on Windows (`C:\…` entries contain `:`), with the PATHEXT
 * extensions tried there (`devcoach` is `devcoach.cmd` after `npm i -g` on Windows).
 */
export function resolveCommand(name: string, env: LookupEnv = {}): string | null {
  const platform = env.platform ?? process.platform;
  const exts = isWin(platform)
    ? /\.[a-z0-9]+$/i.test(name)
      ? [""]
      : (env.pathext ?? process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
          .map((e) => e.toLowerCase())
    : [""];
  if (hasSeparator(name)) {
    for (const ext of exts) if (isExecutableFile(name + ext, platform)) return name + ext;
    return null;
  }
  const path = env.path ?? process.env.PATH ?? "";
  for (const dir of path.split(isWin(platform) ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = joinLike(dir, name + ext);
      if (isExecutableFile(candidate, platform)) return candidate;
    }
  }
  return null;
}

/** The `#!` line of a script, without `#!` (`/usr/bin/env node`), or null for a binary. */
export function interpreterOf(file: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(256);
    const n = readSync(fd, buf, 0, buf.length, 0);
    const head = buf.subarray(0, n).toString("utf8");
    if (!head.startsWith("#!")) return null;
    return head.slice(2).split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

export interface ServerCommand {
  command: string;
  args: string[];
  /** Said once at install time: what the command depends on. */
  note?: string;
}

export const NPX_COMMAND: ServerCommand = { command: "npx", args: ["-y", "devcoach", "mcp"] };

/**
 * The command `devcoach install` writes for a host. Absolute, so it does not depend on the
 * host's PATH (Claude Desktop resolves a bare name on its own, shorter PATH):
 *  - macOS / Linux: the PATH hit itself, not its realpath — `/opt/homebrew/bin/devcoach` survives
 *    `brew upgrade`, the Cellar path does not;
 *  - Windows: `node.exe` + devcoach's `bin.js` — a `.cmd` shim cannot be spawned without a shell,
 *    and the Node running install is known to be new enough;
 *  - a hit in a temporary location (npx's cache, an fnm shell) or no hit at all: `npx -y devcoach`.
 */
export function chooseServerCommand(inputs: {
  hit: string | null;
  entry: string;
  execPath: string;
  platform: NodeJS.Platform;
}): ServerCommand {
  const { hit, entry, execPath, platform } = inputs;
  if (!hit) return NPX_COMMAND;
  const where = classifyPath(isWin(platform) ? entry : hit, platform);
  if (where.ephemeral || classifyPath(entry, platform).ephemeral) return NPX_COMMAND;
  const note = where.boundTo
    ? `bound to Node ${where.boundTo} (${where.manager}) — after removing or switching that ` +
      "version, run `devcoach install --force` again"
    : undefined;
  if (isWin(platform)) return { command: execPath, args: [entry, "mcp"], note };
  return { command: hit, args: ["mcp"], note };
}

/** Where Claude Desktop keeps devcoach's MCP log on this OS. */
export function claudeDesktopLogPath(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string {
  if (platform === "darwin")
    return join(home, "Library", "Logs", "Claude", "mcp-server-devcoach.log");
  if (platform === "win32") {
    const appdata = env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appdata, "Claude", "logs", "mcp-server-devcoach.log");
  }
  return join(
    env.XDG_CONFIG_HOME ?? join(home, ".config"),
    "Claude",
    "logs",
    "mcp-server-devcoach.log",
  );
}

export interface HostLog {
  /** The PATH the host last used to start devcoach, as a PATH string, when the log shows it. */
  path: string | null;
  /** The host's last error about devcoach, when there is one. */
  lastError: string | null;
}

/**
 * Read what a Claude Desktop log says about how it starts devcoach. Desktop prints, at each
 * start, `Using MCP server command: <cmd> with path: { … paths: [ '/a', '/b', … ] … }`, and on a
 * failed start a bare `Failed to spawn process: …` line. Best effort: any other format → nulls.
 */
export function readHostLog(text: string, platform: NodeJS.Platform = process.platform): HostLog {
  const lines = text.split(/\r?\n/);
  let path: string | null = null;
  for (let i = lines.length - 1; i >= 0 && path === null; i--) {
    if (!/Using MCP server command:/.test(lines[i] ?? "")) continue;
    const dirs: string[] = [];
    for (let j = i + 1; j < lines.length && j < i + 80; j++) {
      const line = lines[j] ?? "";
      if (/\[length\]:/.test(line) || /^\S/.test(line)) break;
      const m = /^\s*'(.+)',?\s*$/.exec(line);
      if (m?.[1]) dirs.push(m[1].replace(/\\\\/g, "\\"));
    }
    if (dirs.length) path = dirs.join(isWin(platform) ? ";" : ":");
  }
  // The most specific last error: Desktop logs the OS's `Failed to spawn process: …` right
  // before its own generic `Couldn't start … Connection closed`, so prefer the former.
  let lastError: string | null = null;
  for (let i = lines.length - 1; i >= 0 && lastError === null; i--) {
    const line = lines[i] ?? "";
    if (/^Failed to spawn process/.test(line)) lastError = line.trim();
    else if (/\[error\]/.test(line)) {
      const before = (lines[i - 1] ?? "").trim();
      lastError = /^Failed to spawn process/.test(before)
        ? before
        : line
            .replace(/\s*\{ metadata:.*$/, "")
            .replace(/^\S+Z \[devcoach\] \[error\] /, "")
            .trim();
    }
  }
  return { path, lastError };
}

export type Finding = { level: "ok" | "warn" | "bad"; text: string };

export interface CheckInputs extends LookupEnv {
  /** Where `path` came from, for the messages ("Claude Desktop's PATH", "this shell's PATH"). */
  pathSource: string;
  /** Runs `<command> <args…>` and returns its stdout, or null when it cannot run. */
  run?: (command: string, args: string[]) => string | null;
}

function defaultRun(command: string, args: string[]): string | null {
  const r = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 5000,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
  });
  return r.status === 0 ? (r.stdout ?? "").trim() : null;
}

const SPAWN_ERROR = "`Failed to spawn process: No such file or directory`";

/**
 * Explain whether a host can start `command args`, in the order a spawn fails: the file, its
 * `#!` interpreter, where it lives, and what it runs.
 */
export function checkServerCommand(
  entry: { command: string; args?: string[] },
  inputs: CheckInputs,
): Finding[] {
  const platform = inputs.platform ?? process.platform;
  const run = inputs.run ?? defaultRun;
  const out: Finding[] = [];
  const { command } = entry;
  const args = entry.args ?? [];

  if (command === "npx") {
    out.push({
      level: "warn",
      text: "starts via `npx -y devcoach` — needs the npx cache (or the network) at every start",
    });
    return out;
  }

  const resolved = resolveCommand(command, { ...inputs, platform });
  if (!resolved) {
    out.push({
      level: "bad",
      text:
        `\`${command}\` is not found ${hasSeparator(command) ? "" : `on ${inputs.pathSource} `}` +
        `— the host fails with ${SPAWN_ERROR}. Reinstall devcoach, then run ` +
        "`devcoach install --force`",
    });
    return out;
  }
  out.push({
    level: "ok",
    text: `command resolves to ${resolved}${hasSeparator(command) ? "" : ` on ${inputs.pathSource}`}`,
  });
  if (!hasSeparator(command)) {
    out.push({
      level: "warn",
      text:
        "bare name — the host resolves it on its own PATH, which can differ from your shell's; " +
        "`devcoach install --force` writes an absolute path",
    });
  }

  // `node.exe <bin.js> mcp` (the Windows form): the script is the first argument.
  const isNode = /(^|[/\\])node(\.exe)?$/i.test(resolved);
  const script = isNode ? args[0] : resolved;
  if (isNode && (!script || !existsSync(script))) {
    out.push({ level: "bad", text: `devcoach's script ${script ?? "(missing)"} does not exist` });
    return out;
  }

  const where = classifyPath(script ?? resolved, platform);
  if (where.ephemeral) {
    out.push({
      level: "bad",
      text: "lives in a temporary location (npx cache or an fnm shell) — it will disappear; run `devcoach install --force`",
    });
  } else if (where.boundTo) {
    out.push({
      level: "warn",
      text:
        `bound to Node ${where.boundTo} (${where.manager}) — removing or switching that version ` +
        `breaks it with ${SPAWN_ERROR}; run \`devcoach install --force\` after`,
    });
  }

  // The interpreter: the other cause of ENOENT (the file exists, what it names does not).
  let node: string | null = isNode ? resolved : null;
  if (!isNode && /\.(cmd|bat)$/i.test(resolved)) {
    node = resolveCommand("node", { ...inputs, platform });
    if (!node) {
      out.push({
        level: "bad",
        text: `the \`${resolved}\` shim needs \`node\`, not found on ${inputs.pathSource}`,
      });
      return out;
    }
  } else if (!isNode) {
    const shebang = interpreterOf(resolved);
    if (shebang) {
      const [interp, ...rest] = shebang.split(/\s+/);
      const viaEnv = /(^|\/)env$/.test(interp ?? "");
      const target = viaEnv ? rest.find((a) => !a.startsWith("-")) : interp;
      node = target ? (viaEnv ? resolveCommand(target, { ...inputs, platform }) : target) : null;
      if (!node || (!viaEnv && !existsSync(node))) {
        out.push({
          level: "bad",
          text: viaEnv
            ? `its \`#!${shebang}\` finds no \`${target}\` on ${inputs.pathSource} — the host fails before devcoach starts`
            : `its interpreter ${target} does not exist — the host fails with ${SPAWN_ERROR}. ` +
              "Reinstall that Node (e.g. `brew install node`) or devcoach",
        });
        return out;
      }
    }
  }

  if (node) {
    const v = run(node, ["--version"]);
    const major = v ? Number.parseInt(v.replace(/^v/, "").split(".")[0] ?? "0", 10) : null;
    if (major !== null && major < MIN_NODE_MAJOR)
      out.push({
        level: "bad",
        text: `runs on Node ${v} (${node}) — devcoach needs Node ${MIN_NODE_MAJOR} or newer`,
      });
    else if (v) out.push({ level: "ok", text: `runs on Node ${v.replace(/^v/, "")} (${node})` });
  }

  const reported = isNode
    ? run(resolved, [script as string, "--version"])
    : run(resolved, ["--version"]);
  const version = reported?.match(/(\d+\.\d+\.\d+[^\s]*)/)?.[1] ?? null;
  if (!version) out.push({ level: "warn", text: "could not run it to read its version" });
  else if (version !== VERSION)
    out.push({ level: "warn", text: `it runs devcoach ${version}; this doctor is ${VERSION}` });
  else out.push({ level: "ok", text: `it runs devcoach ${version}` });
  return out;
}
