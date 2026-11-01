// Find a command the way a process spawn does. `devcoach install` uses it to decide which
// hook command to write (the absolute PATH hit outlives a GUI's shorter PATH), `doctor` to say
// whether the skill's `devcoach api …` calls will resolve in the agent's shell.
import { accessSync, constants, statSync } from "node:fs";

export interface LookupEnv {
  /** The PATH to search (defaults to this process's). */
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
 * Resolve a command the way a spawn does: an absolute or relative path as is, a bare name
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
