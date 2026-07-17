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
    expect(lr.out).toContain("devcoach://briefing");
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

  it("lesson-ready resets pacing on emission (no cue storm) and retries while pending", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM lessons; DELETE FROM nudge_state; UPDATE cue_state SET pending = 0;");
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "2");
      db.setSetting(c, "min_gap_minutes", "0");
      db.setSetting(c, "max_per_day", "99");
    });
    expect((await run(["lesson-ready"])).out).not.toContain("decision");
    const cue = await run(["lesson-ready"]);
    expect(cue.out).toContain('"decision":"block"');
    // the new compact cue invokes the skill and offers the explicit no-op path
    expect(cue.out).toContain("devcoach` skill");
    expect(cue.out).toContain("skip_lesson");
    expect(cue.out).toContain("systemMessage");
    // the stop right after a cue is silent again (reset-on-emission)…
    expect((await run(["lesson-ready"])).out).not.toContain("decision");
    // …and the unresolved cue re-fires at the retry threshold
    expect((await run(["lesson-ready"])).out).toContain('"decision":"block"');
  });

  it("prompt-hook primes only when the next stop reaches the threshold", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM lessons; DELETE FROM nudge_state; UPDATE cue_state SET pending = 0;");
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "2");
      db.setSetting(c, "min_gap_minutes", "0");
      db.setSetting(c, "max_per_day", "99");
    });
    // counter 0 → next stop is 1/2 → no prime
    expect((await run(["prompt-hook"])).out).not.toContain("additionalContext");
    db.withConnection((c) => db.bumpNudge(c, "__nosession__", "session"));
    // counter 1 → next stop reaches 2/2 → prime, without bumping
    const primed = await run(["prompt-hook"]);
    expect(primed.out).toContain("additionalContext");
    expect(primed.out).toContain("skip_lesson");
    expect(db.withConnection((c) => db.peekNudge(c, "__nosession__", "session"))).toBe(1);
  });

  it("doctor reports wiring, pacing, and a verdict — and always exits 0", async () => {
    cleanClaudeSettings();
    db.withConnection((c) => {
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "2");
    });
    const r = await run(["doctor"]);
    expect(r.code).toBeNull(); // never process.exit(≠0)
    expect(r.out).toContain("devcoach doctor");
    expect(r.out).toContain("no devcoach hooks");
    expect(r.out).toContain("onboarding complete");
    expect(r.out).toContain("nudge_every=2");
    expect(r.out).toContain("Verdict");

    writeFileSync(join(process.env.HOME as string, ".claude", "settings.json"), "{bad json");
    expect((await run(["doctor"])).out).toContain("not valid JSON");

    // plugin + settings.json hooks at once → double-count warning
    writeFileSync(
      join(process.env.HOME as string, ".claude", "settings.json"),
      JSON.stringify({
        enabledPlugins: { "devcoach@marketplace": true },
        hooks: { Stop: [{ hooks: [{ type: "command", command: "devcoach stop-hook" }] }] },
      }),
    );
    expect((await run(["doctor"])).out).toContain("registered TWICE");
  });

  it("DEVCOACH_HOOK_DEBUG=1 logs hook decisions to ~/.devcoach/hook.log", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM nudge_state;");
      db.upsertKnowledge(c, "python", 4);
      db.setSetting(c, "nudge_every", "5");
    });
    process.env.DEVCOACH_HOOK_DEBUG = "1";
    try {
      await run(["lesson-ready"]);
    } finally {
      delete process.env.DEVCOACH_HOOK_DEBUG;
    }
    const logFile = join(process.env.HOME as string, ".devcoach", "hook.log");
    expect(readFileSync(logFile, "utf8")).toContain("lesson-ready - paced");
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
    expect(empty.permission_mode).toBeNull();
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

  it("install via a present `claude` CLI registers + writes/repairs the hooks", async () => {
    const settings = cleanClaudeSettings();
    const binDir = fakeBin("claude", "#!/bin/sh\nexit 0\n");
    const savedPath = process.env.PATH;
    process.env.PATH = binDir;
    try {
      const r = await run(["install", "--claude-code", "--force"]);
      expect(r.out).toContain("Registered via");
      expect(r.out).toContain("Hooks installed");
      const saved = JSON.parse(readFileSync(settings, "utf8"));
      expect(saved.hooks.Stop).toHaveLength(1);
      expect(saved.hooks.Stop[0].hooks[0].command).toContain("stop-hook");
      expect(saved.hooks.Stop[0].hooks[0].timeout).toBe(60);
      expect(saved.hooks.UserPromptSubmit[0].hooks[0].command).toContain("prompt-hook");
      expect(saved.hooks.UserPromptSubmit[0].hooks[0].timeout).toBe(30);

      // re-run without --force → current layout, left alone
      expect((await run(["install", "--claude-code"])).out).toContain("Already installed");

      // legacy two-entry Stop layout (pre-0.8) is repaired WITHOUT --force,
      // leaving foreign hooks untouched
      saved.hooks.Stop = [
        { hooks: [{ type: "command", command: "npx -y devcoach onboard-hook" }] },
        { hooks: [{ type: "command", command: "npx -y devcoach lesson-ready" }] },
        { hooks: [{ type: "command", command: "my-other-tool --check" }] },
      ];
      saved.hooks.UserPromptSubmit = undefined;
      writeFileSync(settings, JSON.stringify(saved));
      expect((await run(["install", "--claude-code"])).out).toContain("Hooks installed");
      const repaired = JSON.parse(readFileSync(settings, "utf8"));
      const stopCmds = repaired.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
      expect(stopCmds).toHaveLength(2); // merged devcoach entry + the foreign hook
      expect(stopCmds.some((cmd: string) => cmd.includes("stop-hook"))).toBe(true);
      expect(stopCmds.some((cmd: string) => cmd.includes("my-other-tool"))).toBe(true);
      expect(stopCmds.some((cmd: string) => cmd.includes("lesson-ready"))).toBe(false);
      expect(repaired.hooks.UserPromptSubmit).toHaveLength(1);

      // dev-tree layouts spell it `dev-coach` (not `devcoach`) — they must be swept
      // too, or they double-count interactions alongside the current entry (seen live)
      repaired.hooks.Stop = [
        {
          hooks: [
            { type: "command", command: "node /Users/x/dev/dev-coach/dist/bin.js onboard-hook" },
          ],
        },
        {
          hooks: [
            { type: "command", command: "node /Users/x/dev/dev-coach/dist/bin.js lesson-ready" },
          ],
        },
        { hooks: [{ type: "command", command: "/opt/homebrew/bin/devcoach stop-hook" }] },
      ];
      writeFileSync(settings, JSON.stringify(repaired));
      expect((await run(["install", "--claude-code"])).out).toContain("Hooks installed");
      const swept = JSON.parse(readFileSync(settings, "utf8"));
      expect(swept.hooks.Stop).toHaveLength(1);
      expect(swept.hooks.Stop[0].hooks[0].command).toContain("stop-hook");
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("install skips the hooks when the devcoach plugin is enabled", async () => {
    const settings = cleanClaudeSettings();
    writeFileSync(settings, JSON.stringify({ enabledPlugins: { "devcoach@ultimaphoenix": true } }));
    const savedPath = process.env.PATH;
    process.env.PATH = fakeBin("claude", "#!/bin/sh\nexit 0\n");
    try {
      const r = await run(["install", "--claude-code"]);
      expect(r.out).toContain("plugin already provides the hooks");
      expect(JSON.parse(readFileSync(settings, "utf8")).hooks).toBeUndefined();
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

  it("install writes the Claude Code skill + stamp; welcome/stats hint when missing or outdated", async () => {
    const settings = cleanClaudeSettings();
    const skillDir = join(process.env.HOME as string, ".claude", "skills", "devcoach");
    const savedPath = process.env.PATH;
    process.env.PATH = fakeBin("claude", "#!/bin/sh\nexit 0\n");
    try {
      // Fresh install → SKILL.md + version stamp written.
      const r = await run(["install", "--claude-code", "--force"]);
      expect(r.out).toContain("Skill…");
      expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
      expect(readFileSync(join(skillDir, ".devcoach-version"), "utf8").trim()).toBe(VERSION);
      // Current → no hint, and a re-run without --force leaves it alone.
      expect((await run([])).out).not.toContain("out of date");
      expect((await run(["install", "--claude-code"])).out).toContain("Already installed");
      // Stale stamp (post-upgrade) → welcome + stats hint to re-run install…
      writeFileSync(join(skillDir, ".devcoach-version"), "0.0.1\n");
      expect((await run([])).out).toContain("out of date");
      expect((await run(["stats"])).out).toContain("out of date");
      // …and install refreshes it without --force (the skill file is devcoach-owned).
      expect((await run(["install", "--claude-code"])).out).toContain(`Installed into ${skillDir}`);
      expect(readFileSync(join(skillDir, ".devcoach-version"), "utf8").trim()).toBe(VERSION);
      // Missing + Stop hooks present → hinted; missing + no hooks (Desktop-only) → silent.
      rmSync(join(process.env.HOME as string, ".claude", "skills"), {
        recursive: true,
        force: true,
      });
      expect((await run([])).out).toContain("not installed");
      writeFileSync(settings, "{}");
      expect((await run([])).out).not.toContain("not installed");
    } finally {
      process.env.PATH = savedPath;
    }
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
