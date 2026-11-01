// The agent API — `devcoach api <operation>` — at both layers: the operation table (runOperation:
// Zod validation, the {ok, result | error} envelope, never an exception) and the CLI door around it
// (one JSON line on stdout, the exit codes the skill relies on). Ported from the MCP server's suite
// when the server was dropped in 3.0: the operations kept their names and their results.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  type ApiResult,
  describeOperations,
  findOperation,
  OPERATIONS,
  runOperation,
} from "../src/api/operations";
import { onboardingNextStep } from "../src/api/state";
import { runCli } from "../src/cli/commands";
import * as db from "../src/core/db";
import { ShareInputError } from "../src/core/share";
import { fetchSharedInput } from "../src/core/share-fetch";

vi.mock("../src/core/share-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/share-fetch")>();
  return { ...actual, fetchSharedInput: vi.fn(actual.fetchSharedInput) };
});

/** Run one operation by name, the way `devcoach api` does. */
async function call(name: string, input: unknown = {}): Promise<ApiResult> {
  const op = findOperation(name);
  if (!op) throw new Error(`unknown operation ${name}`);
  return runOperation(op, input);
}
/** The `result` of a successful call (the test fails on `{ok: false}`). */
async function result(name: string, input: unknown = {}): Promise<any> {
  const r = await call(name, input);
  expect(r.ok, `${name}: ${r.ok ? "" : r.error}`).toBe(true);
  return r.ok ? r.result : undefined;
}
/** The `error` of a failed call (the test fails on `{ok: true}`). */
async function error(name: string, input: unknown = {}): Promise<string> {
  const r = await call(name, input);
  expect(r.ok, `${name} should fail`).toBe(false);
  return r.ok ? "" : r.error;
}

const lesson = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  topic_id: "python",
  categories: ["python"],
  title: "X",
  level: "mid",
  summary: "s",
  body: "Full lesson body.",
  ...over,
});

