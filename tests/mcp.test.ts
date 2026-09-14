import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import { ShareInputError } from "../src/core/share";
import { fetchSharedInput } from "../src/core/share-fetch";
import { createServer } from "../src/mcp/server";

vi.mock("../src/core/share-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/share-fetch")>();
  return { ...actual, fetchSharedInput: vi.fn(actual.fetchSharedInput) };
});

async function connect() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(st);
  const client = new Client({ name: "t", version: "1.0.0" });
  await client.connect(ct);
  return { client, server };
}
const text = (r: any): string => r.content[0].text;

describe("mcp server", () => {
  it("lists 20 tools, 10 resources + 1 template, 1 prompt", async () => {
    const { client, server } = await connect();
    const tools = (await client.listTools()).tools;
    expect(tools).toHaveLength(20);
    const names = tools.map((t: any) => t.name);
    expect(names).toContain("preview_deep_scan");
    // State reads are tools: tool names resolve in every client, resource reads need the
    // client-specific server name (plugin:devcoach:devcoach vs devcoach).
    for (const name of ["get_briefing", "get_onboarding", "get_profile"]) {
      const tool = tools.find((t: any) => t.name === name);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
    }
    expect(names).not.toContain("update_notebook");
    expect((await client.listResources()).resources).toHaveLength(10);
    expect((await client.listResourceTemplates()).resourceTemplates).toHaveLength(1);
    expect((await client.listPrompts()).prompts[0].name).toBe("devcoach_instructions");
    await client.close();
    await server.close();
  });

  it("get_briefing / get_onboarding / get_profile return exactly what the resources return", async () => {
    const { client, server } = await connect();
    await client.callTool({ name: "complete_onboarding", arguments: { topics: { python: 4 } } });
    const read = async (uri: string) =>
      JSON.parse(((await client.readResource({ uri })) as any).contents[0].text);
    const briefing: any = await client.callTool({ name: "get_briefing", arguments: {} });
    expect(briefing.isError).toBeFalsy();
    const briefingRes = await read("devcoach://briefing");
    expect(Object.keys(briefing.structuredContent).sort()).toEqual(Object.keys(briefingRes).sort());
    expect(briefing.structuredContent.notebook_path).toBe(briefingRes.notebook_path);
    expect(briefing.structuredContent.onboarding.knowledge_ready).toBe(true);
    const profile: any = await client.callTool({ name: "get_profile", arguments: {} });
    expect(profile.structuredContent).toEqual(await read("devcoach://profile"));
    const onboarding: any = await client.callTool({ name: "get_onboarding", arguments: {} });
    const onboardingRes = await read("devcoach://onboarding");
    expect(Object.keys(onboarding.structuredContent).sort()).toEqual(
      Object.keys(onboardingRes).sort(),
    );
    expect(onboarding.structuredContent.detected_stack).toEqual(onboardingRes.detected_stack);
    await client.close();
    await server.close();
  });

  it("complete_onboarding guarantees a non-empty notebook placeholder; the skill writes the real one directly", async () => {
    const { client, server } = await connect();
    rmSync(db.LEARNING_STATE_PATH, { force: true }); // isolate from other tests' notebook writes in this shared sandbox
    await client.callTool({
      name: "complete_onboarding",
      arguments: { topics: { python: 4 } },
    });
    // No notebook argument exists on this tool — it only guarantees the file exists and
    // is non-empty the instant the profile saves.
    expect(existsSync(db.LEARNING_STATE_PATH)).toBe(true);
    expect(readFileSync(db.LEARNING_STATE_PATH, "utf8")).toBe("# devcoach — Coaching Notebook\n");

    // The skill overwrites the placeholder directly, with its own file tools — simulated
    // here as a plain write, no MCP tool involved.
    writeFileSync(
      db.LEARNING_STATE_PATH,
      "# Notebook\n\n## Observations\nUser absorbed sockets.\n",
    );
    const r: any = await client.readResource({ uri: "devcoach://notebook" });
    expect(r.contents[0].mimeType).toBe("text/markdown");
    expect(r.contents[0].text).toContain("User absorbed sockets.");

    const onboarding: any = await client.readResource({ uri: "devcoach://onboarding" });
    expect(JSON.parse(onboarding.contents[0].text).notebook_path).toBe(db.LEARNING_STATE_PATH);
    const briefing: any = await client.readResource({ uri: "devcoach://briefing" });
    expect(JSON.parse(briefing.contents[0].text).notebook_path).toBe(db.LEARNING_STATE_PATH);

    await client.close();
    await server.close();
  });

  it("preview_deep_scan returns a metadata-only windowed count with the requested/default months", async () => {
    const { client, server } = await connect();
    const withDefault: any = await client.callTool({ name: "preview_deep_scan", arguments: {} });
    expect(withDefault.structuredContent.window_months).toBe(3);
    expect(withDefault.structuredContent.candidate_count).toBe(0);
    expect(withDefault.structuredContent.over_soft_limit).toBe(false);
    expect(withDefault.structuredContent.candidates).toEqual([]);

    const withMonths: any = await client.callTool({
      name: "preview_deep_scan",
      arguments: { months: 6 },
    });
    expect(withMonths.structuredContent.window_months).toBe(6);
    await client.close();
    await server.close();
  });

  it("runs the full tool surface", async () => {
    const { client, server } = await connect();
    rmSync(db.LEARNING_STATE_PATH, { force: true }); // isolate from other tests' notebook writes in this shared sandbox
    const onb: any = await client.callTool({
      name: "complete_onboarding",
      arguments: {
        topics: { python: 4 },
        groups: { Languages: ["python"] },
      },
    });
    expect(onb.structuredContent.knowledge[0].topic).toBe("python");
    // No notebook argument — the tool only guarantees a non-empty placeholder.
    expect(existsSync(db.LEARNING_STATE_PATH)).toBe(true);
    expect(readFileSync(db.LEARNING_STATE_PATH, "utf8")).toBe("# devcoach — Coaching Notebook\n");

    await client.callTool({
      name: "add_topic",
      arguments: { topic: "rust", confidence: 6, group: "Languages" },
    });
    expect(
      text(
        await client.callTool({ name: "update_knowledge", arguments: { topic: "rust", delta: 1 } }),
      ),
    ).toBe("7");
    await client.callTool({ name: "add_group", arguments: { name: "Backend" } });
    expect(
      text(await client.callTool({ name: "remove_group", arguments: { name: "Backend" } })),
    ).toBe("true");
    expect(
      text(await client.callTool({ name: "remove_topic", arguments: { topic: "rust" } })),
    ).toBe("true");

    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "t1",
        topic_id: "python",
        categories: ["python"],
        title: "X",
        level: "mid",
        summary: "s",
        body: "Full lesson body.",
      },
    });
    expect(log.structuredContent.id).toBe("t1");
    expect(log.structuredContent.body).toBe("Full lesson body.");
    expect(log.structuredContent.feedback).toBeNull();
    // timestamp is not a tool argument — always the real current time, so rate
    // limiting sees an accurate "last lesson" instant instead of a model's guess.
    expect(Date.now() - new Date(log.structuredContent.timestamp).getTime()).toBeLessThan(60_000);
    // The result must NOT echo the rendered card (the echo made the model re-print
    // it after the tool-approval pause → double card); it carries a conditional
    // self-check instead — inside structuredContent, the only part Claude Code
    // surfaces to the model.
    expect(log.structuredContent.reply_check).toContain("ARGUMENTS are invisible");
    expect(log.structuredContent.reply_check).toContain("Never write it twice");
    expect(text(log)).not.toContain("🎓 devcoach");

    // skip_lesson records the decline and resolves the pacing window: pending cue
    // disarmed AND counters restarted (a primed turn resolves before the Stop hook).
    db.withConnection((c) => {
      db.markCuePending(c);
      db.bumpNudge(c, "s-skip", "session");
    });
    const skip: any = await client.callTool({
      name: "skip_lesson",
      arguments: { reason: "pure conversation, nothing technical" },
    });
    expect(text(skip)).toContain("re-armed");
    const cueState = db.withConnection((c) => db.getCueState(c));
    expect(cueState.pending).toBe(false);
    expect(cueState.last_skip_reason).toBe("pure conversation, nothing technical");
    expect(db.withConnection((c) => db.peekNudge(c, "s-skip", "session"))).toBe(0);

    // An empty body is rejected — a lesson with no content is useless in the UI.
    const emptyBody: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "t-empty",
        topic_id: "python",
        categories: ["python"],
        title: "X",
        level: "mid",
        summary: "s",
        body: "",
      },
    });
    expect(emptyBody.isError).toBe(true);
    expect(
      JSON.parse(text(await client.callTool({ name: "get_lessons", arguments: { limit: 5 } }))),
    ).toHaveLength(1);
    expect(
      text(
        await client.callTool({
          name: "star_lesson",
          arguments: { lesson_id: "t1", starred: true },
        }),
      ),
    ).toBe("true");
    expect(
      text(
        await client.callTool({
          name: "submit_feedback",
          arguments: { lesson_id: "t1", feedback: "know" },
        }),
      ),
    ).toBe("true");
    // idempotent: same feedback again still true
    expect(
      text(
        await client.callTool({
          name: "submit_feedback",
          arguments: { lesson_id: "t1", feedback: "know" },
        }),
      ),
    ).toBe("true");

    const ok: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "max_per_day", value: "5" },
    });
    expect(ok.structuredContent.max_per_day).toBe(5);
    const bad: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "max_per_day", value: "99" },
    });
    expect(bad.isError).toBe(true);
    const bad2: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "min_gap_minutes", value: "nope" },
    });
    expect(bad2.isError).toBe(true);

    const ui: any = await client.callTool({ name: "open_ui", arguments: { port: 80 } });
    expect(text(ui)).toContain("out of valid range");

    expect(
      text(await client.callTool({ name: "delete_lesson", arguments: { lesson_id: "t1" } })),
    ).toBe("true");
    await client.close();
    await server.close();
  });

  it("log_lesson never elicits, even when the client declares the capability", async () => {
    // Regression: in the card-last flow log_lesson runs BEFORE the card is visible,
    // so an inline "Did that land?" dialog asked about an unseen lesson (observed
    // live in Claude Code). Feedback is the text line under the card + next-turn
    // submit_feedback — the tool itself must stay a pure, silent save.
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(st);
    const client = new Client(
      { name: "t", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    const elicit = vi.fn(async () => ({
      action: "accept" as const,
      content: { feedback: "know" },
    }));
    client.setRequestHandler("elicitation/create", elicit);
    await client.connect(ct);
    await client.callTool({ name: "complete_onboarding", arguments: { topics: { python: 4 } } });

    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "e1",
        topic_id: "python",
        categories: ["python"],
        title: "Silent save",
        level: "mid",
        summary: "s",
        body: "b",
      },
    });
    expect(elicit).not.toHaveBeenCalled();
    expect(log.structuredContent.feedback).toBeNull(); // saved without inline feedback
    await client.close();
    await server.close();
  });

  it("reads every resource and the prompt", async () => {
    const { client, server } = await connect();
    await client.callTool({ name: "complete_onboarding", arguments: { topics: { python: 4 } } });
    // Seed a fake Claude Code history so the onboarding resource has a scan to report.
    const home = process.env.HOME as string;
    const histProj = join(home, "projects", "ios-thing");
    mkdirSync(histProj, { recursive: true });
    writeFileSync(join(histProj, "Package.swift"), "// swift-tools-version:6.0");
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ projects: { [histProj]: {} } }));
    for (const uri of [
      "devcoach://profile",
      "devcoach://settings",
      "devcoach://lessons/recent",
      "devcoach://stats",
      "devcoach://taught-topics",
      "devcoach://rate-limit",
      "devcoach://context",
      "devcoach://onboarding",
      "devcoach://briefing",
    ]) {
      const r: any = await client.readResource({ uri });
      expect(r.contents[0].text).toBeTruthy();
    }
    // The onboarding resource merges the history-wide scan with cwd detection.
    const onboarding: any = await client.readResource({ uri: "devcoach://onboarding" });
    const o = JSON.parse(onboarding.contents[0].text);
    expect(o.detected_stack.swift).toBe(6);
    expect(o.scanned_projects).toBeGreaterThanOrEqual(1);
    const ios = o.detected_projects.find((p: any) => p.name === "ios-thing");
    expect(ios.topics).toContain("swift");
    // log_lesson now always stamps the real current time (never a model-supplied
    // value), so a lesson logged by an earlier test in this shared-DB file can make
    // the default 240-minute gap genuinely unmet here — force it open explicitly
    // instead of relying on stale fixed timestamps to look "long ago".
    await client.callTool({
      name: "update_settings",
      arguments: { key: "min_gap_minutes", value: "0" },
    });
    // The aggregated briefing carries the whole pre-lesson read in ONE resource.
    const briefing: any = await client.readResource({ uri: "devcoach://briefing" });
    const b = JSON.parse(briefing.contents[0].text);
    expect(b.onboarding.knowledge_ready).toBe(true);
    expect(b.rate_limit.allowed).toBe(true);
    expect(Array.isArray(b.taught_topics)).toBe(true); // lessons from earlier tests may show
    expect(b.profile.knowledge.map((k: any) => k.topic)).toContain("python");
    expect(typeof b.notebook).toBe("string");
    const byId: any = await client.readResource({ uri: "devcoach://lessons/missing" });
    expect(JSON.parse(byId.contents[0].text).error).toContain("not found");
    const pr: any = await client.getPrompt({ name: "devcoach_instructions" });
    expect(pr.messages[0].content.text.length).toBeGreaterThan(100);
    await client.close();
    await server.close();
  });
});

