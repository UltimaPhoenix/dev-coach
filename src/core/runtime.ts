// Where is this devcoach running from, and on which Node? One answer, used by the MCP server's
// startup line (a host's log is often the only thing a user can send), by `devcoach doctor` and
// by `devcoach install` when it decides which command a host should start.
//
// Pure: every input (path, platform, home, env) is a parameter with a process default, so the
// table below is testable for macOS, Linux and Windows from any OS.
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { VERSION } from "../version";

/** How this devcoach was installed — read from where its entry script lives. */
export type Channel =
  | "claude-plugin"
  | "gemini-extension"
  | "claude-desktop-extension"
  | "npx"
  | "homebrew"
  | "npm-global"
  | "source"
  | "unknown";

/** What provides a Node: a version manager, Homebrew, or a system / installer copy. */
export type NodeManager =
  | "nvm"
  | "nvm-windows"
  | "fnm"
  | "volta"
  | "asdf"
  | "mise"
  | "n"
  | "homebrew"
  | "system"
  | "unknown";

export interface PathClass {
  channel: Channel;
  /** The version manager whose per-version directory holds this path, if any. */
  manager: NodeManager | null;
  /** That Node version, e.g. "v26.5.0" — the path disappears with it. */
  boundTo: string | null;
  /** Gone after a cache clean (npx) or when the shell that created it exits (fnm multishells). */
  ephemeral: boolean;
}

export const MIN_NODE_MAJOR = 24;

/** Forward slashes everywhere; Windows paths are also case-insensitive, so lower-case them. */
export function normalizePath(path: string, platform: NodeJS.Platform = process.platform): string {
  const forward = path.replace(/\\/g, "/");
  return platform === "win32" ? forward.toLowerCase() : forward;
}