describe("agent api operations", () => {
  it("is a table of 25 named operations, each with a JSON Schema for its input", () => {
    expect(OPERATIONS).toHaveLength(25);
    const names = OPERATIONS.map((op) => op.name);
    expect(new Set(names).size).toBe(25);
    expect(names).toContain("preview_deep_scan");
    expect(names).not.toContain("update_notebook");
    // State reads are plain operations with the same names the skill always used.
    for (const name of ["get_briefing", "get_onboarding", "get_profile"]) {
      expect(findOperation(name)?.readOnly, name).toBe(true);
    }
    for (const name of ["delete_lesson", "remove_topic", "remove_group", "complete_onboarding"]) {
      expect(findOperation(name)?.destructive, name).toBe(true);
    }
    expect(findOperation("nope")).toBeNull();

    const catalogue = describeOperations();
    expect(catalogue.map((op) => op.name)).toEqual(names);
    for (const op of catalogue) {
      expect(op.title, op.name as string).toEqual(expect.any(String));
      expect((op.input as { type: string }).type, op.name as string).toBe("object");
    }
    const logLesson = catalogue.find((op) => op.name === "log_lesson") as {
      input: { properties: Record<string, unknown>; required: string[] };
    };
    expect(Object.keys(logLesson.input.properties)).toContain("body");
    expect(logLesson.input.required).toContain("body");
  });

  it("invalid input is a failed result naming the problem — never an exception", async () => {
    expect(await error("log_lesson", { id: 1 })).toMatch(/^log_lesson: invalid input/);
    expect(await error("update_knowledge", "not an object")).toContain("invalid input");
    expect(await error("get_lessons", { limit: "ten" })).toContain("limit");
    expect(await error("submit_feedback", { lesson_id: "x", feedback: "maybe" })).toContain(
      "feedback",
    );
  });

  it("get_briefing / get_onboarding / get_profile return the state payloads", async () => {
    await result("complete_onboarding", { topics: { python: 4 } });
    const briefing = await result("get_briefing");
    expect(briefing.onboarding.knowledge_ready).toBe(true);
    expect(briefing.notebook_path).toBe(db.LEARNING_STATE_PATH);
    expect(briefing.rate_limit).toHaveProperty("allowed");
    expect(Array.isArray(briefing.taught_topics)).toBe(true);
    const profile = await result("get_profile");
    expect(profile.knowledge.map((k: any) => k.topic)).toContain("python");
    expect(profile.compat).toBeNull();
    const onboarding = await result("get_onboarding");
    expect(onboarding.knowledge_ready).toBe(true);
    expect(onboarding).toHaveProperty("detected_stack");
    expect(onboarding.notebook_path).toBe(db.LEARNING_STATE_PATH);
  });

  // The Stop hook's cue has the model run get_onboarding and does not load the skill, so the
  // payload itself must say what to do — above all on a machine with no Claude Code history,
  // where a real session ended in a loop of questions instead of a profile.
  it("get_onboarding says what to do next: empty history never blocks Automatic", async () => {
    const empty = onboardingNextStep(false, false, false) as string;
    expect(empty).toContain("does NOT block Automatic");
    expect(empty).toContain("use default_topics exactly as returned");
    expect(empty).toContain("Do not stop, do not ask again");
    expect(empty).toContain("never pick for them");
    expect(empty).toContain("devcoach api complete_onboarding");
    const detected = onboardingNextStep(false, false, true) as string;
    expect(detected).toContain("from detected_stack enriched with default_topics");
    expect(detected).not.toContain("No Claude Code history");
    expect(onboardingNextStep(true, false, true)).toContain("only the notebook is missing");
    expect(onboardingNextStep(true, true, true)).toBeNull();

    // (the suite shares one sandbox: an earlier test may already have onboarded it)
    expect(await result("get_onboarding")).toHaveProperty("next_step");
    await result("complete_onboarding", { topics: { python: 4 } });
    expect((await result("get_onboarding")).next_step).toBeNull(); // profile + notebook placeholder: done
  });

  it("complete_onboarding guarantees a non-empty notebook placeholder; the skill writes the real one directly", async () => {
    rmSync(db.LEARNING_STATE_PATH, { force: true }); // isolate from other tests' notebook writes
    await result("complete_onboarding", { topics: { python: 4 } });
    // No notebook argument exists — the operation only guarantees the file exists and is
    // non-empty the instant the profile saves.
    expect(existsSync(db.LEARNING_STATE_PATH)).toBe(true);
    expect(readFileSync(db.LEARNING_STATE_PATH, "utf8")).toBe("# devcoach — Coaching Notebook\n");

    // The skill overwrites the placeholder directly, with its own file tools.
    writeFileSync(
      db.LEARNING_STATE_PATH,
      "# Notebook\n\n## Observations\nUser absorbed sockets.\n",
    );
    const briefing = await result("get_briefing");
    expect(briefing.notebook).toContain("User absorbed sockets.");
    expect(briefing.onboarding.notebook_ready).toBe(true);
    expect((await result("get_onboarding")).notebook_path).toBe(db.LEARNING_STATE_PATH);
  });

  it("preview_deep_scan returns a metadata-only windowed count with the requested/default months", async () => {
    const withDefault = await result("preview_deep_scan");
    expect(withDefault.window_months).toBe(3);
    expect(withDefault.candidate_count).toBe(0);
    expect(withDefault.over_soft_limit).toBe(false);
    expect(withDefault.candidates).toEqual([]);
    expect((await result("preview_deep_scan", { months: 6 })).window_months).toBe(6);
    expect(await error("preview_deep_scan", { months: 99 })).toContain("months");
  });

  it("runs the full operation surface", async () => {
    rmSync(db.LEARNING_STATE_PATH, { force: true }); // isolate from other tests' notebook writes
    const onb = await result("complete_onboarding", {
      topics: { python: 4 },
      groups: { Languages: ["python"] },
    });
    expect(onb.knowledge[0].topic).toBe("python");
    expect(readFileSync(db.LEARNING_STATE_PATH, "utf8")).toBe("# devcoach — Coaching Notebook\n");

    expect(await result("add_topic", { topic: "rust", confidence: 6, group: "Languages" })).toBe(
      true,
    );
    expect(await result("update_knowledge", { topic: "rust", delta: 1 })).toBe(7);
    expect(await result("add_group", { name: "Backend" })).toBe(true);
    expect(await result("remove_group", { name: "Backend" })).toBe(true);
    expect(await result("remove_topic", { topic: "rust" })).toBe(true);

    const log = await result("log_lesson", lesson());
    expect(log.id).toBe("t1");
    expect(log.body).toBe("Full lesson body.");
    expect(log.feedback).toBeNull();
    // timestamp is not an input — always the real current time, so rate limiting sees an
    // accurate "last lesson" instant instead of a model's guess.
    expect(Date.now() - new Date(log.timestamp).getTime()).toBeLessThan(60_000);
    // The result must NOT echo the rendered card (the echo made the model re-print it after
    // the tool-approval pause → double card); it carries a conditional self-check instead.
    expect(log.reply_check).toContain("invisible");
    expect(log.reply_check).toContain("Never write it twice");
    expect(JSON.stringify(log)).not.toContain("🎓 devcoach");

    // skip_lesson records the decline and resolves the pacing window: pending cue
    // disarmed AND counters restarted (a primed turn resolves before the Stop hook).
    db.withConnection((c) => {
      db.markCuePending(c);
      db.bumpNudge(c, "s-skip", "session");
    });
    const skip = await result("skip_lesson", { reason: "pure conversation, nothing technical" });
    expect(skip).toEqual({ skipped: true, reply_check: expect.stringContaining("re-armed") });
    const cueState = db.withConnection((c) => db.getCueState(c));
    expect(cueState.pending).toBe(false);
    expect(cueState.last_skip_reason).toBe("pure conversation, nothing technical");
    expect(db.withConnection((c) => db.peekNudge(c, "s-skip", "session"))).toBe(0);

    // An empty body is rejected — a lesson with no content is useless in the UI.
    expect(await error("log_lesson", lesson({ id: "t-empty", body: "" }))).toContain("body");
    expect(await result("get_lessons", { limit: 5 })).toHaveLength(1);
    expect(await result("star_lesson", { lesson_id: "t1", starred: true })).toBe(true);
    expect(await result("submit_feedback", { lesson_id: "t1", feedback: "know" })).toBe(true);
    // idempotent: same feedback again still true
    expect(await result("submit_feedback", { lesson_id: "t1", feedback: "know" })).toBe(true);
    expect(await result("submit_feedback", { lesson_id: "t1", feedback: "understood" })).toBe(true);
    const understood = await result("get_lessons", { feedback: "understood" });
    expect(understood.map((l: any) => l.id)).toContain("t1");

    expect((await result("update_settings", { key: "max_per_day", value: "5" })).max_per_day).toBe(
      5,
    );
    expect(await error("update_settings", { key: "max_per_day", value: "99" })).toContain(
      "between 1 and 20",
    );
    expect(await error("update_settings", { key: "min_gap_minutes", value: "nope" })).toContain(
      "integer",
    );
    expect(await error("update_settings", { key: "nudge_scope", value: "weekly" })).toContain(
      "nudge_scope",
    );
    expect(await error("open_ui", { port: 80 })).toContain("out of valid range");
    expect(await result("delete_lesson", { lesson_id: "t1" })).toBe(true);
    expect(await result("delete_lesson", { lesson_id: "t1" })).toBe(false);
  });

  it("reads the onboarding scan and the briefing against a seeded Claude Code history", async () => {
    await result("complete_onboarding", { topics: { python: 4 } });
    // Seed a fake Claude Code history so the onboarding payload has a scan to report.
    const home = process.env.HOME as string;
    const histProj = join(home, "projects", "ios-thing");
    mkdirSync(histProj, { recursive: true });
    writeFileSync(join(histProj, "Package.swift"), "// swift-tools-version:6.0");
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects: { [histProj]: {} } }));
    try {
      // The onboarding payload merges the history-wide scan with cwd detection.
      const o = await result("get_onboarding");
      expect(o.detected_stack.swift).toBe(6);
      expect(o.scanned_projects).toBeGreaterThanOrEqual(1);
      const ios = o.detected_projects.find((p: any) => p.name === "ios-thing");
      expect(ios.topics).toContain("swift");
      expect(o.default_topics).toEqual(db.DEFAULT_PROFILE);
      // log_lesson always stamps the real current time, so a lesson logged by an earlier test
      // in this shared sandbox can make the default 240-minute gap genuinely unmet here.
      await result("update_settings", { key: "min_gap_minutes", value: "0" });
      // The aggregated briefing carries the whole pre-lesson read in ONE call.
      const b = await result("get_briefing");
      expect(b.onboarding.knowledge_ready).toBe(true);
      expect(b.rate_limit.allowed).toBe(true);
      expect(Array.isArray(b.taught_topics)).toBe(true); // lessons from earlier tests may show
      expect(b.profile.knowledge.map((k: any) => k.topic)).toContain("python");
      expect(typeof b.notebook).toBe("string");
    } finally {
      rmSync(join(home, ".claude.json"), { force: true });
    }
  });
});

