import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli/commands";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import { VERSION } from "../src/version";

async function run(args: string[]): Promise<{ out: string; code: number | null }> {
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => lines.push(a.join(" ")));
  const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => lines.push(a.join(" ")));
  const errWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation((s: any) => {
    lines.push(String(s));
    return true;
  });
  // Commander writes --help / --version to stdout; capture it too.
  const outWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
    lines.push(String(s));
    return true;
  });
  let code: number | null = null;
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    code = c ?? 0;
    throw new Error("__exit__");
  }) as never);
  const argv = process.argv;
  process.argv = ["node", "bin", ...args];
  try {
    await runCli();
  } catch (e) {
    if ((e as Error).message !== "__exit__") throw e;
  } finally {
    process.argv = argv;
    logSpy.mockRestore();
    errSpy.mockRestore();
    errWriteSpy.mockRestore();
    outWriteSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { out: lines.join("\n"), code };
}

describe("cli", () => {
  it("welcome, version, unknown", async () => {
    expect((await run([])).out).toContain("devcoach");
    expect((await run(["-v"])).out).toContain("devcoach");
    expect((await run(["frobnicate"])).code).toBe(2);
  });

  it("hooks: onboard-hook then lesson-ready", async () => {
    db.withConnection((c) =>
      c.exec(
        "DELETE FROM knowledge; DELETE FROM knowledge_groups; DELETE FROM knowledge_group_names;",
      ),
    );
    expect((await run(["onboard-hook"])).code).toBe(2); // no profile → run onboarding
    db.withConnection((c) => db.upsertKnowledge(c, "python", 4));
    expect((await run(["onboard-hook"])).code).toBe(0); // profile exists → silent
    const lr = await run(["lesson-ready"]);
    expect(lr.code).toBe(2);
    expect(lr.out).toContain("Deliver a devcoach lesson");
  });

  it("knowledge + group + settings commands", async () => {
    expect(
      (await run(["knowledge-add", "rust", "--confidence", "6", "--group", "Languages"])).out,
    ).toContain("Added");
    expect((await run(["profile"])).out).toContain("Knowledge Map");
    expect((await run(["group-add", "Backend"])).out).toContain("ready");
    expect((await run(["group-assign", "rust", "Backend"])).out).toContain("Moved");
    expect((await run(["group-assign", "rust", "Other"])).out).toContain("Other");
    expect((await run(["group-assign", "missing", "X"])).code).toBe(1);
    expect((await run(["group-remove", "Backend"])).out).toContain("Removed group");
    expect((await run(["knowledge-remove", "rust"])).out).toContain("Removed");
    expect((await run(["set", "max_per_day", "5"])).out).toContain("Set max_per_day");
    expect((await run(["set", "bad", "5"])).code).toBe(1);
    expect((await run(["settings"])).out).toContain("max_per_day");
    expect((await run(["stats"])).out).toContain("Coaching Stats");
  });

  it("lesson commands (lesson/star/feedback/delete)", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "c1",
          timestamp: "2026-06-16T10:00:00Z",
          topic_id: "python",
          categories: ["python"],
          title: "Cli",
          level: "mid",
          summary: "s",
          branch: "main",
          commit_hash: "abcdef1",
        }),
      ),
    );
    expect((await run(["lessons"])).out).toContain("Cli");
    expect((await run(["lesson", "c1"])).out).toContain("Cli");
    expect((await run(["lesson", "missing"])).code).toBe(1);
    expect((await run(["star", "c1"])).out).toContain("starred");
    expect((await run(["unstar", "c1"])).out).toContain("unstarred");
    expect((await run(["star", "missing"])).code).toBe(1);
    expect((await run(["feedback", "c1", "know"])).out).toContain("confidence");
    expect((await run(["feedback", "c1", "clear"])).out).toContain("cleared");
    expect((await run(["feedback", "missing", "know"])).code).toBe(1);
    expect((await run(["feedback", "c1", "bogus"])).code).toBe(1);
    expect((await run(["delete", "c1"])).out).toContain("deleted");
    expect((await run(["delete", "c1"])).code).toBe(1);
  });

  it("backup + restore", async () => {
    db.withConnection((c) => db.upsertKnowledge(c, "go", 5));
    const file = join(mkdtempSync(join(tmpdir(), "dc-cli-")), "b.zip");
    expect((await run(["backup", file])).out).toContain("Backup saved");
    expect((await run(["restore", file])).out).toContain("restored");
    expect((await run(["restore", "/no/such/file.zip"])).code).toBe(1);
  });

  it("install writes Claude Desktop config", async () => {
    const r = await run(["install", "--claude-desktop", "--force"]);
    expect(r.out).toContain("Installed into");
  });

  it("install reports (and never clobbers) a malformed Claude Code settings file", async () => {
    const settings = join(process.env.HOME as string, ".claude", "settings.json");
    mkdirSync(dirname(settings), { recursive: true });
    const broken = "{ bad json,, }";
    writeFileSync(settings, broken);
    const savedPath = process.env.PATH;
    process.env.PATH = ""; // avoid spawning the real `claude` CLI — exercise the JSON path directly
    try {
      const r = await run(["install", "--claude-code", "--force"]);
      expect(r.out).toContain("is not valid JSON"); // friendly message, no stack trace
      expect(r.code).toBeNull(); // did not crash / exit non-zero
      expect(readFileSync(settings, "utf8")).toBe(broken); // left untouched
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("usage errors exit 2", async () => {
    expect((await run(["lesson"])).code).toBe(2);
    expect((await run(["set", "onlyone"])).code).toBe(2);
  });

  it("Commander help/version/error handling", async () => {
    // top-level --help → usage text, no crash, clean exit
    const help = await run(["--help"]);
    expect(help.out).toContain("Usage: devcoach");
    expect(help.out).toContain("lessons");
    expect(help.code).toBeNull(); // help is not an error exit

    // per-command --help (the case that used to crash with parseArgs)
    const lessonsHelp = await run(["lessons", "--help"]);
    expect(lessonsHelp.out).toContain("Usage: devcoach lessons");
    expect(lessonsHelp.out).toContain("--period");

    // --version
    const ver = await run(["--version"]);
    expect(ver.out).toContain(`devcoach ${VERSION}`);

    // unknown flag → friendly error, exit 2 (not a stack trace)
    const badFlag = await run(["lessons", "--nope"]);
    expect(badFlag.code).toBe(2);
    expect(badFlag.out).toContain("unknown option");
    expect(badFlag.out).not.toContain("at "); // no stack-trace frames
  });
});
