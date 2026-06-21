import { existsSync, readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import { createServer } from "../src/mcp/server";

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
  it("lists 13 tools, 8 resources + 1 template, 1 prompt", async () => {
    const { client, server } = await connect();
    expect((await client.listTools()).tools.length).toBe(13);
    expect((await client.listResources()).resources.length).toBe(8);
    expect((await client.listResourceTemplates()).resourceTemplates.length).toBe(1);
    expect((await client.listPrompts()).prompts[0].name).toBe("devcoach_instructions");
    await client.close();
    await server.close();
  });

  it("runs the full tool surface", async () => {
    const { client, server } = await connect();
    const onb: any = await client.callTool({
      name: "complete_onboarding",
      arguments: {
        topics: { python: 4 },
        groups: { Languages: ["python"] },
        notebook: "# devcoach — Coaching Notebook\n\n## Observations\nPrefers type safety.\n",
      },
    });
    expect(onb.structuredContent.knowledge[0].topic).toBe("python");
    // The personalized notebook the model passes is saved verbatim to learning-state.md.
    expect(existsSync(db.LEARNING_STATE_PATH)).toBe(true);
    expect(readFileSync(db.LEARNING_STATE_PATH, "utf8")).toContain("Prefers type safety.");

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
        timestamp: "2026-06-16T10:00:00Z",
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

    // An empty body is rejected — a lesson with no content is useless in the UI.
    const emptyBody: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "t-empty",
        timestamp: "2026-06-16T10:00:00Z",
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
      JSON.parse(text(await client.callTool({ name: "get_lessons", arguments: { limit: 5 } })))
        .length,
    ).toBe(1);
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

  it("log_lesson collects inline feedback via elicitation when the client supports it", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(st);
    const client = new Client(
      { name: "t", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => ({
      action: "accept",
      content: { feedback: "know" },
    }));
    await client.connect(ct);
    await client.callTool({ name: "complete_onboarding", arguments: { topics: { python: 4 } } });

    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "e1",
        timestamp: "2026-06-16T10:00:00Z",
        topic_id: "python",
        categories: ["python"],
        title: "Elicited",
        level: "mid",
        summary: "s",
        body: "b",
      },
    });
    expect(log.structuredContent.feedback).toBe("know"); // feedback applied inline
    await client.close();
    await server.close();
  });

  it("reads every resource and the prompt", async () => {
    const { client, server } = await connect();
    await client.callTool({ name: "complete_onboarding", arguments: { topics: { python: 4 } } });
    for (const uri of [
      "devcoach://profile",
      "devcoach://settings",
      "devcoach://lessons/recent",
      "devcoach://stats",
      "devcoach://taught-topics",
      "devcoach://rate-limit",
      "devcoach://context",
      "devcoach://onboarding",
    ]) {
      const r: any = await client.readResource({ uri });
      expect(r.contents[0].text).toBeTruthy();
    }
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
        timestamp: "2026-01-01T00:00:00Z",
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
        timestamp: "2026-01-01T00:00:00Z",
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

  it("log_lesson still saves when the user declines the feedback elicitation", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(st);
    const client = new Client(
      { name: "t", version: "1.0.0" },
      { capabilities: { elicitation: {} } },
    );
    client.setRequestHandler(ElicitRequestSchema, async () => ({ action: "decline" }));
    await client.connect(ct);
    const log: any = await client.callTool({
      name: "log_lesson",
      arguments: {
        id: "d1",
        timestamp: "2026-01-01T00:00:00Z",
        topic_id: "python",
        categories: ["python"],
        title: "Declined",
        level: "mid",
        summary: "s",
        body: "b",
      },
    });
    expect(log.structuredContent.feedback).toBeNull(); // declined → no feedback applied, lesson saved
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
