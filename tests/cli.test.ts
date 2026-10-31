import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_PING_MS,
  dashboardAnswers,
  lessonMeasure,
  pagerCommand,
  parseHookPayload,
  runCli,
  uiPort,
} from "../src/cli/commands";
import { displayWidth } from "../src/cli/term";
import * as courses from "../src/core/courses";
import * as db from "../src/core/db";
import { type Lesson, parseLesson } from "../src/core/models";
import { formatLessonForDisplay } from "../src/core/prompts";
import { buildSharePayload, encodeShareCode } from "../src/core/share";
import { fetchSharedInput } from "../src/core/share-fetch";
import { VERSION } from "../src/version";

vi.mock("../src/core/share-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/share-fetch")>();
  return { ...actual, fetchSharedInput: vi.fn(actual.fetchSharedInput) };
});

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

interface RunOptions {
  /** Pretend stdout is a terminal of this size (the views a person gets). */
  tty?: { columns: number; rows: number };
}

/** Swap stdout's terminal properties for one run; returns the undo. */
function fakeTerminal(tty: RunOptions["tty"]): () => void {
  if (!tty) return () => {};
  const keys = ["isTTY", "columns", "rows"] as const;
  const saved = keys.map((k) => Object.getOwnPropertyDescriptor(process.stdout, k));
  const values = { isTTY: true, columns: tty.columns, rows: tty.rows };
  for (const k of keys) {
    Object.defineProperty(process.stdout, k, { value: values[k], configurable: true });
  }
  return () =>
    keys.forEach((k, i) => {
      const d = saved[i];
      if (d) Object.defineProperty(process.stdout, k, d);
      else delete (process.stdout as unknown as Record<string, unknown>)[k];
    });
}

