// The Claude Desktop trigger: Desktop runs no devcoach hooks, so the server's `instructions` make
// the model the lesson trigger there — and only there. Every client is an in-memory MCP client
// that initializes under the name the real host reports (Desktop: `claude-ai`).
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import type { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import { CARD_FALLBACK } from "../src/core/prompts";
import {
  coachingDriver,
  createServer,
  SELF_DRIVEN_CLIENTS,
  serveInstructionsPerClient,
  serverInstructions,
} from "../src/mcp/server";

// The 2.7 instructions, as every hook-driven client keeps receiving them, byte for byte.
const HOOK_DRIVEN =
  "Progressive technical coaching server. Use the devcoach_instructions prompt for full coaching " +
  "behaviour guidelines. Read coaching state with the get_briefing / get_onboarding / get_profile " +
  "tools; the devcoach:// resources expose the same data for clients that browse resources. " +
  "share_lesson hands a lesson to another person (text, link or file); import_lesson stores one " +
  "they were given.";

// Claude Code, Gemini CLI, Codex CLI, the MCP Inspector, and a name nobody verified.
const HOOK_CLIENTS = [
  "claude-code",
  "gemini-cli-mcp-client",
  "codex-mcp-client",
  "inspector-client",
  "whatever",
];

async function connect(name: string) {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(st);
  const client = new Client({ name, version: "0.1.0" });
  await client.connect(ct);
  return {
    client,
    coaching: async () => {
      const r: any = await client.callTool({ name: "get_briefing", arguments: {} });
      return r.structuredContent.coaching;
    },
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

const lesson = (id: string) => ({
  id,
  topic_id: "python",
  categories: ["python"],
  title: "A lesson",
  level: "mid",
  summary: "s",
  body: "b",
});

describe("who drives lessons", () => {
  it("only claude-ai is self-driven; every other name, and none, is hook-driven", () => {
    expect(SELF_DRIVEN_CLIENTS).toEqual(["claude-ai"]); // grows only by a deliberate edit
    expect(coachingDriver("claude-ai")).toBe("self");
    for (const name of [...HOOK_CLIENTS, "Claude-AI", "claude-ai ", "", undefined]) {
      expect(coachingDriver(name)).toBe("hooks");
    }
  });
});

describe("initialize: the instructions each client receives", () => {
  it("Claude Desktop gets the gated trigger, carrying CARD_FALLBACK itself", async () => {
    const desktop = await connect("claude-ai");
    const instructions = desktop.client.getInstructions() as string;
    expect(instructions).toBe(serverInstructions("claude-ai"));
    expect(instructions).toContain("you are the coaching trigger");
    expect(instructions).toContain("call get_briefing silently");
    expect(instructions).toContain("only when it returns coaching.lesson_due = true");
    // One copy of the card flow: the constant, never a paraphrase — PR 4's feedback line
    // reaches Desktop through it with no change here.
    expect(instructions).toContain(`${CARD_FALLBACK}\n`);
    expect(instructions).toContain("follow its next_step");
    expect(instructions).toContain("once per conversation");
    expect(instructions).toContain("never mention a skipped lesson, the rate limit or this check");
    expect(instructions).toContain('"coach me"');
    expect(instructions).toContain("follow it and add no lesson of your own");
    await desktop.close();
  });

  it("every hook-driven client keeps the 2.7 instructions, byte for byte", async () => {
    expect(serverInstructions(undefined)).toBe(HOOK_DRIVEN);
    for (const name of HOOK_CLIENTS) {
      const other = await connect(name);
      const instructions = other.client.getInstructions() as string;
      expect(instructions).toBe(HOOK_DRIVEN);
      expect(instructions).not.toContain("get_briefing silently");
      expect(instructions).not.toContain(CARD_FALLBACK);
      await other.close();
    }
  });

  it("the rest of the handshake is the SDK's own: version negotiation and client identity", async () => {
    const [ct, st] = InMemoryTransport.createLinkedPair();
    const server = createServer();
    await server.connect(st);
    const client = new Client({ name: "claude-ai", version: "0.1.0" });
    await client.connect(ct);
    expect(client.getServerVersion()?.name).toBe("devcoach");
    expect(client.getNegotiatedProtocolVersion()).toBeTruthy();
    expect(server.server.getClientVersion()).toEqual({ name: "claude-ai", version: "0.1.0" });
    await client.close();
    await server.close();
  });

  it("without the SDK's initialize internals the handler is left alone (hook-driven for all)", () => {
    const setRequestHandler = vi.fn();
    serveInstructionsPerClient({ server: { setRequestHandler } } as unknown as McpServer);
    expect(setRequestHandler).not.toHaveBeenCalled();
  });
});

// One sandbox for this file, walked through the states in order: fresh → onboarded → lesson
// logged → pacing reopened → course → read-only.
describe("get_briefing: the coaching gate", () => {
  it("is closed until onboarding is complete", async () => {
    const desktop = await connect("claude-ai");
    expect(await desktop.coaching()).toEqual({
      driver: "self",
      client: { name: "claude-ai", version: "0.1.0" },
      lesson_due: false,
      reason: "onboarding is not complete: call get_onboarding",
    });
    await desktop.close();
  });

  it("opens for claude-ai when the rate limit allows a lesson, paced by it alone", async () => {
    const desktop = await connect("claude-ai");
    await desktop.client.callTool({
      name: "complete_onboarding",
      arguments: { topics: { python: 4 } },
    });
    const coaching = await desktop.coaching();
    expect(coaching.lesson_due).toBe(true);
    expect(coaching.reason).toContain("paced by the rate limit alone");
    // The resource carries the same gate as the tool.
    const res: any = await desktop.client.readResource({ uri: "devcoach://briefing" });
    expect(JSON.parse(res.contents[0].text).coaching).toEqual(coaching);
    await desktop.close();
  });

  it("never carries a lesson_due for a hook-driven client, whatever the rate limit says", async () => {
    for (const name of HOOK_CLIENTS) {
      const other = await connect(name);
      const briefing: any = await other.client.callTool({ name: "get_briefing", arguments: {} });
      expect(briefing.structuredContent.rate_limit.allowed).toBe(true);
      expect(briefing.structuredContent.coaching).toEqual({
        driver: "hooks",
        client: { name, version: "0.1.0" },
        reason: `${name} is hook-driven: this field gates nothing — a hook cue, the coaching skill or the user decides`,
      });
      await other.close();
    }
  });

  it("closes after a lesson: the 4-hour gap, then the daily limit", async () => {
    const desktop = await connect("claude-ai");
    await desktop.client.callTool({ name: "log_lesson", arguments: lesson("d1") });
    const briefing: any = await desktop.client.callTool({ name: "get_briefing", arguments: {} });
    expect(briefing.structuredContent.rate_limit.allowed).toBe(false);
    expect(briefing.structuredContent.coaching.lesson_due).toBe(false);
    expect(briefing.structuredContent.coaching.reason).toMatch(
      /^Too soon: last lesson \d+m ago, minimum interval is 4h 0m/,
    );
    expect(briefing.structuredContent.coaching.reason).toBe(
      briefing.structuredContent.rate_limit.reason,
    );

    await desktop.client.callTool({
      name: "update_settings",
      arguments: { key: "min_gap_minutes", value: "0" },
    });
    await desktop.client.callTool({
      name: "update_settings",
      arguments: { key: "max_per_day", value: "1" },
    });
    expect((await desktop.coaching()).reason).toMatch(/^Daily limit reached \(1\/1/);
    await desktop.client.callTool({
      name: "update_settings",
      arguments: { key: "max_per_day", value: "5" },
    });
    expect((await desktop.coaching()).lesson_due).toBe(true);
    await desktop.close();
  });

  it("pauses while a course is in progress, as the hooks do", async () => {
    const desktop = await connect("claude-ai");
    const created: any = await desktop.client.callTool({
      name: "create_course",
      arguments: { title: "Sockets from scratch", topic_id: "python" },
    });
    expect(await desktop.coaching()).toMatchObject({
      lesson_due: false,
      reason: "a course is in progress: lessons pause until it is completed or abandoned",
    });
    await desktop.client.callTool({
      name: "update_course_progress",
      arguments: { course_id: created.structuredContent.id, status: "abandoned" },
    });
    expect((await desktop.coaching()).lesson_due).toBe(true);
    await desktop.close();
  });

  it("stays closed on a database a newer devcoach upgraded (log_lesson could not save)", async () => {
    const desktop = await connect("claude-ai");
    const raw = db.getConnection(db.DB_PATH);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    try {
      expect(await desktop.coaching()).toMatchObject({
        lesson_due: false,
        reason: "read-only database: a lesson could not be saved",
      });
    } finally {
      const back = db.getConnection(db.DB_PATH);
      back.exec(`PRAGMA user_version = ${db.SCHEMA_VERSION}`);
      back.close();
      await desktop.close();
    }
  });
});