// [manager, pattern] — the captured group is the Node version the directory belongs to.
// Order matters: the first match wins.
const VERSIONED_NODE_DIRS: [NodeManager, RegExp][] = [
  ["nvm", /\/\.nvm\/versions\/node\/(v?[\d.]+[^/]*)\//],
  ["nvm-windows", /\/appdata\/roaming\/nvm\/(v?[\d.]+[^/]*)\//],
  ["fnm", /\/fnm\/node-versions\/(v?[\d.]+[^/]*)\//],
  ["volta", /\/\.volta\/tools\/image\/node\/(v?[\d.]+[^/]*)\//],
  ["volta", /\/volta\/tools\/image\/node\/(v?[\d.]+[^/]*)\//],
  ["asdf", /\/\.asdf\/installs\/nodejs\/(v?[\d.]+[^/]*)\//],
  ["mise", /\/mise\/installs\/node\/(v?[\d.]+[^/]*)\//],
  ["n", /\/n\/versions\/node\/(v?[\d.]+[^/]*)\//],
];

function versionedDir(p: string): { manager: NodeManager; boundTo: string } | null {
  for (const [manager, pattern] of VERSIONED_NODE_DIRS) {
    const m = pattern.exec(p);
    if (m?.[1]) return { manager, boundTo: m[1].startsWith("v") ? m[1] : `v${m[1]}` };
  }
  return null;
}

function channelOf(p: string): Channel {
  const lower = p.toLowerCase();
  if (lower.includes("/.claude/plugins/data/") || lower.includes("/.claude/plugins/cache/"))
    return "claude-plugin";
  if (lower.includes("/.devcoach/gemini-ext/")) return "gemini-extension";
  if (lower.includes("/claude extensions/")) return "claude-desktop-extension";
  if (lower.includes("/_npx/")) return "npx";
  if (lower.includes("/cellar/devcoach/")) return "homebrew";
  if (lower.includes("/node_modules/devcoach/")) return "npm-global";
  if (/\/(src\/core\/runtime\.ts|src\/bin\.ts|dist\/[^/]+\.js)$/.test(lower)) return "source";
  return "unknown";
}

/** Classify where a devcoach entry script (or any file of an install) lives. */
export function classifyPath(
  path: string,
  platform: NodeJS.Platform = process.platform,
): PathClass {
  const p = normalizePath(path, platform);
  const versioned = versionedDir(p);
  const lower = p.toLowerCase();
  return {
    channel: channelOf(p),
    manager: versioned?.manager ?? (lower.includes("/fnm_multishells/") ? "fnm" : null),
    boundTo: versioned?.boundTo ?? null,
    ephemeral: lower.includes("/_npx/") || lower.includes("/fnm_multishells/"),
  };
}

/** Which manager provides a Node binary, from its path. */
export function nodeManagerOf(
  execPath: string,
  platform: NodeJS.Platform = process.platform,
): NodeManager {
  const p = normalizePath(execPath, platform);
  const lower = p.toLowerCase();
  const versioned = versionedDir(p);
  if (versioned) return versioned.manager;
  if (lower.includes("/fnm_multishells/")) return "fnm";
  if (lower.includes("/.volta/") || lower.includes("/volta/")) return "volta";
  if (
    lower.includes("/cellar/node") ||
    lower.includes("/opt/homebrew/") ||
    lower.includes("/linuxbrew/") ||
    lower.startsWith("/usr/local/opt/node")
  )
    return "homebrew";
  if (
    lower.startsWith("/usr/bin/") ||
    lower.startsWith("/usr/local/bin/") ||
    lower.includes("/program files/nodejs/") ||
    lower.startsWith("/snap/")
  )
    return "system";
  return "unknown";
}

/** The Node requirement as a sentence, or null when `version` is new enough. */
export function nodeProblem(version: string): string | null {
  const major = Number.parseInt(version.split(".")[0] ?? "0", 10);
  if (major >= MIN_NODE_MAJOR) return null;
  return `devcoach ${VERSION} needs Node ${MIN_NODE_MAJOR} or newer (it uses the built-in node:sqlite); this is Node ${version}`;
}

/** A path for a log the user may share: the home directory shown as `~` / `%USERPROFILE%`. */
export function displayPath(
  path: string,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (!home) return path;
  const sep = platform === "win32" ? "\\" : "/";
  const token = platform === "win32" ? "%USERPROFILE%" : "~";
  if (platform === "win32") {
    if (path.toLowerCase() === home.toLowerCase()) return token;
    if (path.toLowerCase().startsWith(`${home.toLowerCase()}${sep}`))
      return token + path.slice(home.length);
    return path;
  }
  if (path === home) return token;
  return path.startsWith(`${home}${sep}`) ? token + path.slice(home.length) : path;
}

export interface RuntimeInfo {
  version: string;
  node: string;
  execPath: string;
  nodeManager: NodeManager;
  /** The running devcoach's package directory (or its code file outside a package). */
  entry: string;
  where: PathClass;
}

export interface RuntimeInputs {
  /** The file this code runs from — defaults to this module, symlinks resolved. */
  codePath?: string;
  execPath?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
}

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/**
 * `process.argv[1]` is NOT where devcoach runs from: the plugin and Gemini launchers import
 * devcoach's `bin.js` in-process, so argv[1] stays the launcher script. The file this module was
 * loaded from is always the running devcoach — `<package>/dist/<chunk>.js` once bundled,
 * `src/core/runtime.ts` from source — and its package directory is what a reader wants to see.
 */
export function describeRuntime(inputs: RuntimeInputs = {}): RuntimeInfo {
  const platform = inputs.platform ?? process.platform;
  const execPath = inputs.execPath ?? process.execPath;
  const code = inputs.codePath ?? real(fileURLToPath(import.meta.url));
  const root = /^(.*)[/\\](?:dist[/\\][^/\\]+\.js|src[/\\]core[/\\]runtime\.ts)$/.exec(code)?.[1];
  return {
    version: VERSION,
    node: inputs.nodeVersion ?? process.versions.node,
    execPath,
    nodeManager: nodeManagerOf(execPath, platform),
    entry: root ?? code,
    where: classifyPath(code, platform),
  };
}

/** `npm-global, bound to Node v26.5.0 (nvm)` — the install, and what it depends on. */
export function describeWhere(where: PathClass): string {
  const parts: string[] = [where.channel];
  if (where.boundTo) parts.push(`bound to Node ${where.boundTo} (${where.manager})`);
  if (where.ephemeral) parts.push("temporary location");
  return parts.join(", ");
}

/**
 * The line a server writes to stderr when it starts — what every host keeps in its MCP log.
 * `extra` carries what only the caller knows (the data directory, the schema).
 */
export function runtimeLine(
  subcommand: string,
  info: RuntimeInfo,
  extra: string[] = [],
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const show = (p: string) => displayPath(p, home, platform);
  return [
    `devcoach ${info.version} ${subcommand}`,
    `node ${info.node} via ${info.nodeManager} (${show(info.execPath)})`,
    `${describeWhere(info.where)} (${show(info.entry)})`,
    ...extra,
  ].join(" · ");
}