describe("mcp server error paths", () => {
  // Every DB-backed tool/resource wraps its work in try/catch; force the DB layer
  // to throw and assert the failure branch is taken.
  const dbBackedTools: [string, Record<string, unknown>][] = [
    ["complete_onboarding", { topics: { python: 4 } }],
    [
      "log_lesson",
      {
        id: "x",
        topic_id: "python",
        categories: ["python"],
        title: "t",
        level: "mid",
        summary: "s",
      },
    ],
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
  ];

  it("DB-backed tools return isError when the DB throws", async () => {
    const { client, server } = await connect();
    const spy = vi.spyOn(db, "withConnection").mockImplementation(() => {
      throw new Error("boom");
    });
    for (const [name, args] of dbBackedTools) {
      const r: any = await client.callTool({ name, arguments: args });
      expect(r.isError, `${name} should be isError`).toBe(true);
    }
    // get_lessons degrades to an empty list rather than erroring.
    const lessons: any = await client.callTool({ name: "get_lessons", arguments: { limit: 5 } });
    expect(text(lessons)).toBe("[]");
    spy.mockRestore();
    await client.close();
    await server.close();
  });

  it("log_lesson uses explicit git args over auto-detection", async () => {
    const { client, server } = await connect();
    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "full",
        topic_id: "python",
        categories: ["python"],
        title: "Full",
        level: "mid",
        summary: "s",
        body: "b",
        project: "explicitP",
        repository: "o/r",
        repository_platform: "gitlab",
        branch: "feat",
        commit_hash: "c0ffee",
        folder: "/explicit",
      },
    });
    expect(log.structuredContent.project).toBe("explicitP");
    expect(log.structuredContent.repository_platform).toBe("gitlab");
    expect(log.structuredContent.folder).toBe("/explicit");
    await client.close();
    await server.close();
  });

  it("resources degrade safely when the DB throws", async () => {
    const { client, server } = await connect();
    const spy = vi.spyOn(db, "withConnection").mockImplementation(() => {
      throw new Error("boom");
    });
    for (const uri of [
      "devcoach://profile",
      "devcoach://settings",
      "devcoach://lessons/recent",
      "devcoach://stats",
      "devcoach://taught-topics",
      "devcoach://rate-limit",
      "devcoach://context",
      "devcoach://onboarding",
      "devcoach://briefing",
      "devcoach://lessons/some-id",
    ]) {
      const r: any = await client.readResource({ uri });
      // The catch path must run and yield safe, parseable JSON (an {error} object
      // or an empty collection) — never a thrown exception.
      const parsed = JSON.parse(r.contents[0].text);
      expect(parsed === null || typeof parsed === "object", uri).toBe(true);
    }
    spy.mockRestore();
    await client.close();
    await server.close();
  });
});

