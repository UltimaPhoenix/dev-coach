// Real-process hook tests: spawn src/bin.ts with the Stop-hook payload PIPED on stdin,
// exercising the fd0 transport (readHookPayload's FIFO/file/socket detection) that the
// in-process CLI tests bypass. Each test gets its own sandbox HOME.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "bin.ts")];

const freshHome = (): string => mkdtempSync(join(tmpdir(), "dc-spawn-"));
const dbPathOf = (home: string): string => join(home, ".devcoach", "coaching.db");

/** Run a hook subcommand as a real child process with the payload piped on stdin. */
function hook(cmd: string, home: string, payload: object | string): string {
  return execFileSync(process.execPath, [...BIN, cmd], {
    cwd: root,
    encoding: "utf8",
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env: { ...process.env, HOME: home, NO_COLOR: "1" },
  });
}

function seedProfile(home: string, nudgeEvery: number): void {
  db.withConnection((c) => {
    db.upsertKnowledge(c, "typescript", 5);
    db.setSetting(c, "nudge_every", String(nudgeEvery));
    db.setSetting(c, "min_gap_minutes", "0");
    db.setSetting(c, "max_per_day", "99");
  }, dbPathOf(home));
}

const interactions = (home: string, session: string): number =>
  db.withConnection((c) => db.peekNudge(c, session, "session"), dbPathOf(home));