async function run(
  args: string[],
  opts: RunOptions = {},
): Promise<{ out: string; stdout: string; stderr: string; code: number | null }> {
  const lines: string[] = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const both = (sink: string[]) => (s: string) => {
    lines.push(s);
    sink.push(s);
  };
  const toOut = both(stdout);
  const toErr = both(stderr);
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => toOut(a.join(" ")));
  const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => toErr(a.join(" ")));
  const errWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation((s: any) => {
    toErr(String(s));
    return true;
  });
  // Commander writes --help / --version to stdout; capture it too.
  const outWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
    toOut(String(s));
    return true;
  });
  const restoreTerminal = fakeTerminal(opts.tty);
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
    restoreTerminal();
    logSpy.mockRestore();
    errSpy.mockRestore();
    errWriteSpy.mockRestore();
    outWriteSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { out: lines.join("\n"), stdout: stdout.join("\n"), stderr: stderr.join("\n"), code };
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
    expect(lr.out).toContain("get_briefing");
    expect(lr.out).toContain("notebook");
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
    expect((await run(["lesson-ready"])).out).toContain("Skip the notebook update this time");
    seed(9); // next lesson is #10 → checkpoint → update the notebook
    const due = await run(["lesson-ready"]);
    expect(due.out).toContain("notebook checkpoint");
    expect(due.out).toContain("references/calibration.md");
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
    expect(r.out).not.toContain("Runtime:"); // only when a plugin/extension launcher started us
    process.env.DEVCOACH_LAUNCHER = "devcoach plugin · devcoach 9.9.9 · /tmp/runtime/9.9.9";
    try {
      expect((await run(["doctor"])).out).toContain("Runtime: devcoach plugin · devcoach 9.9.9");
    } finally {
      delete process.env.DEVCOACH_LAUNCHER;
    }

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

    // release + beta channel both enabled → each ships the hooks
    writeFileSync(
      join(process.env.HOME as string, ".claude", "settings.json"),
      JSON.stringify({
        enabledPlugins: { "devcoach@ultimaphoenix": true, "devcoach@ultimaphoenix-beta": true },
      }),
    );
    const both = (await run(["doctor"])).out;
    expect(both).toContain("2 devcoach plugins enabled");
    expect(both).toContain("devcoach@ultimaphoenix-beta");
  });

  // Claude Desktop starts devcoach from its own config with its own PATH, which it prints in its
  // log. The fixture is the real log of a failed start (2026-10-05): six `Failed to spawn process:
  // No such file or directory`, nothing from devcoach. Doctor must say which of the two causes.
  // On Linux both paths follow XDG_CONFIG_HOME, which CI runners set: pin it inside the sandbox
  // HOME for these tests so doctor and install never look at the runner's real config.
  const desktopPaths = (home: string) => {
    if (process.platform !== "darwin") process.env.XDG_CONFIG_HOME = join(home, ".config");
    return process.platform === "darwin"
      ? {
          config: join(
            home,
            "Library",
            "Application Support",
            "Claude",
            "claude_desktop_config.json",
          ),
          log: join(home, "Library", "Logs", "Claude", "mcp-server-devcoach.log"),
        }
      : {
          config: join(home, ".config", "Claude", "claude_desktop_config.json"),
          log: join(home, ".config", "Claude", "logs", "mcp-server-devcoach.log"),
        };
  };
  const savedXdg = process.env.XDG_CONFIG_HOME;
  const restoreXdg = () => {
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
  };

  it.skipIf(process.platform === "win32")(
    "doctor checks Claude Desktop's entry on the PATH from Desktop's own log",
    async () => {
      cleanClaudeSettings();
      const home = process.env.HOME as string;
      const { config, log } = desktopPaths(home);
      mkdirSync(dirname(config), { recursive: true });
      mkdirSync(dirname(log), { recursive: true });
      const hostBin = mkdtempSync(join(tmpdir(), "dc-desktop-path-"));
      const fixture = readFileSync(
        join(__dirname, "fixtures", "claude-desktop-mcp-devcoach.log"),
        "utf8",
      ).replace(
        /paths: \[[\s\S]*?\[length\]: \d+/,
        `paths: [\n      '${hostBin}',\n      [length]: 1`,
      );
      writeFileSync(log, fixture);
      try {
        writeFileSync(config, JSON.stringify({ mcpServers: {} }));
        expect((await run(["doctor"])).out).toContain("not registered — add it with");

        // yesterday's case: the bare name is on no directory of Desktop's PATH
        writeFileSync(
          config,
          JSON.stringify({ mcpServers: { devcoach: { command: "devcoach", args: ["mcp"] } } }),
        );
        const bare = (await run(["doctor"])).out;
        expect(bare).toContain("registered: devcoach mcp");
        expect(bare).toContain("`devcoach` is not found on Claude Desktop's PATH (from its log)");
        expect(bare).toContain(`log: ${log}`);
        expect(bare).toContain(
          "last error in it: Failed to spawn process: No such file or directory",
        );

        // the other cause: the file exists, its #! interpreter does not
        const script = join(hostBin, "devcoach");
        writeFileSync(script, "#!/opt/gone/node\n", { mode: 0o755 });
        const interp = (await run(["doctor"])).out;
        expect(interp).toContain(
          `command resolves to ${script} on Claude Desktop's PATH (from its log)`,
        );
        expect(interp).toContain("its interpreter /opt/gone/node does not exist");
      } finally {
        rmSync(dirname(config), { recursive: true, force: true });
        rmSync(dirname(log), { recursive: true, force: true });
        restoreXdg();
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "install writes Claude Desktop an absolute command — npx when devcoach only lives in npx's cache",
    async () => {
      const { config } = desktopPaths(process.env.HOME as string);
      const savedPath = process.env.PATH;
      try {
        const real = fakeBin("devcoach", "#!/bin/sh\necho 0.0.0\n");
        process.env.PATH = real;
        await run(["install", "--claude-desktop", "--force"]);
        expect(JSON.parse(readFileSync(config, "utf8")).mcpServers.devcoach).toEqual({
          command: join(real, "devcoach"),
          args: ["mcp"],
        });

        // `npx -y devcoach install` puts npx's cache first on PATH: that path will vanish
        const npxBin = join(
          mkdtempSync(join(tmpdir(), "dc-npxcache-")),
          "_npx",
          "0123",
          "node_modules",
          ".bin",
        );
        mkdirSync(npxBin, { recursive: true });
        writeFileSync(join(npxBin, "devcoach"), "#!/bin/sh\n", { mode: 0o755 });
        process.env.PATH = npxBin;
        await run(["install", "--claude-desktop", "--force"]);
        expect(JSON.parse(readFileSync(config, "utf8")).mcpServers.devcoach).toEqual({
          command: "npx",
          args: ["-y", "devcoach", "mcp"],
        });
      } finally {
        process.env.PATH = savedPath;
        rmSync(dirname(config), { recursive: true, force: true });
        restoreXdg();
      }
    },
  );

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

  it("courses / course list and show a course", async () => {
    expect((await run(["courses"])).out).toContain("No courses yet");
    const course = db.withConnection((c) =>
      courses.createCourse(c, {
        title: "CLI course",
        topic_id: "python",
        goal: "See it in the terminal",
        prerequisites: [{ concept: "loops", known: true }],
      }),
    );
    const before = (await run(["course", course.id])).out;
    expect(before).toContain("not written yet");
    expect(before).toContain("No steps registered yet");
    writeFileSync(courses.documentPath(course.id), '<section id="step-1">x</section>');
    db.withConnection((c) => {
      courses.addStep(c, course.id, { title: "Loops", kind: "concept", anchor: "step-1" });
      courses.setStepStatus(c, course.id, 1, "done");
    });
    const list = (await run(["courses"])).out;
    expect(list).toContain("CLI course");
    expect(list).toContain("1/1");
    expect(list).toContain("completed");
    const show = (await run(["course", course.id])).out;
    expect(show).toContain("✅ loops");
    expect(show).toContain("1. Loops");
    expect(show).toContain("index.html");
    expect((await run(["course", "missing"])).code).toBe(1);
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
    expect((await run(["feedback", "c1", "yes"])).out).toContain("confidence");
    expect((await run(["feedback", "c1", "clear"])).out).toContain("answer cleared");
    expect((await run(["feedback", "missing", "yes"])).code).toBe(1);
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

  it("install --gemini writes settings.json hooks + MCP (fallback path) and the shared skill", async () => {
    const home = process.env.HOME as string;
    const settings = join(home, ".gemini", "settings.json");
    const skillDir = join(home, ".agents", "skills", "devcoach");
    rmSync(join(home, ".gemini"), { recursive: true, force: true });
    rmSync(join(home, ".agents"), { recursive: true, force: true });
    // An empty PATH dir guarantees the no-CLI fallback even when a real gemini is installed.
    const savedPath = process.env.PATH;
    process.env.PATH = mkdtempSync(join(tmpdir(), "dc-nobin-"));
    const r = await run(["install", "--gemini", "--force"]);
    expect(r.out).toContain("Gemini CLI (beta)");
    const saved = JSON.parse(readFileSync(settings, "utf8"));
    expect(saved.mcpServers.devcoach.args).toContain("mcp");
    expect(saved.hooks.AfterAgent[0].hooks[0].command).toContain("gemini-stop-hook");
    expect(saved.hooks.AfterAgent[0].hooks[0].timeout).toBe(60000);
    expect(saved.hooks.BeforeAgent[0].hooks[0].command).toContain("gemini-prompt-hook");
    expect(saved.hooks.BeforeAgent[0].hooks[0].timeout).toBe(30000);
    expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);
    expect(readFileSync(join(skillDir, ".devcoach-version"), "utf8").trim()).toBe(VERSION);

    // Re-run without --force → everything already current.
    expect((await run(["install", "--gemini"])).out).toContain("Already");

    // A stale gemini hook layout self-heals without --force (regex covers gemini-*-hook).
    saved.hooks.AfterAgent = [
      { hooks: [{ type: "command", command: "npx -y devcoach gemini-stop-hook" }] },
      { hooks: [{ type: "command", command: "my-other-tool --check" }] },
    ];
    writeFileSync(settings, JSON.stringify(saved));
    try {
      expect((await run(["install", "--gemini"])).out).toContain("Hooks installed");
      const repaired = JSON.parse(readFileSync(settings, "utf8"));
      const cmds = repaired.hooks.AfterAgent.flatMap((e: any) =>
        e.hooks.map((h: any) => h.command),
      );
      expect(cmds).toHaveLength(2);
      expect(cmds.some((c: string) => c.includes("my-other-tool"))).toBe(true);
      expect(repaired.hooks.AfterAgent.flatMap((e: any) => e.hooks)[1].timeout).toBe(60000);
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("install --gemini registers via a present `gemini` CLI and skips hooks+skill when the extension is installed", async () => {
    const home = process.env.HOME as string;
    rmSync(join(home, ".gemini"), { recursive: true, force: true });
    rmSync(join(home, ".agents"), { recursive: true, force: true });
    const savedPath = process.env.PATH;
    process.env.PATH = fakeBin("gemini", "#!/bin/sh\nexit 0\n"); // fake shadows any real gemini
    try {
      expect((await run(["install", "--gemini"])).out).toContain("Registered via `gemini mcp add`");
      // Extension manifest present → hooks and skill are its job (double-count guard).
      const extDir = join(home, ".gemini", "extensions", "devcoach");
      mkdirSync(extDir, { recursive: true });
      writeFileSync(join(extDir, "gemini-extension.json"), "{}");
      rmSync(join(home, ".gemini", "settings.json"), { force: true });
      rmSync(join(home, ".agents"), { recursive: true, force: true });
      const r = await run(["install", "--gemini"]);
      expect(r.out).toContain("extension already provides the hooks");
      expect(r.out).toContain("bundled with the devcoach Gemini extension");
      expect(existsSync(join(home, ".gemini", "settings.json"))).toBe(false);
      expect(existsSync(join(home, ".agents"))).toBe(false);
    } finally {
      process.env.PATH = savedPath;
      rmSync(join(home, ".gemini", "extensions"), { recursive: true, force: true });
    }
  });

  it("install --codex writes hooks.json + skill and prints the TOML snippet without the codex CLI", async () => {
    const home = process.env.HOME as string;
    const hooksJson = join(home, ".codex", "hooks.json");
    rmSync(join(home, ".codex"), { recursive: true, force: true });
    rmSync(join(home, ".agents"), { recursive: true, force: true });
    const savedPath = process.env.PATH;
    // An empty PATH dir guarantees the no-CLI branch even when a real codex is installed.
    process.env.PATH = mkdtempSync(join(tmpdir(), "dc-nobin-"));
    try {
      const r = await run(["install", "--codex"]);
      expect(r.out).toContain("Codex CLI (beta)");
      expect(r.out).toContain("[mcp_servers.devcoach]"); // manual TOML snippet, config left alone
      const saved = JSON.parse(readFileSync(hooksJson, "utf8"));
      expect(saved.hooks.Stop[0].hooks[0].command).toContain("codex-stop-hook");
      expect(saved.hooks.Stop[0].hooks[0].timeout).toBe(60);
      expect(saved.hooks.UserPromptSubmit[0].hooks[0].command).toContain("codex-prompt-hook");
      expect(existsSync(join(home, ".agents", "skills", "devcoach", "SKILL.md"))).toBe(true);

      // With a fake codex CLI on PATH the MCP step goes through `codex mcp add`.
      process.env.PATH = fakeBin("codex", "#!/bin/sh\nexit 0\n");
      expect((await run(["install", "--codex"])).out).toContain("Registered via `codex mcp add`");
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("install never clobbers malformed gemini/codex config files", async () => {
    const home = process.env.HOME as string;
    const settings = join(home, ".gemini", "settings.json");
    mkdirSync(dirname(settings), { recursive: true });
    writeFileSync(settings, "{not json");
    const r = await run(["install", "--gemini"]);
    expect(r.out).toContain("not valid JSON");
    expect(readFileSync(settings, "utf8")).toBe("{not json");
    rmSync(join(home, ".gemini"), { recursive: true, force: true });
  });

  it("doctor shows Gemini/Codex sections only when their config dirs exist", async () => {
    const home = process.env.HOME as string;
    rmSync(join(home, ".gemini"), { recursive: true, force: true });
    rmSync(join(home, ".codex"), { recursive: true, force: true });
    const before = await run(["doctor"]);
    expect(before.out).not.toContain("Gemini CLI wiring");
    expect(before.out).not.toContain("Codex CLI wiring");

    // Empty PATH dir → deterministic config-write path even with real CLIs installed.
    const savedPath = process.env.PATH;
    process.env.PATH = mkdtempSync(join(tmpdir(), "dc-nobin-"));
    try {
      await run(["install", "--gemini", "--codex", "--force"]);
    } finally {
      process.env.PATH = savedPath;
    }
    const after = await run(["doctor"]);
    expect(after.out).toContain("Gemini CLI wiring (beta)");
    expect(after.out).toContain("AfterAgent stop hook wired");
    expect(after.out).toContain("BeforeAgent priming hook wired");
    expect(after.out).toContain("Codex CLI wiring (beta)");
    expect(after.out).toContain("Stop hook wired");

    // Extension + settings hooks together → the double-registration alarm.
    const extDir = join(home, ".gemini", "extensions", "devcoach");
    mkdirSync(extDir, { recursive: true });
    writeFileSync(join(extDir, "gemini-extension.json"), "{}");
    expect((await run(["doctor"])).out).toContain("registered TWICE (extension + settings.json)");
    rmSync(join(home, ".gemini"), { recursive: true, force: true });
    rmSync(join(home, ".codex"), { recursive: true, force: true });
    rmSync(join(home, ".agents"), { recursive: true, force: true });
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

describe("cli on a database newer than this build (read-only)", () => {
  const stamp = (v: number) => {
    const raw = db.getConnection(db.DB_PATH);
    raw.exec(`PRAGMA user_version = ${v}`);
    raw.close();
  };

  it("read commands work and say so; a write is refused with the versions; doctor explains", async () => {
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: "ro1",
          timestamp: "2026-01-01T00:00:00Z",
          topic_id: "python",
          categories: [],
          title: "Read me",
          level: "mid",
          summary: "s",
        }),
      ),
    );
    stamp(99);
    try {
      const stats = await run(["stats"]);
      expect(stats.code).toBeNull();
      expect(stats.out).toContain("Reads work; writes need");
      const lessons = await run(["lessons"]);
      expect(lessons.out).toContain("Read me");
      expect(lessons.out).toContain("schema v99");
      await expect(run(["feedback", "ro1", "yes"])).rejects.toThrow(db.SchemaTooNewError);
      const doctor = await run(["doctor"]);
      expect(doctor.code).toBeNull();
      expect(doctor.out).toContain("READ-ONLY");
      expect(doctor.out).toContain(`devcoach ${VERSION} (schema v${db.SCHEMA_VERSION})`);
      const check = db.getConnection(db.DB_PATH);
      expect(
        (check.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
      ).toBe(99);
      check.close();
    } finally {
      stamp(db.SCHEMA_VERSION);
    }
    expect((await run(["doctor"])).out).toContain(
      `schema v${db.SCHEMA_VERSION}, last upgraded by devcoach ${VERSION}`,
    );
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

  it("lessons on a pipe: one row per lesson with its answer word", async () => {
    seed();
    const out = (await run(["lessons"])).out;
    expect(out).toContain("\tjr\tlost\tJr");
    expect(out).toContain("\tsr\tyes\tSr");
    expect(out).toContain("\tpo\t-\tPo");
  });

  it("lesson --short renders git metadata, context, starred, and both feedback labels", async () => {
    const sr = (await run(["lesson", "sr", "--short"])).out;
    expect(sr).toContain("project=P");
    expect(sr).toContain("branch=");
    expect(sr).toContain("commit=");
    expect(sr).toContain("folder=/f");
    expect(sr).toContain("Context:");
    expect(sr).toContain("★ starred");
    expect(sr).toContain("✅ knew it");
    const jr = (await run(["lesson", "jr", "--short"])).out;
    expect(jr).toContain("❌ lost me");
    expect((await run(["lesson", "po", "--short"])).out).toContain("○ no answer yet");
  });

  it("leaving yes undoes its +1; new and lost leave confidence alone", async () => {
    db.withConnection((c) => db.upsertKnowledge(c, "python", 5));
    const left = (await run(["feedback", "sr", "lost"])).out;
    const m = left.match(/confidence (\d+) → (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m?.[2])).toBe(Number(m?.[1]) - 1); // leaving `know` undoes its +1
    expect(left).toContain("❌ lost me");
    const fresh = (await run(["feedback", "sr", "new"])).out;
    expect(fresh).toContain("confidence unchanged");
    expect(fresh).toContain("✨ new to me");
  });

  it("feedback takes the answer words: yes records know, and says when it starts tracking a topic", async () => {
    db.withConnection((c) => {
      db.deleteKnowledge(c, "python");
      db.setFeedback(c, "po", null);
    });
    const yes = await run(["feedback", "po", "yes"]);
    expect(yes.code).toBeNull();
    expect(yes.out).toContain("✅ knew it");
    expect(yes.out).toContain("python wasn't on your knowledge map: it's tracked now, at 6/10.");
    expect(db.withConnection((c) => db.getLessonById(c, "po"))?.feedback).toBe("know");
    expect(db.withConnection((c) => db.getAllKnowledge(c)).python).toBe(6);
    // tracked now: clearing gives the point back and says so
    const cleared = (await run(["feedback", "po", "clear"])).out;
    expect(cleared).toContain("○ answer cleared · Po");
    expect(cleared).toContain("   python · confidence 6 → 5");
  });

  it("feedback refuses the stored values: the old word exits 1 and lists the four words", async () => {
    for (const old of ["know", "understood", "dont_know"]) {
      const r = await run(["feedback", "sr", old]);
      expect(r.code).toBe(1);
      expect(r.out).toContain(`Unknown answer '${old}'`);
      for (const word of ["yes", "new", "lost", "clear"])
        expect(r.out).toMatch(new RegExp(`^  ${word} `, "m"));
      expect(r.out).toContain("an untracked topic is created at 6/10");
    }
  });

  it("lessons --feedback filters by the answer words", async () => {
    db.withConnection((c) => {
      db.setFeedback(c, "jr", "understood");
      db.setFeedback(c, "sr", "dont_know");
      db.setFeedback(c, "po", null);
    });
    const fresh = (await run(["lessons", "--feedback", "new"])).out;
    expect(fresh).toContain("Jr");
    expect(fresh).not.toContain("Sr");
    const lost = (await run(["lessons", "--feedback", "lost"])).out;
    expect(lost).toContain("Sr");
    expect(lost).not.toContain("Jr");
    const none = (await run(["lessons", "--feedback", "none"])).out;
    expect(none).toContain("Po");
    expect(none).not.toContain("Jr");
    const old = await run(["lessons", "--feedback", "understood"]);
    expect(old.code).toBe(1);
    expect(old.out).toMatch(/^ {2}none {2}○ no answer yet$/m);
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

describe("cli share / import", () => {
  const seed = (id: string) =>
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id,
          timestamp: "2026-09-01T10:00:00Z",
          topic_id: "docker",
          categories: ["docker"],
          title: `Layer cache ${id}`,
          level: "mid",
          summary: "Order Dockerfile steps from stable to volatile.",
          body: "Body text.",
          folder: "/Users/someone/private",
          repository_platform: "local",
          repository: "/Users/someone/private",
        }),
      ),
    );

  it("share prints the card + code, --link the link, --file a .devcoach.md; errors are friendly", async () => {
    seed("s1");
    const text = await run(["share", "s1", "--anonymous"]);
    expect(text.out).toContain("🎓 devcoach");
    expect(text.out).toContain("Layer cache s1");
    expect(text.out).toMatch(/devcoach:lesson:1:[A-Za-z0-9_-]+/);
    expect(text.out).toContain("Shared anonymously");
    expect(text.out).not.toContain("/Users/someone"); // local paths never leave
    const link = await run(["share", "--last", "--anonymous", "--link"]);
    expect(link.out.trim()).toMatch(
      /^https:\/\/ultimaphoenix\.github\.io\/dev-coach\/lesson#devcoach:lesson:1:/,
    );
    const dir = mkdtempSync(join(tmpdir(), "dc-share-"));
    const file = join(dir, "l.devcoach.md");
    expect(
      (await run(["share", "s1", "--file", file, "--with-context", "--by", "Ada"])).out,
    ).toContain("Saved:");
    expect(readFileSync(file, "utf8")).toContain('shared_by: "Ada"');
    expect(readFileSync(file, "utf8")).not.toContain("/Users/someone");
    expect((await run(["share", "nope"])).code).toBe(1);
    expect((await run(["share"])).code).toBe(2);
    expect((await run(["share", "s1", "--by", "X", "--anonymous"])).code).toBe(1);
  });

  it("--by is remembered as share_name once; settings/set expose it", async () => {
    seed("s2");
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBe("Ada"); // from the --file share above
    expect((await run(["share", "s2", "--by", "Bob"])).out).toContain("Shared by Bob");
    expect(db.withConnection((c) => db.getSettings(c).share_name)).toBe("Ada"); // not overwritten
    expect((await run(["settings"])).out).toContain("Ada");
    expect((await run(["set", "share_name", "Carol"])).out).toContain("Set share_name = Carol");
    expect((await run(["set", "share_name", ""])).out).toContain("Cleared");
    expect((await run(["set", "share_name", "x".repeat(81)])).code).toBe(1);
    // no setting left → falls back to git user.name, or anonymous when git has none
    expect((await run(["share", "s2"])).out).toMatch(
      /Shared (by [^\n]+ with devcoach|anonymously)/,
    );
  });

  it("import takes a code, a file, stdin, a URL — duplicates and junk are reported, not thrown", async () => {
    seed("s3");
    const code =
      (await run(["share", "s3", "--anonymous"])).out.match(
        /devcoach:lesson:1:[A-Za-z0-9_-]+/,
      )?.[0] ?? "";
    db.withConnection((c) => c.exec("DELETE FROM lessons WHERE id = 's3'"));
    const first = await run(["import", code]);
    expect(first.out).toContain('Imported "Layer cache s3"');
    expect(first.out).toContain("shared anonymously");
    expect(first.out).toContain("not in your knowledge map");
    expect((await run(["import", code])).out).toContain("Already in your log");
    expect((await run(["lessons", "--imported"])).out).toContain("Layer cache s3");
    expect((await run(["lesson", "s3", "--short"])).out).toContain("Shared by:");
    expect((await run(["lesson", "s3"])).out).toContain("shared anonymously");
    // file
    seed("s4");
    const dir = mkdtempSync(join(tmpdir(), "dc-import-"));
    const file = join(dir, "l.devcoach.md");
    await run(["share", "s4", "--file", file, "--by", "Ada"]);
    db.withConnection((c) => c.exec("DELETE FROM lessons WHERE id = 's4'"));
    expect((await run(["import", file])).out).toContain("shared by Ada");
    expect((await run(["lessons", "--from", "Ada"])).out).toContain("Layer cache s4");
    expect((await run(["lessons", "--from", "Nobody"])).out).toContain("No lessons found");
    // stdin
    seed("s5");
    const stdinText = (await run(["share", "s5", "--anonymous"])).out;
    db.withConnection((c) => c.exec("DELETE FROM lessons WHERE id = 's5'"));
    const stdinSpy = vi
      .spyOn(process, "stdin", "get")
      .mockReturnValue(Readable.from([stdinText]) as never);
    try {
      expect((await run(["import", "-"])).out).toContain('Imported "Layer cache s5"');
    } finally {
      stdinSpy.mockRestore();
    }
    // URL (fetched) and share link (decoded locally, never fetched)
    seed("s6");
    const link = (await run(["share", "s6", "--anonymous", "--link"])).out.trim();
    db.withConnection((c) => c.exec("DELETE FROM lessons WHERE id = 's6'"));
    const fetchSpy = vi.mocked(fetchSharedInput).mockImplementation(async () => {
      throw new Error("must not fetch a share link");
    });
    try {
      expect((await run(["import", link])).out).toContain('Imported "Layer cache s6"');
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockResolvedValueOnce(stdinText);
      expect((await run(["import", "https://example.test/raw"])).out).toContain(
        "Already in your log",
      );
    } finally {
      fetchSpy.mockReset();
    }
    // legacy lessons array + junk
    expect(
      (
        await run([
          "import",
          JSON.stringify([
            {
              id: "legacy-1",
              timestamp: "2026-01-01T00:00:00Z",
              topic_id: "go",
              categories: [],
              title: "t",
              level: "mid",
              summary: "s",
            },
          ]),
        ])
      ).out,
    ).toContain("1 imported");
    const junk = await run(["import", "/no/such/file"]);
    expect(junk.code).toBe(1);
    expect(junk.out).toContain("Not a devcoach lesson");
    expect(junk.out).not.toContain("    at ");
  });

  it("import with no argument reads the clipboard, and says so when there is none", async () => {
    const path = process.env.PATH;
    process.env.PATH = ""; // no pbpaste/xclip reachable → friendly error, no spawn of anything real
    try {
      const r = await run(["import"]);
      expect(r.code).toBe(1);
      expect(r.out).toContain("Clipboard is empty or unavailable");
    } finally {
      process.env.PATH = path;
    }
    expect((await run([])).out).toContain("share / import");
  });
});

describe("cli prints someone else's text inert", () => {
  const ESC = "\x1b";
  const BEL = "\x07";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the test looks for control characters
  const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f\u{202a}-\u{202e}\u{2066}-\u{2069}]/u;
  const hostile = (id: string) =>
    parseLesson({
      id,
      timestamp: "2026-10-30T10:00:00Z",
      topic_id: `docker${BEL}`,
      categories: [`dev${ESC}[31mops`],
      title: `Cache mounts survive rebuilds${ESC}[2J${ESC}[3J${ESC}[H`,
      level: "mid",
      summary: `See ${ESC}]8;;file:///etc/passwd${BEL}the BuildKit guide${ESC}]8;;${BEL}.${ESC}]52;c;ZWNobyBwd25lZA==${BEL}`,
      body: `RUN --mount=type=cache\n\n${ESC}]8;;javascript:alert(1)${ESC}\\docs${ESC}]8;;${ESC}\\`,
      task_context: `ctx\x9b2J`,
      imported: true,
      shared_by: `${ESC}]8;;javascript:alert(1)${BEL}Ada${ESC}]8;;${BEL}`,
    });

  it("a crafted share imported with `import` never reaches the terminal as escapes", async () => {
    const payload = buildSharePayload(hostile("hostile-import"), {
      includeContext: true,
      sharedBy: hostile("x").shared_by,
    });
    const imported = await run(["import", encodeShareCode(payload)]);
    expect(imported.out).toContain('Imported "Cache mounts survive rebuilds" (shared by Ada)');
    expect(imported.out).not.toMatch(CONTROL);
    const outputs = [
      (await run(["lessons"])).out,
      (await run(["lesson", "hostile-import"])).out,
      (await run(["lesson", "hostile-import", "--short"])).out,
      (await run(["share", "hostile-import", "--anonymous"])).out,
    ];
    for (const out of outputs) expect(out).not.toMatch(CONTROL);
    expect(outputs[1]).toContain("shared by Ada");
    expect(outputs[1]).toMatch(/^docs$/m); // the body's link text, no hyperlink
    expect(outputs[2]).toContain("See the BuildKit guide.");
  });

  it("rows stored before the import-time strip still print inert (lessons, lesson, share, feedback, profile)", async () => {
    db.withConnection((c) => db.insertLesson(c, hostile("hostile-raw")));
    const runs = [
      ["lessons"],
      ["lessons", "--imported"],
      ["lesson", "hostile-raw"],
      ["lesson", "hostile-raw", "--short"],
      ["lesson", "hostile-raw", "--md"],
      ["lesson", "hostile-raw", "--json"],
      ["share", "hostile-raw", "--anonymous"],
      ["feedback", "hostile-raw", "know"], // creates the (hostile) topic in the knowledge map
      ["profile"],
      ["stats"],
    ];
    for (const args of runs) {
      const { out } = await run(args);
      expect(out, args.join(" ")).not.toMatch(CONTROL);
    }
    const shown = (await run(["lesson", "hostile-raw", "--short"])).out;
    expect(shown).toContain("Cache mounts survive rebuilds");
    expect(shown).toContain("Shared by:   Ada");
    expect(shown).toContain("See the BuildKit guide.");
    const full = (await run(["lesson", "hostile-raw"])).out;
    expect(full).toContain("Cache mounts survive rebuilds");
    expect(full).toContain("docker · mid · ");
    expect(full).toContain("· shared by Ada");
  });

  it("course text prints inert too", async () => {
    const course = db.withConnection((c) =>
      courses.createCourse(c, {
        topic_id: "docker",
        title: `Cache mounts${ESC}]0;owned${BEL}`,
        goal: `Know when${ESC}[2J`,
        prerequisites: [{ concept: `layers${ESC}c`, known: true }],
      }),
    );
    expect((await run(["courses"])).out).not.toMatch(CONTROL);
    const shown = (await run(["course", course.id])).out;
    expect(shown).not.toMatch(CONTROL);
    expect(shown).toContain("Know when");
  });

  it("lessons by day: wide glyphs (✨, CJK) never push a line past the width", async () => {
    db.withConnection((c) => {
      const mk = (o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            timestamp: "2026-10-29T10:00:00Z",
            topic_id: "sqlite",
            categories: ["sqlite"],
            level: "mid",
            summary: "s",
            ...o,
          }),
        );
      mk({ id: "wide-1", title: "WAL mode: readers never block writers", feedback: "understood" });
      mk({ id: "wide-2", title: "漢字のレッスン", feedback: "know", starred: true });
      mk({ id: "wide-3", title: "Plain title", feedback: "dont_know" });
    });
    for (const columns of [40, 60, 100]) {
      const out = (await run(["lessons"], { tty: { columns, rows: 50 } })).stdout;
      expect(out).toContain("✨ new to me");
      expect(out).toContain("漢字のレッスン");
      for (const line of out.split("\n")) {
        expect(displayWidth(line), line).toBeLessThanOrEqual(columns);
      }
    }
  });
});

describe("cli uninstall", () => {
  const home = () => process.env.HOME as string;

  it("removes the MCP entry, the devcoach hooks and the skill — user hooks and other keys survive", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = ""; // no `claude` CLI → the JSON path for both install and uninstall
    try {
      const settings = cleanClaudeSettings();
      await run(["install", "--claude-code", "--force"]);
      const before = JSON.parse(readFileSync(settings, "utf8"));
      before.hooks.Stop.push({ hooks: [{ type: "command", command: "my-other-tool --check" }] });
      before.theme = "dark";
      writeFileSync(settings, JSON.stringify(before));
      const codeConfig = join(home(), ".claude.json");
      const cfg = JSON.parse(readFileSync(codeConfig, "utf8"));
      cfg.mcpServers.other = { command: "x" };
      writeFileSync(codeConfig, JSON.stringify(cfg));
      const skillDir = join(home(), ".claude", "skills", "devcoach");
      expect(existsSync(join(skillDir, "SKILL.md"))).toBe(true);

      const r = await run(["uninstall", "--claude-code"]);
      expect(r.out).toContain("Removed from");
      expect(r.out).toContain("Hooks removed from");
      expect(r.out).toContain("Removed " + skillDir);
      expect(r.out).toContain("still in"); // data kept by default
      const after = JSON.parse(readFileSync(settings, "utf8"));
      expect(after.theme).toBe("dark");
      expect(after.hooks.UserPromptSubmit).toBeUndefined();
      expect(after.hooks.Stop).toHaveLength(1);
      expect(after.hooks.Stop[0].hooks[0].command).toBe("my-other-tool --check");
      const cfgAfter = JSON.parse(readFileSync(codeConfig, "utf8"));
      expect(cfgAfter.mcpServers.devcoach).toBeUndefined();
      expect(cfgAfter.mcpServers.other).toEqual({ command: "x" });
      expect(existsSync(skillDir)).toBe(false);

      // idempotent: a second run reports nothing to remove and exits cleanly
      const again = await run(["uninstall", "--claude-code"]);
      expect(again.code).toBeNull();
      expect(again.out).toContain("Not registered");
      expect(again.out).toContain("No devcoach hooks");
      expect(again.out).toContain("Not installed");
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("unregisters through a present `claude` CLI and clears the Desktop config", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = fakeBin("claude", "#!/bin/sh\nexit 0\n");
    try {
      await run(["install", "--claude-desktop", "--force"]);
      const r = await run(["uninstall"]);
      expect(r.out).toContain("Removed via `claude mcp remove`");
      expect(r.out).toContain("Claude Desktop");
      expect(r.out).toContain("Removed from");
      expect(r.out).toContain("Restart Claude Desktop");
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("--all covers Gemini/Codex (manual TOML note without codex) and keeps the shared skill while in use", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = "";
    try {
      await run(["install", "--gemini", "--force"]);
      await run(["install", "--codex", "--force"]);
      const shared = join(home(), ".agents", "skills", "devcoach");
      expect(existsSync(join(shared, "SKILL.md"))).toBe(true);
      // removing only Gemini keeps the skill Codex still reads
      const g = await run(["uninstall", "--gemini"]);
      expect(g.out).toContain("Gemini CLI");
      expect(g.out).toContain("Kept");
      expect(existsSync(join(shared, "SKILL.md"))).toBe(true);
      const all = await run(["uninstall", "--all"]);
      expect(all.out).toContain("Manual step"); // no codex CLI → TOML left to the user
      expect(all.out).toContain("Removed " + shared);
      expect(existsSync(shared)).toBe(false);
      const codexHooks = JSON.parse(readFileSync(join(home(), ".codex", "hooks.json"), "utf8"));
      expect(codexHooks.hooks).toBeUndefined();
    } finally {
      process.env.PATH = savedPath;
    }
  });

  it("--data needs --yes outside a terminal, then deletes the data dir; malformed settings are left alone", async () => {
    const savedPath = process.env.PATH;
    process.env.PATH = "";
    try {
      const settings = join(home(), ".claude", "settings.json");
      mkdirSync(dirname(settings), { recursive: true });
      writeFileSync(settings, "{ bad json,, }");
      const dataDir = db.DEVCOACH_DIR;
      db.withConnection((c) => c.exec("SELECT 1")); // make sure the data dir exists
      expect(existsSync(dataDir)).toBe(true);
      const noYes = await run(["uninstall", "--claude-code", "--data"]);
      expect(noYes.out).toContain("is not valid JSON");
      expect(noYes.out).toContain("pass --yes");
      expect(existsSync(dataDir)).toBe(true);
      expect(readFileSync(settings, "utf8")).toBe("{ bad json,, }");
      const yes = await run(["uninstall", "--claude-code", "--data", "--yes"]);
      expect(yes.out).toContain("Deleted " + dataDir);
      expect(existsSync(dataDir)).toBe(false);
      // the store recreates itself on the next use
      expect(db.withConnection((c) => db.getSettings(c).max_per_day)).toBe(2);
    } finally {
      process.env.PATH = savedPath;
    }
  });
});

describe("cli ui — link, --open, --stop, graceful shutdown", () => {
  it("browserCommand picks the platform opener", async () => {
    const { browserCommand } = await import("../src/cli/open");
    expect(browserCommand("darwin", "http://x")).toEqual(["open", ["http://x"]]);
    expect(browserCommand("win32", "http://x")).toEqual(["cmd", ["/c", "start", "", "http://x"]]);
    expect(browserCommand("linux", "http://x")).toEqual(["xdg-open", ["http://x"]]);
  });

  it("startUi prints the URL, hands it to onReady, and POST /shutdown closes it gracefully", async () => {
    const { startUi } = await import("../src/web/app");
    const lines: string[] = [];
    const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => lines.push(a.join(" ")));
    let readyUrl = "";
    const server = startUi(0, { handleSignals: false, onReady: (u) => (readyUrl = u) });
    const port = await new Promise<number>((resolve) =>
      server.once("listening", () => resolve((server.address() as { port: number }).port)),
    );
    const closed = new Promise<void>((resolve) => server.once("close", () => resolve()));
    try {
      await vi.waitFor(() => expect(readyUrl).toBe(`http://localhost:${port}`));
      expect(lines.join("\n")).toContain(`running at http://localhost:${port}`);
      // GET is not a stop; a cross-site POST is refused; a same-origin POST stops it
      expect((await fetch(`http://127.0.0.1:${port}/shutdown`)).status).toBe(405);
      const cross = await fetch(`http://127.0.0.1:${port}/shutdown`, {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      });
      expect(cross.status).toBe(403);
      expect(server.listening).toBe(true);
      const ok = await fetch(`http://127.0.0.1:${port}/shutdown`, { method: "POST" });
      expect(await ok.json()).toEqual({ ok: true });
      await closed;
      expect(server.listening).toBe(false);
    } finally {
      logSpy.mockRestore();
      if (server.listening) server.close();
    }
  });

  it("ui --stop reports stopped / not running", async () => {
    const { startUi } = await import("../src/web/app");
    const server = startUi(0, { handleSignals: false });
    const port = await new Promise<number>((resolve) =>
      server.once("listening", () => resolve((server.address() as { port: number }).port)),
    );
    const closed = new Promise<void>((resolve) => server.once("close", () => resolve()));
    expect((await run(["ui", "--stop", "--port", String(port)])).out).toContain("stopped");
    await closed;
    expect((await run(["ui", "--stop", "--port", String(port)])).out).toContain(
      "No devcoach UI is running",
    );
  });

  it("startUi on a port held by a running dashboard explains it instead of crashing", async () => {
    const { startUi } = await import("../src/web/app");
    const first = startUi(0, { handleSignals: false });
    const port = await new Promise<number>((resolve) =>
      first.once("listening", () => resolve((first.address() as { port: number }).port)),
    );
    const onListenError = vi.fn();
    const second = startUi(port, { handleSignals: false, onListenError });
    try {
      await vi.waitFor(() => expect(onListenError).toHaveBeenCalledTimes(1));
      const failure = onListenError.mock.calls[0][0];
      expect(failure.exitCode).toBe(0);
      expect(failure.existingUrl).toBe(`http://localhost:${port}`);
      expect(failure.message).toContain("already running at");
      expect(failure.message).toContain(`(v${VERSION})`);
      expect(failure.message).toContain("devcoach ui --stop");
      expect(first.listening).toBe(true);
    } finally {
      if (second.listening) second.close();
      first.close();
    }
  });

  it("startUi on a port held by another process reports it as busy (exit 1)", async () => {
    const { createServer } = await import("node:net");
    const { startUi } = await import("../src/web/app");
    const other = createServer();
    const port = await new Promise<number>((resolve) =>
      other.listen(0, "127.0.0.1", () => resolve((other.address() as { port: number }).port)),
    );
    const onListenError = vi.fn();
    const ui = startUi(port, { handleSignals: false, onListenError });
    try {
      // The raw socket accepts and never answers, so the /ping probe runs into its 1.5 s timeout.
      await vi.waitFor(() => expect(onListenError).toHaveBeenCalledTimes(1), { timeout: 4000 });
      const failure = onListenError.mock.calls[0][0];
      expect(failure.exitCode).toBe(1);
      expect(failure.existingUrl).toBeUndefined();
      expect(failure.message).toContain(`Port ${port} is already in use by another process`);
      expect(failure.message).toContain("--port <n>");
    } finally {
      if (ui.listening) ui.close();
      other.close();
    }
  });

  it("explainListenError words EACCES and unknown errors; pingUi is null off a dashboard", async () => {
    const { explainListenError, pingUi } = await import("../src/web/app");
    const eacces = Object.assign(new Error("listen EACCES"), { code: "EACCES" });
    expect((await explainListenError(80, eacces)).message).toContain("permission denied");
    const odd = Object.assign(new Error("boom"), { code: "EWEIRD" });
    const failure = await explainListenError(7860, odd);
    expect(failure.exitCode).toBe(1);
    expect(failure.message).toContain("Could not start the devcoach UI on port 7860: boom");
    // A non-devcoach answer on the port (ping rejects the body) counts as "another process".
    const busy = Object.assign(new Error("in use"), { code: "EADDRINUSE" });
    const foreign = await explainListenError(7860, busy, async () => null);
    expect(foreign.existingUrl).toBeUndefined();
    const { createServer } = await import("node:net");
    const other = createServer();
    const port = await new Promise<number>((resolve) =>
      other.listen(0, "127.0.0.1", () => resolve((other.address() as { port: number }).port)),
    );
    other.close();
    expect(await pingUi(port)).toBeNull();
    const notOk = async () => new Response(JSON.stringify({ ok: false }), { status: 200 });
    expect(await pingUi(port, notOk as unknown as typeof fetch)).toBeNull();
    const err500 = async () => new Response("nope", { status: 500 });
    expect(await pingUi(port, err500 as unknown as typeof fetch)).toBeNull();
  });
});

describe("gracefulShutdown", () => {
  it("lets an in-flight response finish, refuses new connections, then closes", async () => {
    const { gracefulShutdown } = await import("../src/web/app");
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      setTimeout(() => res.end("done"), 400); // a slow handler, still running when we shut down
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const inflight = fetch(`http://127.0.0.1:${port}/slow`);
    await new Promise((r) => setTimeout(r, 100)); // the request is accepted and being handled
    const t0 = Date.now();
    const done = gracefulShutdown(server, 2000);
    const res = await inflight;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("done"); // finished, not cut
    await done;
    expect(Date.now() - t0).toBeLessThan(1500); // closed as soon as the drain completed, not at the deadline
    expect(server.listening).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/slow`)).rejects.toThrow(); // nothing listens any more
  });

  it("cuts connections that outlive the grace period", async () => {
    const { gracefulShutdown } = await import("../src/web/app");
    const { createServer } = await import("node:http");
    const server = createServer((_req, res) => {
      res.write("partial"); // never ends — a hung response
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const hung = fetch(`http://127.0.0.1:${port}/hang`).then((r) => r.text());
    await new Promise((r) => setTimeout(r, 100));
    const t0 = Date.now();
    await gracefulShutdown(server, 300);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(250);
    expect(server.listening).toBe(false);
    await expect(hung).rejects.toThrow(); // the hung response was terminated at the deadline
  });
});

// ── 2.8: `lesson` shows the lesson, `lessons` by day, `feedback` in two lines ──

describe("cli lesson: the lesson itself, then id · dashboard · course · knew it?", () => {
  const ID = "busy-timeout-no-lock-queue";
  const TITLE = "busy_timeout: SQLite has no lock queue";
  const BODY = [
    "The `SQLITE_BUSY` you just fixed: two writers met at the same instant.",
    "",
    "```ts",
    'conn.exec("BEGIN IMMEDIATE"); // locks now',
    "```",
    "",
    "💡 *Senior tip:* keep writes short.",
  ].join("\n");
  const seed = (o: Record<string, unknown> = {}) =>
    db.withConnection((c) =>
      db.insertLesson(
        c,
        parseLesson({
          id: ID,
          timestamp: "2026-10-25T10:00:00Z",
          topic_id: "sqlite",
          categories: ["SQLite"],
          title: TITLE,
          level: "mid",
          summary: "SQLite has no queue; busy_timeout retries for you.",
          body: BODY,
          ...o,
        }),
      ),
    );
  const clean = () =>
    db.withConnection((c) =>
      c.exec("DELETE FROM course_steps; DELETE FROM courses; DELETE FROM lessons;"),
    );
  const lines = (s: string): string[] => s.split("\n");
  beforeEach(clean);
  afterEach(() => vi.unstubAllGlobals());

  it("the default view: the body, then the id, the dashboard and a knew it? row", async () => {
    seed();
    const { stdout, code } = await run(["lesson", ID, "--width", "80"]);
    expect(code).toBeNull();
    const out = lines(stdout);
    expect(out[0]).toBe(`── 🎓 devcoach ${"─".repeat(65)}`);
    expect(out[1]).toBe(TITLE);
    expect(out[2]).toBe("sqlite · mid · 2026-10-25"); // no category, the level a plain word
    expect(stdout).toContain(
      "The SQLITE_BUSY you just fixed: two writers met at the same instant.",
    );
    expect(stdout).toContain(
      `── ts ${"─".repeat(74)}\n│ conn.exec("BEGIN IMMEDIATE"); // locks now`,
    );
    expect(stdout).toContain("💡 Senior tip: keep writes short.");
    expect(out.slice(-4)).toEqual([
      "─".repeat(80),
      `id         ${ID}`,
      "dashboard  devcoach ui -o",
      `knew it?   devcoach feedback ${ID} yes|new|lost`,
    ]);
    expect(stdout).not.toContain("course ");
    for (const line of out) expect(displayWidth(line)).toBeLessThanOrEqual(80);
  });

  it("an answered lesson: the answer joins the meta line, and the knew it? row is gone", async () => {
    seed({ feedback: "understood", starred: true });
    const { stdout } = await run(["lesson", ID]);
    expect(lines(stdout)[2]).toBe("sqlite · mid · 2026-10-25 · ✨ new to me · ★");
    expect(stdout).not.toContain("knew it?");
    expect(lines(stdout).at(-1)).toBe("dashboard  devcoach ui -o");
  });

  it("a shared lesson says who shared it, or that it came anonymously", async () => {
    seed({ imported: true, shared_by: "Ada" });
    expect(lines((await run(["lesson", ID])).stdout)[2]).toBe(
      "sqlite · mid · 2026-10-25 · shared by Ada",
    );
    db.withConnection((c) => c.prepare("UPDATE lessons SET shared_by = NULL").run());
    expect((await run(["lesson", ID])).stdout).toContain("· shared anonymously");
  });

  it("a lesson with no body shows its summary", async () => {
    seed({ body: null });
    expect((await run(["lesson", ID])).stdout).toContain(
      "\nSQLite has no queue; busy_timeout retries for you.\n",
    );
  });

  it("the dashboard row: a link only when /ping answers in time, else `devcoach ui -o`", async () => {
    seed();
    const ping = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ ok: true, version: VERSION }),
    );
    vi.stubGlobal("fetch", ping);
    expect((await run(["lesson", ID])).stdout).toContain(
      `dashboard  http://127.0.0.1:9/lessons/${ID}`,
    );
    expect(ping.mock.calls[0]?.[0]).toBe("http://127.0.0.1:9/ping");
    expect(ping.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    for (const down of [
      async () => {
        throw new TypeError("fetch failed"); // nothing listens: the stubbed /ping is down
      },
      async () => new Response("no", { status: 500 }),
      async () => Response.json({ ok: false }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(down));
      expect((await run(["lesson", ID])).stdout).toContain("dashboard  devcoach ui -o");
    }
  });

  it("the dashboard wait is short, and the port comes from DEVCOACH_UI_PORT", async () => {
    expect(DASHBOARD_PING_MS).toBe(150);
    expect(uiPort({ DEVCOACH_UI_PORT: "7877" })).toBe(7877);
    for (const bad of [undefined, "", "abc", "0", "70000", "78.5"]) {
      expect(uiPort({ DEVCOACH_UI_PORT: bad })).toBe(7860);
    }
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    vi.stubGlobal("fetch", slow);
    const start = performance.now();
    expect(await dashboardAnswers(9, 20)).toBe(false);
    expect(performance.now() - start).toBeLessThan(1000);
  });

  it("a course row when a course grew from the lesson", async () => {
    seed();
    const course = db.withConnection((c) =>
      courses.createCourse(c, {
        title: "SQLite locking, step by step",
        topic_id: "sqlite",
        lesson_id: ID,
      }),
    );
    writeFileSync(
      courses.documentPath(course.id),
      '<section id="step-1">a</section><section id="step-2">b</section>',
    );
    db.withConnection((c) => {
      courses.addStep(c, course.id, { title: "Locks", kind: "concept", anchor: "step-1" });
      courses.addStep(c, course.id, { title: "Busy", kind: "concept", anchor: "step-2" });
      courses.setStepStatus(c, course.id, 1, "done");
    });
    expect((await run(["lesson", ID])).stdout).toContain(
      "\ncourse     SQLite locking, step by step · 1/2\n",
    );
  });

  it("an id from someone else is quoted in the command to copy, and encoded in the link", async () => {
    seed({ id: "it's a $(trap)", imported: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
    const { stdout } = await run(["lesson", "it's a $(trap)"]);
    expect(stdout).toContain(`knew it?   devcoach feedback 'it'\\''s a $(trap)' yes|new|lost`);
    expect(stdout).toContain("http://127.0.0.1:9/lessons/it's%20a%20%24(trap)");
  });

  it("a long id is never cut: not in the footer, the link or the command to copy", async () => {
    const long = "a-lesson-id-that-is-much-longer-than-forty-columns";
    seed({ id: long });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true })),
    );
    const out = lines((await run(["lesson", long, "--width", "40"])).stdout);
    expect(out).toContain(`id         ${long}`);
    expect(out).toContain(`dashboard  http://127.0.0.1:9/lessons/${long}`);
    expect(out.slice(-3)).toEqual([
      "knew it?   devcoach feedback",
      `           ${long}`,
      "           yes|new|lost",
    ]);
    const listed = (await run(["lessons"], { tty: { columns: 40, rows: 50 } })).stdout;
    expect(listed.split("\n")).toContain(`    ${long}`);
  });

  it("--short is the pre-2.8 view, byte for byte", async () => {
    seed();
    vi.stubEnv("COLUMNS", "80");
    try {
      const { stdout } = await run(["lesson", ID, "--short"]);
      expect(lines(stdout)).toEqual([
        `── ${TITLE} ${"─".repeat(80 - TITLE.length - 4)}`,
        `ID:         ${ID}`,
        "Date:        2026-10-25 10:00:00",
        "Topic:       sqlite",
        "Categories:  SQLite",
        "Level:       mid",
        "Star:        ☆ not starred   Feedback: ○ no answer yet",
        "─".repeat(80),
        "SQLite has no queue; busy_timeout retries for you.",
      ]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("--md is the chat card, --json the row; the three views exclude each other (exit 2)", async () => {
    seed();
    const stored = db.withConnection((c) => db.getLessonById(c, ID)) as Lesson;
    expect((await run(["lesson", ID, "--md"])).stdout).toBe(formatLessonForDisplay(stored));
    expect(parseLesson(JSON.parse((await run(["lesson", ID, "--json"])).stdout))).toEqual(stored);
    for (const pair of [
      ["--md", "--json"],
      ["--short", "--json"],
      ["--short", "--md"],
    ]) {
      const r = await run(["lesson", ID, ...pair]);
      expect(r.code, pair.join(" ")).toBe(2);
      expect(r.stdout).toBe("");
    }
  });

  it("--json writes invisible and C1 characters as escapes, and the data survives", async () => {
    seed({ title: "flip \u{202e}this\u{202c} \x85 back" });
    const { stdout } = await run(["lesson", ID, "--json"]);
    expect(stdout).toContain("flip \\u202ethis\\u202c \\u0085 back");
    expect(stdout).not.toMatch(/[\x7f-\x9f\u{202a}-\u{202e}]/u);
    expect(JSON.parse(stdout).title).toBe("flip \u{202e}this\u{202c} \x85 back");
  });

  it("--last, a unique prefix, an ambiguous one, not found — errors on stderr, stdout empty", async () => {
    const mk = (id: string, timestamp: string, o: Record<string, unknown> = {}) =>
      seed({ id, timestamp, title: `T ${id}`, ...o });
    mk("alpha-one", "2026-10-01T10:00:00Z");
    mk("alpha-two", "2026-10-02T10:00:00Z");
    mk("beta-shared", "2026-10-03T10:00:00Z", { imported: true });
    expect(lines((await run(["lesson", "--last"])).stdout)[1]).toBe("T alpha-two"); // own only
    expect(lines((await run(["lesson", "beta"])).stdout)[1]).toBe("T beta-shared");
    const ambiguous = await run(["lesson", "alpha"]);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stdout).toBe("");
    expect(ambiguous.stderr).toContain("'alpha' starts more than one lesson id:");
    expect(ambiguous.stderr).toContain("alpha-one");
    expect(ambiguous.stderr).toContain("alpha-two");
    const missing = await run(["lesson", "zzz"]);
    expect(missing).toMatchObject({ code: 1, stdout: "", stderr: "Lesson 'zzz' not found." });
    expect((await run(["lesson", "%"])).code).toBe(1); // a prefix, never a LIKE pattern
    expect((await run(["lesson"])).code).toBe(2);
    expect((await run(["lesson", "alpha-one", "--last"])).code).toBe(2);
    db.withConnection((c) => c.exec("DELETE FROM lessons WHERE imported = 0"));
    expect((await run(["lesson", "--last"])).stderr).toBe("No lessons of your own yet.");
  });

  it("twelve matches: ten are listed, then …", async () => {
    for (let i = 10; i < 22; i++) seed({ id: `many-${i}`, timestamp: `2026-10-${i}T10:00:00Z` });
    const r = await run(["lesson", "many"]);
    expect(r.stderr.split("\n").filter((l) => l.startsWith("  many-"))).toHaveLength(10);
    expect(r.stderr.split("\n").at(-1)).toBe("  …");
  });

  it("--width lays out for that many columns; a width outside 20–1000 is a usage error", async () => {
    seed({ body: `${"word ".repeat(40)}\n\n\`\`\`\n${"code ".repeat(20)}\n\`\`\`` });
    for (const width of [20, 40, 120]) {
      const out = lines((await run(["lesson", ID, "--width", String(width)])).stdout);
      const body = out.slice(0, out.lastIndexOf("─".repeat(width))); // the footer never cuts an id
      for (const line of body) expect(displayWidth(line), line).toBeLessThanOrEqual(width);
      expect(displayWidth(out[0] as string)).toBe(width);
    }
    expect((await run(["lesson", ID, "--width", "19"])).code).toBe(2);
    expect((await run(["lesson", ID, "--width", "wide"])).code).toBe(2);
  });

  describe("the pager", () => {
    it("DEVCOACH_PAGER, then PAGER, then less -FRX; empty or cat = none; Windows only when set", () => {
      expect(pagerCommand({ DEVCOACH_PAGER: "most", PAGER: "more" }, "darwin")).toBe("most");
      expect(pagerCommand({ PAGER: "more" }, "linux")).toBe("more");
      expect(pagerCommand({}, "linux")).toBe("less -FRX");
      expect(pagerCommand({}, "win32")).toBeNull();
      expect(pagerCommand({ PAGER: "more" }, "win32")).toBe("more");
      expect(pagerCommand({ PAGER: "cat" }, "darwin")).toBeNull();
      expect(pagerCommand({ DEVCOACH_PAGER: " ", PAGER: "less" }, "darwin")).toBeNull();
    });

    it("a view taller than the terminal goes through the pager; --no-pager and a pipe never page", async () => {
      seed();
      const dir = mkdtempSync(join(tmpdir(), "dc-pager-"));
      const paged = join(dir, "paged.txt");
      vi.stubEnv("DEVCOACH_PAGER", `cat > '${paged}'`);
      try {
        const tall = await run(["lesson", ID], { tty: { columns: 80, rows: 5 } });
        expect(tall.stdout).toBe("");
        expect(readFileSync(paged, "utf8")).toContain("💡 Senior tip: keep writes short.");
        rmSync(paged);
        const fits = await run(["lesson", ID], { tty: { columns: 80, rows: 100 } });
        expect(fits.stdout).toContain("knew it?");
        const noPager = await run(["lesson", ID, "--no-pager"], { tty: { columns: 80, rows: 5 } });
        expect(noPager.stdout).toContain("knew it?");
        expect((await run(["lesson", ID])).stdout).toContain("knew it?"); // a pipe
        expect(existsSync(paged)).toBe(false);
        vi.stubEnv("DEVCOACH_PAGER", "devcoach-no-such-pager-xyz 2>/dev/null");
        const missing = await run(["lesson", ID], { tty: { columns: 80, rows: 5 } });
        expect(missing.stdout).toContain("knew it?"); // no pager found → printed as is
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});

describe("cli lessons: by day on a terminal, rows on a pipe", () => {
  // Lesson i was i days ago, at a time of day that already passed today (midnight-safe).
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const dayAgo = (i: number): Date => {
    const d = new Date(Math.max(Date.now() - 1000, startOfToday));
    d.setDate(d.getDate() - i);
    return d;
  };
  const date = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const seed = (n: number) =>
    db.withConnection((c) => {
      c.exec("DELETE FROM lessons");
      for (let i = 0; i < n; i++) {
        db.insertLesson(
          c,
          parseLesson({
            id: `day-lesson-${String(i).padStart(2, "0")}`,
            timestamp: dayAgo(i).toISOString(),
            topic_id: i % 2 ? "sqlite" : "docker",
            categories: [],
            title: `Lesson number ${i}: a cache that misses`,
            level: "mid",
            summary: "s",
            feedback: (["know", "understood", "dont_know", null] as const)[i % 4],
            starred: i === 1,
            imported: i === 2,
            shared_by: i === 2 ? "Ada" : null,
          }),
        );
      }
    });

  it("a pipe gets every row, tab-separated: date, id, answer word, title — nothing else", async () => {
    seed(25);
    const { stdout, stderr } = await run(["lessons"]);
    const rows = stdout.split("\n");
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row.split("\t")).toHaveLength(4);
    expect(rows[0]?.split("\t").slice(1)).toEqual([
      "day-lesson-00",
      "yes",
      "Lesson number 0: a cache that misses",
    ]);
    expect(rows.slice(0, 4).map((r) => r.split("\t")[2])).toEqual(["yes", "new", "lost", "-"]);
    expect(rows[0]?.split("\t")[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stdout).not.toContain("lessons ·");
    expect(stderr).toBe("");
    expect((await run(["lessons", "-n", "3"])).stdout.split("\n")).toHaveLength(3);
  });

  it("a terminal gets day headers, two lines per lesson, ✅ knew it, and a trailer", async () => {
    seed(25);
    const { stdout } = await run(["lessons"], { tty: { columns: 100, rows: 50 } });
    const out = stdout.split("\n");
    expect(out).toContain(`Today ${date(dayAgo(0))}`);
    expect(out).toContain(`Yesterday ${date(dayAgo(1))}`);
    const older = dayAgo(3);
    expect(out).toContain(
      `${older.toLocaleDateString("en-US", { weekday: "short" })} ${date(older)}`,
    );
    expect(out).toContain("  Lesson number 0: a cache that misses");
    expect(out).toContain("    day-lesson-00 · docker · mid · ✅ knew it");
    expect(out).toContain("★ Lesson number 1: a cache that misses");
    expect(out).toContain("    day-lesson-01 · sqlite · mid · ✨ new to me");
    expect(out).toContain("    day-lesson-02 · docker · mid · shared by Ada · ❌ lost me");
    expect(out).toContain("    day-lesson-03 · sqlite · mid · ○ no answer yet");
    expect(out.filter((l) => l.startsWith("    day-lesson-"))).toHaveLength(20);
    expect(out.at(-1)).toBe("20 of 25 lessons · devcoach lesson <id> opens one · -n 25 for all");
    expect(out.at(-2)).toBe("");
    const all = (await run(["lessons", "-n", "25"], { tty: { columns: 100, rows: 50 } })).stdout;
    expect(all.split("\n").at(-1)).toBe("25 lessons · devcoach lesson <id> opens one");
  });

  it("any order but the date prints flat, the date moving into the second line", async () => {
    seed(3);
    const { stdout } = await run(["lessons", "--sort", "title", "--order", "asc"], {
      tty: { columns: 100, rows: 50 },
    });
    expect(stdout).not.toMatch(/^(Today|Yesterday) /m);
    expect(stdout).toMatch(/^ {4}day-lesson-00 · docker · mid · \d{4}-\d{2}-\d{2} · ✅ knew it$/m);
  });

  it("--search finds every word; the trailer names it; one lesson is a lesson", async () => {
    seed(6);
    db.withConnection((c) =>
      c.prepare("UPDATE lessons SET title = 'C++ templates' WHERE id = 'day-lesson-04'").run(),
    );
    const one = await run(["lessons", "--search", "c++ templates"], {
      tty: { columns: 80, rows: 50 },
    });
    expect(one.stdout).toContain("  C++ templates");
    expect(one.stdout.split("\n").at(-1)).toBe(
      '1 lesson matching "c++ templates" · devcoach lesson <id> opens one',
    );
    const piped = (await run(["lessons", "--search", "number 5"])).stdout.split("\n");
    expect(piped).toEqual([expect.stringContaining("\tday-lesson-05\t")]);
  });

  it("every filter flag narrows the rows", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM lessons");
      const mk = (id: string, o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            id,
            topic_id: "sqlite",
            categories: ["databases"],
            title: id,
            level: "mid",
            summary: "s",
            ...o,
          }),
        );
      mk("recent", { timestamp: new Date(Date.now() - 60_000).toISOString() });
      mk("tagged", {
        timestamp: "2026-03-10T10:00:00Z",
        categories: ["networking"],
        level: "senior",
        project: "dev-coach",
        repository: "owner/dev-coach",
        branch: "feat/cli-view",
        commit_hash: "abc1234def",
      });
      mk("old", { timestamp: "2025-01-05T10:00:00Z", level: "junior" });
    });
    const ids = async (...flags: string[]) =>
      (await run(["lessons", ...flags])).stdout
        .split("\n")
        .filter(Boolean)
        .map((row) => row.split("\t")[1]);
    expect(await ids("--period", "today")).toEqual(["recent"]);
    expect(await ids("--category", "networking")).toEqual(["tagged"]);
    expect(await ids("--project", "coach")).toEqual(["tagged"]);
    expect(await ids("--repository", "owner/")).toEqual(["tagged"]);
    expect(await ids("--branch", "cli-view")).toEqual(["tagged"]);
    expect(await ids("--commit", "abc12")).toEqual(["tagged"]);
    expect(await ids("--level", "junior")).toEqual(["old"]);
    expect(await ids("--date-from", "2026-01-01", "--date-to", "2026-06-30")).toEqual(["tagged"]);
    expect(await ids("--sort", "title", "--order", "asc")).toEqual(["old", "recent", "tagged"]);
  });

  it("--json prints every matching lesson; nothing matching goes to stderr; -n 0 is a usage error", async () => {
    seed(4);
    const parsed = JSON.parse((await run(["lessons", "--json", "--starred"])).stdout);
    expect(parsed.map((l: Lesson) => parseLesson(l).id)).toEqual(["day-lesson-01"]);
    const none = await run(["lessons", "--search", "nothing-like-this"], {
      tty: { columns: 80, rows: 50 },
    });
    expect(none).toMatchObject({ stdout: "", stderr: "No lessons found." });
    expect((await run(["lessons", "-n", "0"])).code).toBe(2);
  });
});

describe("cli feedback: what was recorded, then what it changed", () => {
  const ID = "fb-lesson";
  const TITLE = "busy_timeout: SQLite has no lock queue";
  beforeEach(() =>
    db.withConnection((c) => {
      c.exec("DELETE FROM course_steps; DELETE FROM courses; DELETE FROM lessons;");
      db.insertLesson(
        c,
        parseLesson({
          id: ID,
          timestamp: "2026-10-25T10:00:00Z",
          topic_id: "sqlite",
          categories: [],
          title: TITLE,
          level: "mid",
          summary: "s",
        }),
      );
      db.upsertKnowledge(c, "sqlite", 5);
    }),
  );
  const answer = async (word: string) => (await run(["feedback", ID, word])).stdout.split("\n");

  it("yes: confidence 5 → 6, read from the result; again: already recorded", async () => {
    expect(await answer("yes")).toEqual([`✅ knew it · ${TITLE}`, "   sqlite · confidence 5 → 6"]);
    expect(await answer("yes")).toEqual([
      `✅ knew it · ${TITLE}`,
      "   sqlite · confidence unchanged · already recorded",
    ]);
  });

  it("new, lost and clear: the point comes back, the level was right, a course to ask for", async () => {
    await answer("yes");
    expect(await answer("new")).toEqual([
      `✨ new to me · ${TITLE}`,
      "   sqlite · confidence 6 → 5 · the level was right",
    ]);
    expect(await answer("lost")).toEqual([
      `❌ lost me · ${TITLE}`,
      "   sqlite · confidence unchanged · ask your agent for a course on it",
    ]);
    const course = db.withConnection((c) =>
      courses.createCourse(c, { title: "Locks", topic_id: "sqlite", lesson_id: ID }),
    );
    expect((await answer("lost")).slice(1)).toEqual([
      "   sqlite · confidence unchanged · already recorded",
      `   continue the course · 0/0 · devcoach course ${course.id}`,
    ]);
    expect(await answer("clear")).toEqual([
      `○ answer cleared · ${TITLE}`,
      "   sqlite · confidence unchanged",
    ]);
  });

  it("a yes at 10 changes nothing and says so; a yes on an untracked topic creates it", async () => {
    db.withConnection((c) => db.upsertKnowledge(c, "sqlite", 10));
    expect((await answer("yes"))[1]).toBe("   sqlite · confidence unchanged");
    db.withConnection((c) => {
      db.deleteKnowledge(c, "sqlite");
      db.setFeedback(c, ID, null);
    });
    expect((await answer("yes"))[1]).toBe(
      "   sqlite wasn't on your knowledge map: it's tracked now, at 6/10.",
    );
  });

  it("a long title wraps under the answer; an unknown lesson is an error on stderr", async () => {
    db.withConnection((c) =>
      c.prepare("UPDATE lessons SET title = ? WHERE id = ?").run("word ".repeat(30).trim(), ID),
    );
    const out = await answer("new");
    expect(out.length).toBeGreaterThan(2);
    expect(out[1]?.startsWith("   word")).toBe(true);
    const missing = await run(["feedback", "nope", "yes"]);
    expect(missing).toMatchObject({ code: 1, stdout: "", stderr: "Lesson 'nope' not found." });
  });
});

describe("cli: one set of answer glyphs", () => {
  it("no CLI source or output uses the narrow marks ✓ ✦ ✗", async () => {
    for (const file of ["src/cli/commands.ts", "src/cli/markdown.ts"]) {
      expect(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), file).not.toMatch(
        /[✓✦✗]/u,
      );
    }
    db.withConnection((c) => {
      c.exec("DELETE FROM course_steps; DELETE FROM courses; DELETE FROM lessons;");
      for (const [i, feedback] of (["know", "understood", "dont_know", null] as const).entries()) {
        db.insertLesson(
          c,
          parseLesson({
            id: `glyph-${i}`,
            timestamp: "2026-10-25T10:00:00Z",
            topic_id: "sqlite",
            categories: [],
            title: `Glyph ${i}`,
            level: "mid",
            summary: "s",
            body: "Text.\n\n💡 *Senior tip:* t.",
            feedback,
          }),
        );
      }
      courses.createCourse(c, {
        title: "Glyph course",
        topic_id: "sqlite",
        lesson_id: "glyph-2",
        prerequisites: [
          { concept: "known", known: true },
          { concept: "unknown", known: false },
        ],
      });
    });
    const file = join(mkdtempSync(join(tmpdir(), "dc-glyph-")), "b.zip");
    const shared = parseLesson({
      id: "glyph-shared",
      timestamp: "2026-10-25T10:00:00Z",
      topic_id: "sqlite",
      categories: [],
      title: "Glyph shared",
      level: "mid",
      summary: "s",
    });
    const code = encodeShareCode(
      buildSharePayload(shared, { includeContext: false, sharedBy: "Ada" }),
    );
    const runs: [string[], RunOptions?][] = [
      [["lessons"], { tty: { columns: 100, rows: 50 } }],
      [["lessons"]],
      ...[0, 1, 2, 3].flatMap((i): [string[]][] => [
        [["lesson", `glyph-${i}`]],
        [["lesson", `glyph-${i}`, "--short"]],
      ]),
      ...["yes", "new", "lost", "clear", "bogus"].map((w): [string[]] => [
        ["feedback", "glyph-3", w],
      ]),
      [["courses"]],
      [["course", "glyph-course"]],
      [["stats"]],
      [["backup", file]],
      [["restore", file]],
      [["import", code]],
      [["import", code]],
    ];
    for (const [args, opts] of runs) {
      expect((await run(args, opts)).out, args.join(" ")).not.toMatch(/[✓✦✗]/u);
    }
    expect((await run(["course", "glyph-course"])).out).toContain("✅ known");
    expect((await run(["course", "glyph-course"])).out).toContain("❌ unknown");
  });
});

describe("cli stats: the lesson measure", () => {
  it("avg prose words and the share of your own lessons with an answer", async () => {
    db.withConnection((c) => {
      c.exec("DELETE FROM course_steps; DELETE FROM courses; DELETE FROM lessons;");
      const mk = (id: string, o: Record<string, unknown>) =>
        db.insertLesson(
          c,
          parseLesson({
            id,
            timestamp: "2026-10-25T10:00:00Z",
            topic_id: "sqlite",
            categories: [],
            title: id,
            level: "mid",
            summary: "one two three four",
            ...o,
          }),
        );
      mk("m1", {
        body: "six words of prose right here\n\n```\nnot counted\n```",
        feedback: "know",
      });
      mk("m2", { body: null }); // the summary counts: four words
      mk("m3", { body: "shared lessons are not yours", imported: true, feedback: "know" });
    });
    expect((await run(["stats"])).stdout).toContain(
      "lessons: avg 5 words · feedback answered 50 %",
    );
    expect(lessonMeasure([])).toBeNull();
  });
});
