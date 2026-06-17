// Git context auto-detection (3s timeout, never throws).
// All git calls have a 3-second timeout and never throw.
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

export interface GitContext {
  project: string | null;
  repository: string | null;
  branch: string | null;
  commit_hash: string | null;
  folder: string | null;
  repository_platform: string | null;
}

function run(...args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}

const PLATFORM_MAP: Record<string, string> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
};

function parseRemote(remote: string | null): [string | null, string | null] {
  if (!remote) return [null, null];

  // SSH: git@host:org/repo.git
  const ssh = /^git@([^:]+):(.+?)(?:\.git)?$/.exec(remote);
  if (ssh) {
    const host = (ssh[1] ?? "").toLowerCase();
    return [ssh[2] ?? remote, PLATFORM_MAP[host] ?? "local"];
  }

  // HTTPS: https://host/org/repo[.git]
  const https = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/.exec(remote);
  if (https) {
    const host = (https[1] ?? "").toLowerCase();
    return [https[2] ?? remote, PLATFORM_MAP[host] ?? "local"];
  }

  return [remote, "local"];
}

export function detectGitContext(): GitContext {
  const folder = process.cwd();
  let branch = run("rev-parse", "--abbrev-ref", "HEAD");
  const commit = run("rev-parse", "HEAD");
  const remote = run("remote", "get-url", "origin");

  const [repository, platform] = parseRemote(remote);

  let project: string | null;
  if (repository) {
    project = repository.replace(/\/+$/, "").split("/").pop() ?? null;
  } else {
    project = basename(folder) || null;
  }

  if (branch === "HEAD") branch = null;

  return {
    project,
    repository,
    branch,
    commit_hash: commit,
    folder,
    repository_platform: platform,
  };
}