describe("hooks via real child processes (piped stdin)", () => {
  it("lesson-ready without a DB is silent and does not create one", () => {
    const home = freshHome();
    const out = hook("lesson-ready", home, { session_id: "s1" });
    expect(out).toBe("");
    expect(existsSync(dbPathOf(home))).toBe(false);
  });

  it("onboard-hook and stop-hook cue onboarding on a fresh HOME", () => {
    const home = freshHome();
    for (const cmd of ["onboard-hook", "stop-hook"]) {
      const out = hook(cmd, home, { session_id: "s1", permission_mode: "default" });
      const parsed = JSON.parse(out);
      expect(parsed.decision).toBe("block");
      expect(parsed.reason).toContain("complete_onboarding");
      expect(existsSync(dbPathOf(home))).toBe(false); // cue never creates artifacts
    }
  });

  it("paces, cues with skill directive + systemMessage, resets on emission, retries at 3", () => {
    const home = freshHome();
    seedProfile(home, 5);
    const payload = { session_id: "s1", permission_mode: "default" };

    // 4 eligible stops → silent; 5th reaches the threshold → cue.
    for (let i = 1; i <= 4; i++) expect(hook("stop-hook", home, payload)).toBe("");
    const cue = JSON.parse(hook("stop-hook", home, payload));
    expect(cue.decision).toBe("block");
    expect(cue.reason).toContain("devcoach` skill");
    expect(cue.reason).toContain("skip_lesson");
    expect(cue.systemMessage).toContain("devcoach");

    // Reset-on-emission: the stop right after a cue is silent again (no cue storm)…
    expect(hook("stop-hook", home, payload)).toBe("");
    // …but the unresolved cue arms the retry threshold (3): third stop re-cues.
    expect(hook("stop-hook", home, payload)).toBe("");
    expect(JSON.parse(hook("stop-hook", home, payload)).decision).toBe("block");

    // log_lesson equivalent (resetNudge) disarms the retry → full threshold again.
    db.withConnection((c) => db.resetNudge(c), dbPathOf(home));
    expect(hook("stop-hook", home, payload)).toBe("");
    expect(hook("stop-hook", home, payload)).toBe("");
    expect(interactions(home, "s1")).toBe(2);
  }, 60_000);

  it("stop_hook_active and plan-mode stops are silent and never count", () => {
    const home = freshHome();
    seedProfile(home, 5);
    expect(hook("stop-hook", home, { session_id: "s1", stop_hook_active: true })).toBe("");
    expect(interactions(home, "s1")).toBe(0);
    expect(hook("stop-hook", home, { session_id: "s1", permission_mode: "plan" })).toBe("");
    expect(interactions(home, "s1")).toBe(0);
  }, 30_000);

  it("garbage stdin is treated as a fresh, sessionless stop", () => {
    const home = freshHome();
    seedProfile(home, 5);
    expect(hook("stop-hook", home, "not json at all")).toBe("");
    expect(interactions(home, "__nosession__")).toBe(1);
  }, 30_000);

  it("prompt-hook peeks without bumping and primes only at the threshold", () => {
    const home = freshHome();
    seedProfile(home, 2);
    const payload = { session_id: "s1", permission_mode: "default" };

    // Counter 0, next stop would be 1/2 → no prime, and no bump either.
    expect(hook("prompt-hook", home, payload)).toBe("");
    expect(interactions(home, "s1")).toBe(0);

    // One real stop (1/2, silent) → next stop reaches 2/2 → the prompt primes.
    expect(hook("stop-hook", home, payload)).toBe("");
    const primed = JSON.parse(hook("prompt-hook", home, payload));
    expect(primed.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit");
    expect(primed.hookSpecificOutput.additionalContext).toContain("devcoach");
    expect(interactions(home, "s1")).toBe(1); // still 1 — peek only

    // Plan mode never primes.
    expect(hook("prompt-hook", home, { ...payload, permission_mode: "plan" })).toBe("");
  }, 30_000);

  it("recovers a logged-but-invisible lesson card, exactly once", () => {
    const home = freshHome();
    seedProfile(home, 99);
    // A turn whose transcript has no card anywhere (recovery must be confirmed by the
    // transcript — the final message alone is not a reliable negative).
    const transcript = join(home, "transcript.jsonl");
    writeFileSync(
      transcript,
      [
        JSON.stringify({ type: "user", message: { content: "do the task" } }),
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "done." }] },
        }),
      ].join("\n"),
    );
    // log_lesson equivalent: counters reset + display flag armed
    db.withConnection((c) => {
      db.resetNudge(c);
      db.markDisplayPending(c);
    }, dbPathOf(home));

    // Reply lacks the band (and the transcript confirms) → one recovery block, flag consumed.
    const out = JSON.parse(
      hook("stop-hook", home, {
        session_id: "s1",
        stop_hook_active: true,
        last_assistant_message: "Lesson logged.",
        transcript_path: transcript,
      }),
    );
    expect(out.decision).toBe("block");
    expect(out.reason).toContain("NOT visible");
    // Second stop: flag already consumed → silent.
    expect(
      hook("stop-hook", home, {
        session_id: "s1",
        stop_hook_active: true,
        last_assistant_message: "Lesson logged.",
        transcript_path: transcript,
      }),
    ).toBe("");

    // Card present in the reply → flag consumed silently.
    db.withConnection((c) => db.markDisplayPending(c), dbPathOf(home));
    expect(
      hook("stop-hook", home, {
        session_id: "s1",
        last_assistant_message: "…\n### ──────── 🎓 devcoach ────────\nbody\n",
      }),
    ).toBe("");

    // No last_assistant_message/transcript signal (older Claude Code) → no recovery, no error.
    db.withConnection((c) => db.markDisplayPending(c), dbPathOf(home));
    expect(hook("stop-hook", home, { session_id: "s1", stop_hook_active: true })).toBe("");
  }, 60_000);

  it("two concurrent hooks on one DB both exit 0 (busy_timeout)", async () => {
    const home = freshHome();
    seedProfile(home, 10);
    const run = (session: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [...BIN, "stop-hook"], {
          cwd: root,
          env: { ...process.env, HOME: home, NO_COLOR: "1" },
        });
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? -1));
        child.stdin.write(JSON.stringify({ session_id: session, permission_mode: "default" }));
        child.stdin.end();
      });
    const codes = await Promise.all([run("a"), run("b"), run("c")]);
    expect(codes).toEqual([0, 0, 0]);
    const total = db.withConnection(
      (c) => db.listNudgeSessions(c).reduce((sum, s) => sum + s.interactions, 0),
      dbPathOf(home),
    );
    expect(total).toBe(3); // no bump silently lost to SQLITE_BUSY
  }, 30_000);
});
