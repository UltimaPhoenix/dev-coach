import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectGitContext } from "../src/core/git";

const originalCwd = process.cwd();
afterEach(() => process.chdir(originalCwd));

function gitRepo(remote?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dc-git-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  if (remote) execFileSync("git", ["remote", "add", "origin", remote], { cwd: dir });
  return dir;
}

describe("detectGitContext", () => {
  it("parses an SSH remote → repository, project, github platform", () => {
    process.chdir(gitRepo("git@github.com:acme/widgets.git"));
    const ctx = detectGitContext();
    expect(ctx.repository).toBe("acme/widgets");
    expect(ctx.project).toBe("widgets");
    expect(ctx.repository_platform).toBe("github");
  });

  it("parses an HTTPS remote → gitlab platform", () => {
    process.chdir(gitRepo("https://gitlab.com/acme/widgets.git"));
    const ctx = detectGitContext();
    expect(ctx.repository).toBe("acme/widgets");
    expect(ctx.repository_platform).toBe("gitlab");
  });

  it("treats an unknown HTTPS host as a local platform", () => {
    process.chdir(gitRepo("https://git.example.com/team/proj.git"));
    expect(detectGitContext().repository_platform).toBe("local");
  });

  it("falls back to local for a non-SSH/HTTPS remote", () => {
    process.chdir(gitRepo("/srv/mirrors/proj.git"));
    expect(detectGitContext().repository_platform).toBe("local");
  });

  it("derives project from the folder name when there is no remote", () => {
    const dir = gitRepo();
    process.chdir(dir);
    const ctx = detectGitContext();
    expect(ctx.repository).toBeNull();
    expect(ctx.project).toBe(basename(dir));
    expect(ctx.repository_platform).toBeNull();
  });
});
