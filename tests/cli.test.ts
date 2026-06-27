import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseHookPayload, runCli } from "../src/cli/commands";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";
import { VERSION } from "../src/version";

// Drop a fake executable on a throwaway PATH dir so install can exercise the `claude` CLI branch.
function fakeBin(name: string, script: string): string {
  const dir = mkdtempSync(join(tmpdir(), "dc-bin-"));
  writeFileSync(join(dir, name), script, { mode: 0o755 });
  return dir;
}
const cleanClaudeSettings = (): string => {
  const p = join(process.env.HOME as string, ".claude", "settings.json");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, "{}");
  return p;
};

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
    // No profile → emit a {decision:block} onboarding cue on stdout, exit 0 (not an error).
    const onb = await run(["onboard-hook"]);
    expect(onb.code).toBe(0);
    expect(onb.out).toContain('"decision":"block"');
    expect(onb.out).toContain("complete_onboarding");
    db.withConnection((c) => {
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "0"); // disable interaction pacing for this test
    });
    // Profile exists → silent: exit 0 with no decision payload.
    const silent = await run(["onboard-hook"]);
    expect(silent.code).toBe(0);
    expect(silent.out).not.toContain("decision");
    // Lesson due → {decision:block} cue carrying the self-contained directive.
    const lr = await run(["lesson-ready"]);
    expect(lr.code).toBe(0);
    expect(lr.out).toContain('"decision":"block"');
    expect(lr.out).toContain("log_lesson");
    expect(lr.out).toContain("devcoach://profile");
    expect(lr.out).toContain("devcoach://notebook");
    expect(lr.out).toContain("update_notebook");
  });

  it("lesson-ready gates the notebook update to every 10 lessons", async () => {
    const seed = (n: number) =>
      db.withConnection((c) => {
        c.exec("DELETE FROM lessons");
        for (let i = 0; i < n; i++) {
          db.insertLesson(
            c,
            parseLesson({
              id: `seed-${i}`,
              timestamp: "2026-01-01T00:00:00Z",
              topic_id: "python",
              categories: [],
              title: "T",
              level: "mid",
              summary: "s",
            }),
          );
        }
        db.upsertKnowledge(c, "python", 4);
        db.setSetting(c, "nudge_every", "0"); // isolate the notebook-checkpoint gate
      });
    seed(5); // next lesson is #6 → not a checkpoint → skip the notebook update
    expect((await run(["lesson-ready"])).out).toContain("Do NOT call update_notebook");
    seed(9); // next lesson is #10 → checkpoint → update the notebook
    const due = await run(["lesson-ready"]);
    expect(due.out).toContain("notebook checkpoint");
    expect(due.out).toContain("call update_notebook");
  });

  it("lesson-ready paces the cue by nudge_every (interaction counter)", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM lessons; DELETE FROM nudge_state;");
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "2");
    });
    // 1st eligible stop → counter 1 < 2 → silent
    expect((await run(["lesson-ready"])).out).not.toContain("decision");
    // 2nd → counter 2 ≥ 2 → cue
    expect((await run(["lesson-ready"])).out).toContain('"decision":"block"');
  });

  it("set accepts/validates nudge_every and nudge_scope", async () => {
    expect((await run(["set", "nudge_every", "5"])).out).toContain("Set nudge_every");
    expect((await run(["set", "nudge_every", "abc"])).code).toBe(1);
    expect((await run(["set", "nudge_scope", "global"])).out).toContain("Set nudge_scope");
    expect((await run(["set", "nudge_scope", "bogus"])).code).toBe(1);
    expect((await run(["settings"])).out).toContain("nudge_scope");
  });

  it("parseHookPayload: extracts stop_hook_active and permission_mode", () => {
    expect(parseHookPayload(JSON.stringify({ stop_hook_active: true })).stop_hook_active).toBe(
      true,
    );
    expect(parseHookPayload(JSON.stringify({ stop_hook_active: false })).stop_hook_active).toBe(
      false,
    );
    expect(parseHookPayload(JSON.stringify({ permission_mode: "plan" })).permission_mode).toBe(
      "plan",
    );
    expect(parseHookPayload(JSON.stringify({ permission_mode: "default" })).permission_mode).toBe(
      "default",
    );
    const empty = parseHookPayload("not json");
    expect(empty.stop_hook_active).toBe(false);
    expect(empty.permission_mode).toBe(null);
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

  it("install via a present `claude` CLI registers + writes/overwrites Stop hooks", async () => {
    const settings = cleanClaudeSettings();
    const binDir = fakeBin("claude", "#!/bin/sh\nexit 0\n");
    const savedPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      const r = await run(["install", "--claude-code", "--force"]);
      expect(r.out).toContain("Registered via");
      expect(r.out).toContain("Stop hooks installed");
      const saved = JSON.parse(readFileSync(settings, "utf8"));
      const cmds = saved.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
      expect(cmds.some((cmd: string) => cmd.includes("onboard-hook"))).toBe(true);
      expect(cmds.some((cmd: string) => cmd.includes("lesson-ready"))).toBe(true);

      // re-run without --force → hooks already present, left alone
      expect((await run(["install", "--claude-code"])).out).toContain(
        "Stop hooks already installed",
      );
      // re-run with --force → existing devcoach hooks removed and re-added
      expect((await run(["install", "--claude-code", "--force"])).out).toContain(
        "Stop hooks installed",
      );
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("install surfaces an existing/failed `claude mcp add`", async () => {
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = fakeBin("claude", '#!/bin/sh\necho "already exists" >&2\nexit 1\n');
      expect((await run(["install", "--claude-code", "--skip-hook"])).out).toContain(
        "Already registered",
      );
      process.env.PATH = fakeBin("claude", "#!/bin/sh\necho boom >&2\nexit 1\n");
      expect((await run(["install", "--claude-code", "--skip-hook"])).out).toContain(
        "claude mcp add failed",
      );
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("install into Claude Desktop reports an already-registered server", async () => {
    expect((await run(["install", "--claude-desktop", "--force"])).out).toContain("Installed into");
    expect((await run(["install", "--claude-desktop"])).out).toContain("Already registered");
  });

  it("onboard-hook re-cues every stop until a profile exists (no debounce)", async () => {
    db.withConnection((c) =>
      c.exec(
        "DELETE FROM knowledge; DELETE FROM knowledge_groups; DELETE FROM knowledge_group_names;",
      ),
    );
    // No 24h session window any more: an unanswered cue must fire again next stop,
    // so an interrupted onboarding is never silently suppressed.
    const first = await run(["onboard-hook"]);
    expect(first.out).toContain('"decision":"block"');
    const second = await run(["onboard-hook"]);
    expect(second.out).toContain('"decision":"block"');
  });

  it("hooks never create coaching.db when there is no profile", async () => {
    rmSync(db.DB_PATH, { force: true });
    // onboard-hook cues, lesson-ready stays silent — neither opens (creates) the DB.
    const onb = await run(["onboard-hook"]);
    expect(onb.out).toContain('"decision":"block"');
    expect(existsSync(db.DB_PATH)).toBe(false);
    const lr = await run(["lesson-ready"]);
    expect(lr.out).not.toContain("decision");
    expect(existsSync(db.DB_PATH)).toBe(false);
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

describe("cli rich rendering branches", () => {
  function seed() {
    db.withConnection((c) => {
      const mk = (o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            timestamp: "2026-06-16T10:00:00Z",
            topic_id: "python",
            categories: ["python"],
            summary: "s",
            ...o,
          }),
        );
      mk({ id: "jr", title: "Jr", level: "junior", feedback: "dont_know", starred: true });
      mk({
        id: "sr",
        title: "Sr",
        level: "senior",
        feedback: "know",
        starred: true,
        task_context: "ctx",
        project: "P",
        repository: "o/r",
        repository_platform: "github",
        branch: "main",
        commit_hash: "abc1234",
        folder: "/f",
      });
      mk({ id: "po", title: "Po", level: "mid", project: "OnlyP" }); // project, no branch/commit
    });
  }

  it("lessons table renders junior/senior colors, dont_know icon, and meta columns", async () => {
    seed();
    const out = (await run(["lessons"])).out;
    expect(out).toContain("Jr");
    expect(out).toContain("Sr");
    expect(out).toContain("OnlyP"); // project column populated
  });

  it("lesson detail renders git metadata, context, starred, and both feedback labels", async () => {
    const sr = (await run(["lesson", "sr"])).out;
    expect(sr).toContain("project=P");
    expect(sr).toContain("branch=");
    expect(sr).toContain("commit=");
    expect(sr).toContain("folder=/f");
    expect(sr).toContain("Context:");
    expect(sr).toContain("★ starred");
    expect(sr).toContain("I know this");
    const jr = (await run(["lesson", "jr"])).out;
    expect(jr).toContain("I don't know this");
  });

  it("feedback dont_know lowers confidence", async () => {
    expect((await run(["feedback", "sr", "dont_know"])).out).toContain("confidence");
  });

  it("stats shows weakest and strongest topics", async () => {
    db.withConnection((c) => {
      db.upsertKnowledge(c, "weak1", 1);
      db.upsertKnowledge(c, "weak2", 2);
      db.upsertKnowledge(c, "strong1", 9);
      db.upsertKnowledge(c, "strong2", 10);
    });
    const out = (await run(["stats"])).out;
    expect(out).toContain("Weakest topics");
    expect(out).toContain("Strongest topics");
  });

  it("knowledge-add without a group lands in Other; remove of a missing topic warns", async () => {
    expect((await run(["knowledge-add", "loner", "--confidence", "3"])).out).toContain("Added");
    expect((await run(["knowledge-remove", "ghost"])).out).toContain("not found");
  });

  it("group-add rejects the reserved 'Other' name", async () => {
    expect((await run(["group-add", "Other"])).code).toBe(1);
  });

  it("backup notes the notebook when a learning-state file exists", async () => {
    writeFileSync(db.LEARNING_STATE_PATH, "# notes\n");
    const file = join(mkdtempSync(join(tmpdir(), "dc-nb-")), "b.zip");
    expect((await run(["backup", file])).out).toContain("+ notebook");
    // restoring it twice → second run reports duplicates skipped + notebook restored
    await run(["restore", file]);
    expect((await run(["restore", file])).out).toContain("duplicates skipped");
  });

  it("install uses the bare `devcoach` command when it is on PATH", async () => {
    const binDir = fakeBin("devcoach", "#!/bin/sh\nexit 0\n");
    const savedPath = process.env.PATH;
    process.env.PATH = binDir; // devcoach present, claude absent
    try {
      const r = await run(["install", "--claude-desktop", "--force"]);
      expect(r.out).toContain("devcoach mcp"); // detectInstallMethod chose the bare command
    } finally {
      process.env.PATH = savedPath;
    }
  });
});
