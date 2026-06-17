import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
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
      arguments: { topics: { python: 4 }, groups: { Languages: ["python"] } },
    });
    expect(onb.structuredContent.knowledge[0].topic).toBe("python");

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
      },
    });
    expect(log.structuredContent.id).toBe("t1");
    expect(log.structuredContent.feedback).toBeNull();
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

    expect(
      text(await client.callTool({ name: "delete_lesson", arguments: { lesson_id: "t1" } })),
    ).toBe("true");
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