describe("agent api error paths", () => {
  // Every DB-backed write wraps its work in try/catch; force the DB layer to throw and assert
  // the failure branch is taken.
  const writes: [string, Record<string, unknown>][] = [
    ["complete_onboarding", { topics: { python: 4 } }],
    ["log_lesson", lesson({ id: "x" })],
    ["skip_lesson", { reason: "r" }],
    ["update_knowledge", { topic: "python", delta: 1 }],
    ["star_lesson", { lesson_id: "x", starred: true }],
    ["delete_lesson", { lesson_id: "x" }],
    ["submit_feedback", { lesson_id: "x", feedback: "know" }],
    ["add_topic", { topic: "go", confidence: 5 }],
    ["remove_topic", { topic: "go" }],
    ["add_group", { name: "G" }],
    ["remove_group", { name: "G" }],
    ["update_settings", { key: "max_per_day", value: "5" }],
    ["share_lesson", { lesson_id: "x" }],
    ["import_lesson", { payload: "devcoach:lesson:1:eJw" }],
    ["create_course", { title: "T", topic_id: "python" }],
    ["add_course_step", { course_id: "x", title: "s", kind: "concept", anchor: "step-1" }],
    ["update_course_progress", { course_id: "x", position: 1, status: "done" }],
  ];

  it("on a database newer than this build: reads work, writes refuse, the briefing says so", async () => {
    await result("log_lesson", lesson({ id: "ro-api", title: "Read me", body: "b" }));
    const raw = db.getConnection(db.DB_PATH);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    try {
      const lessons = await result("get_lessons", { limit: 5 });
      expect(lessons.map((l: any) => l.id)).toContain("ro-api");
      expect((await result("get_briefing")).compat).toMatchObject({ readOnly: true, dbSchema: 99 });
      expect((await result("get_profile")).compat.dbSchema).toBe(99);
      const refused = await error("submit_feedback", { lesson_id: "ro-api", feedback: "know" });
      expect(refused).toContain("schema v99");
      expect(refused).toContain("SchemaTooNewError"); // what `devcoach api` turns into exit 3
    } finally {
      const back = db.getConnection(db.DB_PATH);
      back.exec(`PRAGMA user_version = ${db.SCHEMA_VERSION}`);
      back.close();
    }
  });

  it("DB throws → every write fails cleanly; get_lessons is [], get_courses empty, state reads carry the error", async () => {
    const spy = vi.spyOn(db, "withConnection").mockImplementation(() => {
      throw new Error("boom");
    });
    try {
      for (const [name, args] of writes) {
        const r = await call(name, args);
        expect(r.ok, `${name} should fail`).toBe(false);
        expect(r.ok ? "" : r.error).toContain(name);
      }
      // get_lessons / get_courses degrade to empty rather than erroring.
      expect(await result("get_lessons", { limit: 5 })).toEqual([]);
      expect(await result("get_courses")).toEqual({ courses: [] });
      for (const name of ["get_profile", "get_briefing", "get_onboarding"]) {
        expect(await error(name)).toContain("boom");
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("log_lesson uses explicit git args over auto-detection", async () => {
    const log = await result(
      "log_lesson",
      lesson({
        id: "full",
        title: "Full",
        body: "b",
        project: "explicitP",
        repository: "o/r",
        repository_platform: "gitlab",
        branch: "feat",
        commit_hash: "c0ffee",
        folder: "/explicit",
      }),
    );
    expect(log.project).toBe("explicitP");
    expect(log.repository_platform).toBe("gitlab");
    expect(log.folder).toBe("/explicit");
  });
});

describe("agent api lesson sharing", () => {
  async function seeded(): Promise<void> {
    await result(
      "log_lesson",
      lesson({
        id: "share-me",
        topic_id: "sqlite",
        categories: ["sqlite", "node"],
        title: "WAL mode explained",
        summary: "Readers never block writers.",
        body: "Body text.\n\n💡 *Senior tip:* enable it.",
        project: "proj",
        folder: "/Users/me/secret/proj",
        repository: "local",
        repository_platform: "local",
      }),
    );
  }

  it("share_lesson renders text / link / file, never exports the folder", async () => {
    await seeded();
    const asText = await result("share_lesson", { lesson_id: "share-me" });
    expect(asText.transport).toBe("text");
    expect(asText.code).toMatch(/^devcoach:lesson:1:[A-Za-z0-9_-]+$/);
    expect(asText.text).toContain("WAL mode explained");
    expect(asText.text.trim().endsWith(asText.code)).toBe(true);
    expect(asText.link).toBeNull();
    expect(asText.markdown).toBeNull();
    expect(asText.include_context).toBe(false);
    expect(asText.reply_check).toContain("fenced code block");

    const link = await result("share_lesson", {
      lesson_id: "share-me",
      transport: "link",
      shared_by: "Phoenix",
    });
    expect(link.link).toBe(`https://ultimaphoenix.github.io/dev-coach/lesson#${link.code}`);
    expect(link.shared_by).toBe("Phoenix");
    expect(link.text).toBeNull();

    const file = await result("share_lesson", {
      lesson_id: "share-me",
      transport: "file",
      include_context: true,
      shared_by: "",
    });
    expect(file.filename).toBe("share-me.devcoach.md");
    expect(file.markdown).toContain("format: devcoach.lesson");
    expect(file.markdown).toContain("project:");
    expect(file.markdown).not.toContain("secret");
    expect(file.markdown).not.toContain("folder");
    expect(file.shared_by).toBeNull();
    expect(file.reply_check).toContain("filename");

    expect(await error("share_lesson", { lesson_id: "nope" })).toContain("not found");
  });

  it("import_lesson stores a shared lesson once, flags it imported, rejects junk", async () => {
    await seeded();
    const shared = await result("share_lesson", { lesson_id: "share-me", shared_by: "Teammate" });
    await result("delete_lesson", { lesson_id: "share-me" });

    const imported = await result("import_lesson", { payload: shared.text });
    expect(imported.kind).toBe("shared");
    expect(imported.inserted).toBe(1);
    expect(imported.lesson.id).toBe("share-me");
    expect(imported.lesson.imported).toBe(true);
    expect(imported.lesson.shared_by).toBe("Teammate");
    expect(imported.topic_tracked).toBe(false);
    expect(imported.reply_check).toContain("daily limit");

    const again = await result("import_lesson", {
      payload: `https://ultimaphoenix.github.io/dev-coach/lesson#${shared.code}`,
    });
    expect(again.duplicated).toBe(1);
    expect(again.inserted).toBe(0);

    const own = await result("get_lessons", { imported: false });
    expect(own.map((l: any) => l.id)).not.toContain("share-me");
    expect((await result("get_lessons", { imported: true })).map((l: any) => l.id)).toEqual([
      "share-me",
    ]);
    expect((await result("get_lessons", { shared_by: "Teammate" })).map((l: any) => l.id)).toEqual([
      "share-me",
    ]);
    expect(await result("get_lessons", { shared_by: "Nobody" })).toEqual([]);

    expect(await error("import_lesson", { payload: "hello" })).toContain("Not a devcoach lesson");
  });

  it("import_lesson fetches a URL and surfaces fetch failures", async () => {
    await seeded();
    const shared = await result("share_lesson", { lesson_id: "share-me" });
    await result("delete_lesson", { lesson_id: "share-me" });
    const fetchSpy = vi
      .mocked(fetchSharedInput)
      .mockResolvedValueOnce(shared.code)
      .mockRejectedValueOnce(
        new ShareInputError("The URL answered 404 — nothing to import there."),
      );
    try {
      const ok = await result("import_lesson", {
        payload: "https://gist.githubusercontent.com/x/raw/lesson.txt",
      });
      expect(ok.inserted).toBe(1);
      expect(await error("import_lesson", { payload: "https://example.com/missing" })).toContain(
        "404",
      );
      // a prompt-injected loopback / private URL is refused by the real guard before any request
      expect(await error("import_lesson", { payload: "http://127.0.0.1:7860/settings" })).toContain(
        "Only public",
      );
    } finally {
      fetchSpy.mockReset();
    }
  });

  it("update_settings accepts share_name (trimmed, ≤ 80, empty clears)", async () => {
    expect(
      (await result("update_settings", { key: "share_name", value: "  Phoenix  " })).share_name,
    ).toBe("Phoenix");
    expect(await error("update_settings", { key: "share_name", value: "x".repeat(81) })).toContain(
      "80",
    );
    expect(
      (await result("update_settings", { key: "share_name", value: "" })).share_name,
    ).toBeNull();
  });
});

describe("agent api open_ui / stop_ui", () => {
  const listen = async () => {
    const { startUi } = await import("../src/web/app");
    const server = startUi(0, { handleSignals: false });
    const port = await new Promise<number>((resolve) =>
      server.once("listening", () => resolve((server.address() as { port: number }).port)),
    );
    return { server, port };
  };

  it("open_ui reports a dashboard that already answers on the port instead of spawning one", async () => {
    const { server, port } = await listen();
    try {
      expect(await result("open_ui", { port })).toEqual({
        status: "already_running",
        port,
        url: `http://localhost:${port}`,
      });
      expect(server.listening).toBe(true);
    } finally {
      server.close();
    }
  });

  it("stop_ui stops a running dashboard (graceful) and reports when nothing listens", async () => {
    const { server, port } = await listen();
    const closed = new Promise<void>((resolve) => server.once("close", () => resolve()));
    expect(await result("stop_ui", { port })).toEqual({ stopped: true, port });
    await closed; // the http server really closed
    expect(await result("stop_ui", { port })).toEqual({ stopped: false, port });
    expect(await error("stop_ui", { port: 80 })).toContain("out of valid range");
  });
});

describe("agent api courses", () => {
  it("create → write the document → register steps → progress → read back", async () => {
    await result(
      "log_lesson",
      lesson({
        id: "logs-lesson",
        topic_id: "math",
        categories: ["math"],
        title: "Logarithms",
        body: "A log asks: which power?",
        task_context: "computing dB",
      }),
    );
    await result("submit_feedback", { lesson_id: "logs-lesson", feedback: "dont_know" });
    expect(
      await error("create_course", { title: "x", topic_id: "math", lesson_id: "nope" }),
    ).toContain("get_lessons");

    const sc = await result("create_course", {
      title: "From powers to logarithms",
      topic_id: "math",
      goal: "Read a log as 'which power'",
      lesson_id: "logs-lesson",
      prerequisites: [
        { concept: "logarithms", known: false },
        { concept: "powers", known: true },
      ],
    });
    expect(sc.id).toBe("from-powers-to-logarithms");
    expect(sc.document_path.endsWith("/courses/from-powers-to-logarithms/index.html")).toBe(true);
    expect(sc.seed_context.task_context).toBe("computing dB");
    expect(sc.reply_check).toContain("devcoach api add_course_step");
    expect(existsSync(sc.course_dir)).toBe(true);

    // a step needs the document, and the anchor inside it
    const step = { course_id: sc.id, title: "Powers", kind: "concept", anchor: "step-1" };
    expect(await error("add_course_step", step)).toContain("no document yet");
    writeFileSync(
      sc.document_path,
      '<!doctype html><section id="step-1">p</section><section id="step-2">l</section>',
    );
    expect((await result("add_course_step", step)).step.position).toBe(1);
    expect(
      await error("add_course_step", { ...step, title: "Ghost", kind: "check", anchor: "step-9" }),
    ).toContain("step-9");
    await result("add_course_step", { ...step, title: "Logs", kind: "check", anchor: "step-2" });

    expect(
      (await result("update_course_progress", { course_id: sc.id, position: 1, status: "done" }))
        .status,
    ).toBe("active");
    expect(
      (
        await result("update_course_progress", {
          course_id: sc.id,
          position: 2,
          status: "skipped",
        })
      ).status,
    ).toBe("completed");
    expect(
      await error("update_course_progress", { course_id: "nope", status: "abandoned" }),
    ).toContain("not found");

    const byLesson = await result("get_courses", { lesson_id: "logs-lesson" });
    expect(byLesson.courses).toHaveLength(1);
    expect(byLesson.courses[0].steps).toHaveLength(2);
    expect(byLesson.courses[0].course_dir).toBe(sc.course_dir);
    expect((await result("get_courses", { status: "active" })).courses).toHaveLength(0);
    expect((await result("get_courses", { course_id: sc.id })).courses).toHaveLength(1);
  });
});

describe("devcoach api — the CLI door", () => {
  /** Run the CLI in-process, capturing stdout/stderr and the exit code it set (0 = unset). */
  async function run(args: string[], stdin?: string): Promise<{ out: string; exit: number }> {
    const lines: string[] = [];
    const spies = [
      vi.spyOn(console, "log").mockImplementation((...a) => lines.push(`${a.join(" ")}\n`)),
      vi.spyOn(console, "error").mockImplementation((...a) => lines.push(`${a.join(" ")}\n`)),
      vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
        lines.push(String(s));
        return true;
      }),
      vi.spyOn(process.stderr, "write").mockImplementation((s: any) => {
        lines.push(String(s));
        return true;
      }),
      vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
        throw new Error(`__exit__${code ?? 0}`);
      }) as never),
    ];
    const stdinSpy =
      stdin === undefined
        ? null
        : vi.spyOn(process, "stdin", "get").mockReturnValue(Readable.from([stdin]) as never);
    const argv = process.argv;
    process.argv = ["node", "bin", ...args];
    process.exitCode = undefined;
    let exit = 0;
    try {
      await runCli();
    } catch (e) {
      const m = /^__exit__(\d+)$/.exec((e as Error).message);
      if (!m) throw e;
      exit = Number(m[1]);
    } finally {
      process.argv = argv;
      for (const s of spies) s.mockRestore();
      stdinSpy?.mockRestore();
    }
    exit ||= Number(process.exitCode ?? 0);
    process.exitCode = undefined;
    return { out: lines.join(""), exit };
  }
  /** The one JSON line `devcoach api <operation>` prints. */
  const envelope = (out: string): any => JSON.parse(out.trim().split("\n").at(-1) ?? "");

  it("with no operation lists them; --json is the catalogue with a JSON Schema per input", async () => {
    const list = await run(["api"]);
    expect(list.exit).toBe(0);
    expect(list.out).toContain("get_briefing");
    expect(list.out).toContain("log_lesson");
    expect(list.out).toContain("devcoach api <operation>");
    const json = await run(["api", "--json"]);
    expect(json.exit).toBe(0);
    const { ok, result: catalogue } = envelope(json.out);
    expect(ok).toBe(true);
    expect(catalogue.operations).toHaveLength(25);
    for (const op of catalogue.operations) {
      expect(op.input.type, op.name).toBe("object");
      expect(typeof op.read_only, op.name).toBe("boolean");
    }
  });

  it("exit codes: 0 ok, 1 refused, 2 unknown operation or input that is not JSON, 3 newer database", async () => {
    const ok = await run(["api", "get_profile"]);
    expect(ok.exit).toBe(0);
    expect(envelope(ok.out).ok).toBe(true);
    expect(envelope(ok.out).result).toHaveProperty("knowledge");

    const refused = await run(["api", "update_settings", '{"key":"max_per_day","value":"99"}']);
    expect(refused.exit).toBe(1);
    expect(envelope(refused.out)).toEqual({
      ok: false,
      error: expect.stringContaining("between 1 and 20"),
    });
    const invalid = await run(["api", "log_lesson", '{"id":1}']);
    expect(invalid.exit).toBe(1);
    expect(envelope(invalid.out).error).toContain("invalid input");

    const unknown = await run(["api", "nope"]);
    expect(unknown.exit).toBe(2);
    expect(envelope(unknown.out).error).toContain("unknown operation 'nope'");
    const bad = await run(["api", "get_lessons", "{bad"]);
    expect(bad.exit).toBe(2);
    expect(envelope(bad.out).error).toContain("not valid JSON");

    // `-` reads the JSON from stdin (the skill pipes lesson bodies through a quoted heredoc)
    const viaStdin = await run(["api", "complete_onboarding", "-"], '{"topics":{"python":4}}\n');
    expect(viaStdin.exit).toBe(0);
    expect(envelope(viaStdin.out).result.knowledge.map((k: any) => k.topic)).toEqual(["python"]);
    const multiline = await run(
      ["api", "log_lesson", "-"],
      JSON.stringify(lesson({ id: "cli-1", body: "First paragraph.\n\nSecond paragraph.\n" })),
    );
    expect(multiline.exit).toBe(0);
    expect(envelope(multiline.out).result.body).toBe("First paragraph.\n\nSecond paragraph.\n");
    const empty = await run(["api", "get_profile", "-"], "");
    expect(empty.exit).toBe(0); // empty stdin = {}

    // a database upgraded by a newer devcoach: the write is refused, exit 3 like every CLI write
    const raw = db.getConnection(db.DB_PATH);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    try {
      const ro = await run(["api", "submit_feedback", '{"lesson_id":"cli-1","feedback":"know"}']);
      expect(ro.exit).toBe(3);
      expect(envelope(ro.out).error).toContain("schema v99");
      expect(envelope((await run(["api", "get_lessons"])).out).ok).toBe(true); // reads still work
    } finally {
      const back = db.getConnection(db.DB_PATH);
      back.exec(`PRAGMA user_version = ${db.SCHEMA_VERSION}`);
      back.close();
    }
  });

  it("`devcoach mcp` is gone: it says why on stderr and exits 1, so a stale MCP registration is not mute", async () => {
    const r = await run(["mcp"]);
    expect(r.exit).toBe(1);
    expect(r.out).toContain("no longer runs as an MCP server");
    expect(r.out).toContain("devcoach install");
    expect((await run(["--help"])).out).not.toContain(" mcp "); // hidden from the command list
  });
});