describe("mcp lesson sharing", () => {
  async function seeded() {
    const { client, server } = await connect();
    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "share-me",
        topic_id: "sqlite",
        categories: ["sqlite", "node"],
        title: "WAL mode explained",
        level: "mid",
        summary: "Readers never block writers.",
        body: "Body text.\n\n💡 *Senior tip:* enable it.",
        project: "proj",
        folder: "/Users/me/secret/proj",
        repository: "local",
        repository_platform: "local",
      },
    });
    expect(log.isError).toBeFalsy();
    return { client, server };
  }

  it("share_lesson renders text / link / file, never exports the folder", async () => {
    const { client, server } = await seeded();
    const asText: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "share-me" },
    });
    expect(asText.isError).toBeFalsy();
    const sc = asText.structuredContent;
    expect(sc.transport).toBe("text");
    expect(sc.code).toMatch(/^devcoach:lesson:1:[A-Za-z0-9_-]+$/);
    expect(sc.text).toContain("WAL mode explained");
    expect(sc.text.trim().endsWith(sc.code)).toBe(true);
    expect(sc.link).toBeNull();
    expect(sc.markdown).toBeNull();
    expect(sc.include_context).toBe(false);
    expect(sc.reply_check).toContain("fenced code block");

    const link: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "share-me", transport: "link", shared_by: "Phoenix" },
    });
    expect(link.structuredContent.link).toBe(
      `https://ultimaphoenix.github.io/dev-coach/lesson#${link.structuredContent.code}`,
    );
    expect(link.structuredContent.shared_by).toBe("Phoenix");
    expect(link.structuredContent.text).toBeNull();

    const file: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "share-me", transport: "file", include_context: true, shared_by: "" },
    });
    expect(file.structuredContent.filename).toBe("share-me.devcoach.md");
    expect(file.structuredContent.markdown).toContain("format: devcoach.lesson");
    expect(file.structuredContent.markdown).toContain("project:");
    expect(file.structuredContent.markdown).not.toContain("secret");
    expect(file.structuredContent.markdown).not.toContain("folder");
    expect(file.structuredContent.shared_by).toBeNull();
    expect(file.structuredContent.reply_check).toContain("filename");

    const missing: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "nope" },
    });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain("not found");
    await client.close();
    await server.close();
  });

  it("import_lesson stores a shared lesson once, flags it imported, rejects junk", async () => {
    const { client, server } = await seeded();
    const shared: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "share-me", shared_by: "Teammate" },
    });
    await client.callTool({ name: "delete_lesson", arguments: { lesson_id: "share-me" } });

    const imported: any = await client.callTool({
      name: "import_lesson",
      arguments: { payload: shared.structuredContent.text },
    });
    expect(imported.isError).toBeFalsy();
    expect(imported.structuredContent.kind).toBe("shared");
    expect(imported.structuredContent.inserted).toBe(1);
    expect(imported.structuredContent.lesson.id).toBe("share-me");
    expect(imported.structuredContent.lesson.imported).toBe(true);
    expect(imported.structuredContent.lesson.shared_by).toBe("Teammate");
    expect(imported.structuredContent.topic_tracked).toBe(false);
    expect(imported.structuredContent.reply_check).toContain("daily limit");

    const again: any = await client.callTool({
      name: "import_lesson",
      arguments: {
        payload: `https://ultimaphoenix.github.io/dev-coach/lesson#${shared.structuredContent.code}`,
      },
    });
    expect(again.isError).toBeFalsy();
    expect(again.structuredContent.duplicated).toBe(1);
    expect(again.structuredContent.inserted).toBe(0);

    const own: any = await client.callTool({ name: "get_lessons", arguments: { imported: false } });
    expect(JSON.parse(text(own)).map((l: any) => l.id)).not.toContain("share-me");
    const theirs: any = await client.callTool({
      name: "get_lessons",
      arguments: { imported: true },
    });
    expect(JSON.parse(text(theirs)).map((l: any) => l.id)).toEqual(["share-me"]);

    const junk: any = await client.callTool({
      name: "import_lesson",
      arguments: { payload: "hello" },
    });
    expect(junk.isError).toBe(true);
    expect(text(junk)).toContain("Not a devcoach lesson");
    await client.close();
    await server.close();
  });

  it("import_lesson fetches a URL and surfaces fetch failures", async () => {
    const { client, server } = await seeded();
    const shared: any = await client.callTool({
      name: "share_lesson",
      arguments: { lesson_id: "share-me" },
    });
    await client.callTool({ name: "delete_lesson", arguments: { lesson_id: "share-me" } });
    const fetchSpy = vi
      .mocked(fetchSharedInput)
      .mockResolvedValueOnce(shared.structuredContent.code)
      .mockRejectedValueOnce(
        new ShareInputError("The URL answered 404 — nothing to import there."),
      );
    try {
      const ok: any = await client.callTool({
        name: "import_lesson",
        arguments: { payload: "https://gist.githubusercontent.com/x/raw/lesson.txt" },
      });
      expect(ok.isError).toBeFalsy();
      expect(ok.structuredContent.inserted).toBe(1);
      const gone: any = await client.callTool({
        name: "import_lesson",
        arguments: { payload: "https://example.com/missing" },
      });
      expect(gone.isError).toBe(true);
      expect(text(gone)).toContain("404");
      // a prompt-injected loopback / private URL is refused by the real guard before any request
      const local: any = await client.callTool({
        name: "import_lesson",
        arguments: { payload: "http://127.0.0.1:7860/settings" },
      });
      expect(local.isError).toBe(true);
      expect(text(local)).toContain("Only public");
    } finally {
      fetchSpy.mockReset();
    }
    await client.close();
    await server.close();
  });

  it("update_settings accepts share_name (trimmed, ≤ 80, empty clears)", async () => {
    const { client, server } = await connect();
    const set: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "share_name", value: "  Phoenix  " },
    });
    expect(set.isError).toBeFalsy();
    expect(set.structuredContent.share_name).toBe("Phoenix");
    const tooLong: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "share_name", value: "x".repeat(81) },
    });
    expect(tooLong.isError).toBe(true);
    const cleared: any = await client.callTool({
      name: "update_settings",
      arguments: { key: "share_name", value: "" },
    });
    expect(cleared.structuredContent.share_name).toBeNull();
    await client.close();
    await server.close();
  });
});
