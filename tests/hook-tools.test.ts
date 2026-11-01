// The hook tools (hook_stop / hook_prompt) through the in-memory MCP client, exactly as Claude
// Code's `mcp_tool` hook entries call them: string-substituted arguments in, ONE text block out
// that parses as the hook JSON (`{}` = silent). Runs against the per-file sandbox HOME.
import { mkdirSync, rmSync } from "node:fs";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as db from "../src/core/db";
import {
  buildLessonCue,
  buildPromptPrime,
  CUE_SYSTEM_MESSAGE,
  ONBOARD_CUE,
  parseHookInput,
} from "../src/core/hook-decision";
import { createServer, HOOK_TOOLS_ENV } from "../src/mcp/server";

async function connect() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  await server.connect(st);
  const client = new Client({ name: "claude-code", version: "2.1.0" });
  await client.connect(ct);
  return { client, server };
}

/** The arguments as an mcp_tool entry substitutes them: every value a string. */
const args = (over: Record<string, unknown> = {}) => ({
  session_id: "s1",
  stop_hook_active: "false",
  permission_mode: "default",
  ...over,
});

/** The ONE JSON object Claude Code reads from the tool's text content. */
const directive = (r: any): Record<string, unknown> => {
  expect(r.isError).toBeFalsy();
  expect(r.content).toHaveLength(1);
  expect(r.content[0].type).toBe("text");
  return JSON.parse(r.content[0].text);
};

const seedProfile = (nudgeEvery = 0): void =>
  db.withConnection((c) => {
    db.upsertKnowledge(c, "typescript", 5);
    db.setSetting(c, "nudge_every", String(nudgeEvery));
    db.setSetting(c, "min_gap_minutes", "0");
    db.setSetting(c, "max_per_day", "99");
  });

describe("hook tools are opt-in", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("are absent without DEVCOACH_HOOK_TOOLS and present, internal-looking, with it", async () => {
    vi.stubEnv(HOOK_TOOLS_ENV, "");
    const bare = await connect();
    const bareNames = (await bare.client.listTools()).tools.map((t) => t.name);
    expect(bareNames).toHaveLength(25);
    expect(bareNames).not.toContain("hook_stop");
    expect(bareNames).not.toContain("hook_prompt");
    await bare.client.close();
    await bare.server.close();

    vi.stubEnv(HOOK_TOOLS_ENV, "1");
    const plugin = await connect();
    const tools = (await plugin.client.listTools()).tools;
    expect(tools).toHaveLength(27);
    for (const name of ["hook_stop", "hook_prompt"]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(tool!.title).toMatch(/^Internal: /);
      expect(tool!.description).toContain("Never call it yourself");
      expect(tool!.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: false });
      // The three inputs the plugin's hooks.json maps, none required.
      const schema = tool!.inputSchema as { properties?: object; required?: string[] };
      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([
        "permission_mode",
        "session_id",
        "stop_hook_active",
      ]);
      expect(schema.required ?? []).toEqual([]);
    }
    await plugin.client.close();
    await plugin.server.close();
  });
});

describe("parseHookInput — what an mcp_tool entry hands over", () => {
  it("reads the substituted strings, and treats blanks and unfilled placeholders as absent", () => {
    expect(parseHookInput(args())).toEqual({
      stop_hook_active: false,
      permission_mode: "default",
      session_id: "s1",
    });
    expect(parseHookInput({ stop_hook_active: "true", permission_mode: "plan" })).toMatchObject({
      stop_hook_active: true,
      permission_mode: "plan",
      session_id: null,
    });
    expect(parseHookInput({ stop_hook_active: true })).toMatchObject({ stop_hook_active: true });
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal placeholder Claude Code could leave
    const raw = { session_id: "${session_id}", stop_hook_active: "", permission_mode: " " };
    expect(parseHookInput(raw)).toEqual({
      stop_hook_active: false,
      permission_mode: null,
      session_id: null,
    });
    expect(parseHookInput(null)).toEqual({
      stop_hook_active: false,
      permission_mode: null,
      session_id: null,
    });
  });
});

