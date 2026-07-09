// In-process hook tests: call the exported hook entrypoints directly (payload injected,
// process.exit/stdout spied). The spawn suite (hooks-spawn.test.ts) already exercises the
// same paths end-to-end in child processes, but v8 coverage cannot see child processes —
// this file makes the hook module's branches count. Runs against the per-file sandbox HOME.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cmdOnboardHook,
  cmdPromptHook,
  cmdStopHook,
  type HookPayload,
  runHook,
} from "../src/cli/hooks";
import * as db from "../src/core/db";

const payload = (over: Partial<HookPayload> = {}): HookPayload => ({
  stop_hook_active: false,
  permission_mode: "default",
  session_id: "s1",
  last_assistant_message: null,
  ...over,
});

/** Run a hook function capturing stdout + the exit code (hooks always end in process.exit). */
function capture(fn: () => void): { out: string; code: number | null } {
  const lines: string[] = [];
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((s: any) => {
    lines.push(String(s));
    return true;
  });
  let code: number | null = null;
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    code = c ?? 0;
    throw new Error("__exit__");
  }) as never);
  try {
    fn();
  } catch (e) {
    if ((e as Error).message !== "__exit__") throw e;
  } finally {
    outSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { out: lines.join(""), code };
}

const seedProfile = (): void =>
  db.withConnection((c) => {
    db.upsertKnowledge(c, "typescript", 5);
    db.setSetting(c, "nudge_every", "0");
    db.setSetting(c, "min_gap_minutes", "0");
    db.setSetting(c, "max_per_day", "99");
  });

describe("hooks in-process (runHook dispatcher + payload-injected entrypoints)", () => {
  it("runHook dispatches every hook; unknown commands exit 0 silently", () => {
    // No DB yet: stop-hook and onboard-hook cue onboarding, the others stay silent.
    expect(capture(() => runHook("stop-hook")).out).toContain("complete_onboarding");
    expect(capture(() => runHook("onboard-hook")).out).toContain("complete_onboarding");
    expect(capture(() => runHook("prompt-hook"))).toEqual({ out: "", code: 0 });
    expect(capture(() => runHook("lesson-ready"))).toEqual({ out: "", code: 0 });
    expect(capture(() => runHook("frobnicate"))).toEqual({ out: "", code: 0 });
  });

  it("stop-hook without a DB is silent on forced continuations and in plan mode", () => {
    expect(capture(() => cmdStopHook(payload({ stop_hook_active: true })))).toEqual({
      out: "",
      code: 0,
    });
    expect(capture(() => cmdStopHook(payload({ permission_mode: "plan" })))).toEqual({
      out: "",
      code: 0,
    });
  });

  it("stop-hook with a DB but empty knowledge emits the onboarding cue", () => {
    db.withConnection((c) => c.exec("DELETE FROM knowledge")); // creates the DB, no profile
    const r = capture(() => cmdStopHook(payload()));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).decision).toBe("block");
    expect(JSON.parse(r.out).reason).toContain("complete_onboarding");
  });

  it("card recovery trusts the whole turn (transcript), not just the final message", () => {
    seedProfile();
    const home = process.env.HOME as string;
    const entry = (o: object): string => JSON.stringify(o);
    // The live false positive: card printed mid-turn, then checkpoint work, then a
    // closing line — the FINAL assistant message has no band, but the card WAS visible.
    const cardMidTurn = join(home, "card-mid-turn.jsonl");
    writeFileSync(
      cardMidTurn,
      [
        entry({ type: "user", message: { content: "do the task" } }),
        entry({
          type: "assistant",
          message: {
            content: [{ type: "text", text: "work…\n### ──────── 🎓 devcoach ────────\nbody" }],
          },
        }),
        entry({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
        entry({
          type: "assistant",
          message: { content: [{ type: "text", text: "The lesson has been logged." }] },
        }),
      ].join("\n"),
    );
    db.withConnection((c) => db.markDisplayPending(c));
    const falsePositive = capture(() =>
      cmdStopHook(
        payload({
          stop_hook_active: true,
          last_assistant_message: "The lesson has been logged.",
          transcript_path: cardMidTurn,
        }),
      ),
    );
    expect(falsePositive).toEqual({ out: "", code: 0 }); // card found in the turn → silent

    // Genuinely missing: no band anywhere in the turn → recover.
    const noCard = join(home, "no-card.jsonl");
    writeFileSync(
      noCard,
      [
        entry({ type: "user", message: { content: "do the task" } }),
        entry({ type: "assistant", message: { content: [{ type: "text", text: "done." }] } }),
      ].join("\n"),
    );
    db.withConnection((c) => db.markDisplayPending(c));
    const rec = capture(() =>
      cmdStopHook(
        payload({
          stop_hook_active: true,
          last_assistant_message: "Lesson logged.",
          transcript_path: noCard,
        }),
      ),
    );
    expect(JSON.parse(rec.out).reason).toContain("NOT visible");
    expect(JSON.parse(rec.out).systemMessage).toContain("recovering");

    // No transcript and no band in the final message → no reliable signal → never
    // recover blindly (the flag is still consumed).
    db.withConnection((c) => db.markDisplayPending(c));
    expect(
      capture(() =>
        cmdStopHook(payload({ stop_hook_active: true, last_assistant_message: "Lesson logged." })),
      ),
    ).toEqual({ out: "", code: 0 });

    // Flag consumed → a normal eligible stop now cues the lesson (nudge_every=0).
    const cue = capture(() => cmdStopHook(payload()));
    expect(JSON.parse(cue.out).decision).toBe("block");
    expect(JSON.parse(cue.out).reason).toContain("skip_lesson");
  });

  it("a broken DB never breaks a hook: every entrypoint exits 0 silently", () => {
    rmSync(db.DB_PATH, { force: true });
    mkdirSync(db.DB_PATH); // a directory at DB_PATH → opening the DB throws
    try {
      expect(capture(() => cmdStopHook(payload()))).toEqual({ out: "", code: 0 });
      expect(capture(() => cmdPromptHook(payload()))).toEqual({ out: "", code: 0 });
      expect(capture(() => cmdOnboardHook(payload()))).toEqual({ out: "", code: 0 });
    } finally {
      rmSync(db.DB_PATH, { recursive: true, force: true });
    }
  });
});