describe("hook_stop", () => {
  beforeEach(() => {
    vi.stubEnv(HOOK_TOOLS_ENV, "1");
    rmSync(db.DB_PATH, { recursive: true, force: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("cues onboarding when there is no database yet — without creating one", async () => {
    const { client, server } = await connect();
    const out = directive(await client.callTool({ name: "hook_stop", arguments: args() }));
    expect(out).toEqual({ decision: "block", reason: ONBOARD_CUE });
    expect(out.reason).toContain("complete_onboarding");
    expect(db.peekSchema().exists).toBe(false);
    await client.close();
    await server.close();
  });

  it("stays silent on a hook-forced continuation and in plan mode, with or without a database", async () => {
    const { client, server } = await connect();
    const silent = async (a: Record<string, unknown>) =>
      expect(directive(await client.callTool({ name: "hook_stop", arguments: a }))).toEqual({});
    await silent(args({ stop_hook_active: "true" }));
    await silent(args({ permission_mode: "plan" }));
    seedProfile();
    await silent(args({ stop_hook_active: "true" }));
    await silent(args({ permission_mode: "plan" }));
    await client.close();
    await server.close();
  });

  it("with a database but no profile, the onboarding cue is the block JSON Claude Code expects", async () => {
    db.withConnection((c) => c.exec("DELETE FROM knowledge")); // creates the DB, no profile
    const { client, server } = await connect();
    const out = directive(await client.callTool({ name: "hook_stop", arguments: args() }));
    expect(Object.keys(out).sort()).toEqual(["decision", "reason"]);
    expect(out.decision).toBe("block");
    expect(out.reason).toBe(ONBOARD_CUE);
    await client.close();
    await server.close();
  });

  it("cues a lesson when the pacing threshold is reached, with the tuned cue text", async () => {
    seedProfile(2);
    const { client, server } = await connect();
    const stop = async () =>
      directive(await client.callTool({ name: "hook_stop", arguments: args() }));
    expect(await stop()).toEqual({}); // 1/2
    const cue = await stop(); // 2/2
    expect(Object.keys(cue).sort()).toEqual(["decision", "reason", "systemMessage"]);
    expect(cue.decision).toBe("block");
    expect(cue.systemMessage).toBe(CUE_SYSTEM_MESSAGE);
    expect(cue.systemMessage).toContain("checking whether a lesson is due");
    // Byte for byte the command-hook cue: pure delegation to the skill, no duplicated rules.
    expect(cue.reason).toBe(buildLessonCue(1));
    expect(cue.reason).toContain("Invoke the `devcoach` skill (Skill tool) NOW");
    expect(cue.reason).toContain("skip_lesson");
    expect(cue.reason).toContain("single source of truth");
    expect(cue.reason).not.toContain("output NOTHING else");
    expect(cue.reason).toContain("next checkpoint at lesson #10");
    // The cue armed the retry window; the stop after it is paced again.
    expect(db.withConnection((c) => db.getCueState(c).pending)).toBe(true);
    await client.close();
    await server.close();
  });

  it("carries the notebook-checkpoint count: lesson #10 is a checkpoint", async () => {
    seedProfile(0);
    const { client, server } = await connect();
    for (let i = 1; i <= 9; i++) {
      const r: any = await client.callTool({
        name: "log_lesson",
        arguments: {
          id: `l${i}`,
          topic_id: "typescript",
          categories: ["typescript"],
          title: `Lesson ${i}`,
          level: "mid",
          summary: "s",
          body: "b",
        },
      });
      expect(r.isError).toBeFalsy();
    }
    const cue = directive(await client.callTool({ name: "hook_stop", arguments: args() }));
    expect(cue.reason).toBe(buildLessonCue(10));
    expect(cue.reason).toContain("This is lesson #10 — a notebook checkpoint");
    expect(cue.reason).toContain('"(updated after 10 lessons)"');
    await client.close();
    await server.close();
  });

  it("pauses while a course is active and resumes once it is over", async () => {
    seedProfile(0);
    db.withConnection((c) =>
      db.insertCourse(c, {
        id: "paused",
        lesson_id: null,
        topic_id: "typescript",
        title: "Paused",
        goal: null,
        prerequisites: [],
        status: "active",
        created_at: "2026-09-19T10:00:00Z",
        updated_at: "2026-09-19T10:00:00Z",
        completed_at: null,
      }),
    );
    const { client, server } = await connect();
    expect(directive(await client.callTool({ name: "hook_stop", arguments: args() }))).toEqual({});
    expect(directive(await client.callTool({ name: "hook_prompt", arguments: args() }))).toEqual(
      {},
    );
    db.withConnection((c) =>
      db.updateCourseStatus(c, "paused", "abandoned", "2026-09-19T11:00:00Z"),
    );
    expect(
      directive(await client.callTool({ name: "hook_stop", arguments: args() })).decision,
    ).toBe("block");
    await client.close();
    await server.close();
  });

  it("a database newer than this build never breaks a hook: silent, stamp untouched", async () => {
    seedProfile(0);
    const raw = db.getConnection(db.DB_PATH);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    const { client, server } = await connect();
    expect(directive(await client.callTool({ name: "hook_stop", arguments: args() }))).toEqual({});
    expect(directive(await client.callTool({ name: "hook_prompt", arguments: args() }))).toEqual(
      {},
    );
    const check = db.getConnection(db.DB_PATH);
    expect(
      (check.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    ).toBe(99);
    check.close();
    await client.close();
    await server.close();
  });

  it("a broken database never breaks a hook: silent, never isError", async () => {
    mkdirSync(db.DB_PATH, { recursive: true }); // a directory at DB_PATH → opening the DB throws
    const { client, server } = await connect();
    const stop: any = await client.callTool({ name: "hook_stop", arguments: args() });
    expect(stop.isError).toBeFalsy();
    expect(JSON.parse(stop.content[0].text)).toEqual({});
    const prompt: any = await client.callTool({ name: "hook_prompt", arguments: args() });
    expect(prompt.isError).toBeFalsy();
    expect(JSON.parse(prompt.content[0].text)).toEqual({});
    await client.close();
    await server.close();
  });

  it("answers with no arguments at all, as a hook whose fields went unfilled would call it", async () => {
    const { client, server } = await connect();
    expect(directive(await client.callTool({ name: "hook_stop", arguments: {} }))).toMatchObject({
      decision: "block",
    });
    await client.close();
    await server.close();
  });
});

describe("hook_prompt", () => {
  beforeEach(() => {
    vi.stubEnv(HOOK_TOOLS_ENV, "1");
    rmSync(db.DB_PATH, { recursive: true, force: true });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("primes only when the stop at the end of this turn reaches the threshold", async () => {
    seedProfile(2);
    const { client, server } = await connect();
    const prompt = async () =>
      directive(await client.callTool({ name: "hook_prompt", arguments: args() }));
    expect(await prompt()).toEqual({}); // the next stop would be 1/2
    expect(db.withConnection((c) => db.peekNudge(c, "s1", "session"))).toBe(0); // never bumps
    directive(await client.callTool({ name: "hook_stop", arguments: args() })); // 1/2
    const primed = await prompt(); // the next stop is 2/2
    expect(primed).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: buildPromptPrime(),
      },
    });
    expect((primed.hookSpecificOutput as any).additionalContext).toContain(
      "invoke the `devcoach` skill (Skill tool)",
    );
    await client.close();
    await server.close();
  });

  it("is silent without a database, in plan mode, and before onboarding", async () => {
    const { client, server } = await connect();
    expect(directive(await client.callTool({ name: "hook_prompt", arguments: args() }))).toEqual(
      {},
    );
    db.withConnection((c) => c.exec("DELETE FROM knowledge"));
    expect(directive(await client.callTool({ name: "hook_prompt", arguments: args() }))).toEqual(
      {},
    );
    seedProfile(0);
    expect(
      directive(
        await client.callTool({
          name: "hook_prompt",
          arguments: args({ permission_mode: "plan" }),
        }),
      ),
    ).toEqual({});
    await client.close();
    await server.close();
  });
});
