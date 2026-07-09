// Claude Code hooks (stop-hook, prompt-hook, and the legacy onboard-hook/lesson-ready).
// Kept in a module of their own — hooks run on EVERY agent stop, so src/bin.ts loads
// this lean chunk (node built-ins + core only) instead of the full CLI bundle
// (Commander/zod/MCP SDK/Hono). Keep it dependency-free beyond core/.
import {
  appendFileSync,
  existsSync,
  fstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import * as coach from "../core/coach";
import * as db from "../core/db";

/**
 * Claude Code passes the hook payload as JSON on stdin. We use four fields:
 * `stop_hook_active` (true when this stop is itself a hook-forced continuation —
 * re-blocking then would loop forever), `permission_mode` (`"plan"` while the user
 * is planning, when the model cannot deliver or save a lesson), `session_id`, and
 * `last_assistant_message` (the final reply text — used to verify the lesson card is
 * actually visible). Empty/garbage input is treated as a fresh, non-plan stop.
 */
export interface HookPayload {
  stop_hook_active: boolean;
  permission_mode: string | null;
  session_id: string | null;
  last_assistant_message: string | null;
}

export function parseHookPayload(raw: string): HookPayload {
  try {
    const p = JSON.parse(raw);
    return {
      stop_hook_active: p?.stop_hook_active === true,
      permission_mode: typeof p?.permission_mode === "string" ? p.permission_mode : null,
      session_id: typeof p?.session_id === "string" ? p.session_id : null,
      last_assistant_message:
        typeof p?.last_assistant_message === "string" ? p.last_assistant_message : null,
    };
  } catch {
    return {
      stop_hook_active: false,
      permission_mode: null,
      session_id: null,
      last_assistant_message: null,
    };
  }
}

/**
 * Read the hook payload from stdin, but only when it is actually piped (Claude
 * Code delivers it over a SOCKET; a FIFO or a redirected file carry it too). Skip a
 * TTY/character device, where a blocking read would hang an interactive run or a test.
 */
function readHookPayload(): HookPayload {
  const empty: HookPayload = {
    stop_hook_active: false,
    permission_mode: null,
    session_id: null,
    last_assistant_message: null,
  };
  try {
    const st = fstatSync(0);
    if (!st.isFIFO() && !st.isFile() && !st.isSocket()) return empty;
    return parseHookPayload(readFileSync(0, "utf8"));
  } catch {
    return empty;
  }
}

/** A Stop hook stays silent on a hook-forced continuation, or while in plan mode. */
function shouldSuppressHook(p: HookPayload): boolean {
  return p.stop_hook_active || p.permission_mode === "plan";
}

/**
 * Opt-in hook trace (DEVCOACH_HOOK_DEBUG=1): one line per hook decision appended to
 * ~/.devcoach/hook.log, truncated past 256 KB. Never throws — observability must not
 * break a hook.
 */
function hookDebugLog(hook: string, sessionId: string | null, msg: string): void {
  if (process.env.DEVCOACH_HOOK_DEBUG !== "1") return;
  try {
    mkdirSync(db.DEVCOACH_DIR, { recursive: true });
    const file = join(db.DEVCOACH_DIR, "hook.log");
    if (existsSync(file) && statSync(file).size > 256 * 1024) writeFileSync(file, "");
    appendFileSync(
      file,
      `${new Date().toISOString()} ${hook} ${(sessionId ?? "-").slice(0, 8)} ${msg}\n`,
    );
  } catch {
    // best-effort only
  }
}

/**
 * Block the stop: Claude Code reads `{decision:"block", reason}` from stdout (exit 0),
 * blocks the stop, and feeds `reason` to the model as the reason it must keep working.
 * Current Claude Code shows a generic "Stop hook error occurred" notice on ANY blocking
 * Stop hook (verified empirically — even a minimal spec-perfect block), so blocks are
 * kept rare by design: the UserPromptSubmit priming is the primary delivery channel and
 * the block is the fallback. The `systemMessage` line tells the user what the notice is
 * about ("🎓 devcoach: preparing a lesson…").
 */
function emitBlock(reason: string, systemMessage?: string): never {
  const out: Record<string, string> = { decision: "block", reason };
  if (systemMessage) out.systemMessage = systemMessage;
  process.stdout.write(`${JSON.stringify(out)}\n`);
  process.exit(0);
}

// No DB yet → onboarding has not run. Cue WITHOUT creating coaching.db or any
// marker file, so an interrupted onboarding leaves nothing behind and re-cues on
// the next task. The artifacts appear only when complete_onboarding actually runs.
const ONBOARD_CUE =
  "devcoach: the user has no coaching profile yet. Ask them how they want to set it up — " +
  "Automatic (detect this project's tech stack), Guided (a short conversation to map topics " +
  "and confidence levels), or Import (restore from a backup) — and do not pick for them. " +
  "After they choose, build the profile and save it by calling the devcoach " +
  "`complete_onboarding` MCP tool (not a shell command) before ending your turn.";

export function cmdOnboardHook(payload: HookPayload = readHookPayload()): void {
  if (shouldSuppressHook(payload)) process.exit(0);
  if (existsSync(db.DB_PATH)) {
    let ready: boolean;
    try {
      ready = db.withConnection((conn) => db.isOnboardingComplete(conn).knowledge_ready);
    } catch (err) {
      hookDebugLog("onboard-hook", payload.session_id, `error: ${err}`);
      process.exit(0);
    }
    if (ready) process.exit(0);
  }
  hookDebugLog("onboard-hook", payload.session_id, "onboarding cue");
  emitBlock(ONBOARD_CUE);
}

// The notebook's observations are refreshed only every Nth delivered lesson, not after
// each one. The hook owns the count (the DB is the source of truth) so the model never
// has to count.
const NOTEBOOK_UPDATE_EVERY = 10;

/**
 * The cue is deliberately compact: the devcoach *skill* is the single source of truth
 * for the full coaching flow — the cue makes the model load it deterministically via
 * the Skill tool instead of duplicating it here. A 5-line fallback keeps the cue
 * self-contained when the skill is not installed.
 */
export function buildLessonCue(nextLessonNumber: number): string {
  const updateDue = nextLessonNumber % NOTEBOOK_UPDATE_EVERY === 0;
  const nextCheckpoint =
    Math.ceil(nextLessonNumber / NOTEBOOK_UPDATE_EVERY) * NOTEBOOK_UPDATE_EVERY;
  const notebookStep = updateDue
    ? `This is lesson #${nextLessonNumber} — a notebook checkpoint (every ${NOTEBOOK_UPDATE_EVERY} ` +
      "lessons): after log_lesson returns the feedback, also call update_notebook with the " +
      `revised notebook markdown and record "(updated after ${nextLessonNumber} lessons)".`
    : "Do NOT call update_notebook this time — the notebook is refreshed only every " +
      `${NOTEBOOK_UPDATE_EVERY} lessons (next checkpoint at lesson #${nextCheckpoint}).`;

  return (
    "devcoach: a lesson is due for the technical work just completed. Do it now — do not " +
    "acknowledge this message and do not explain what you are about to do.\n\n" +
    "Invoke the `devcoach` skill (Skill tool) NOW and follow it to deliver ONE lesson. " +
    "Three hard rules:\n" +
    "- The lesson card MUST be printed as your visible reply BEFORE calling log_lesson.\n" +
    "- After log_lesson returns, output NOTHING else — the card is the end of the reply.\n" +
    "- If the work just completed does not warrant a lesson (pure questions, chat, nothing " +
    "technical), call the devcoach `skip_lesson` tool with a one-line reason and output " +
    "nothing.\n" +
    `${notebookStep}\n\n` +
    "If the devcoach skill is not available, fall back to: read devcoach://profile, " +
    "devcoach://taught-topics, and devcoach://notebook; pick ONE untaught profile topic at or " +
    "above the user's confidence band; write the card as plain markdown (no '>' blockquote) " +
    "between two band headings `### ──────── 🎓 devcoach ────────` and " +
    "`### ──────── [topic] · [level] ────────`, with `**[Title]** · [Category] · [Level]`, " +
    "3–6 short paragraphs tied to the task, and a `💡 *Senior tip:*` line; THEN call " +
    "log_lesson (body = clean markdown without bands or the title line).\n\n" +
    "The rate-limit check is already done by this hook — skip it. Output only the lesson card " +
    "(or nothing). No preamble, no meta-commentary."
  );
}

const CARD_RECOVERY_CUE =
  "devcoach: the lesson was saved with log_lesson but its card is NOT visible in your " +
  "reply. Print the lesson card now, verbatim, exactly as echoed by the log_lesson " +
  "result (the block between the two `### ──────── 🎓 devcoach ────────` band " +
  "headings) — as your ENTIRE reply, no other text, no tool calls.";

type StopDecision =
  | { kind: "silent"; note: string }
  | { kind: "onboard"; note: string }
  | { kind: "recover-card"; note: string }
  | { kind: "cue"; nextLessonNumber: number; note: string };

/**
 * The whole per-stop decision on ONE connection inside ONE IMMEDIATE transaction:
 * a single lock/journal cycle, and atomic against a concurrent stop (two sessions
 * can never both cue from the same counter state).
 *
 * Order: card recovery (a block-delivered lesson ends on a stop_hook_active stop —
 * that is where its reply text is inspectable) → forced-continuation suppression →
 * onboarding → cue engine.
 */
function decideStop(
  conn: DatabaseSync,
  payload: HookPayload,
  opts: { onboardCue: boolean },
): StopDecision {
  const plan = payload.permission_mode === "plan";
  if (
    !plan &&
    db.takeDisplayPending(conn) &&
    payload.last_assistant_message !== null && // older Claude Code — no signal
    !payload.last_assistant_message.includes("🎓 devcoach")
  ) {
    return { kind: "recover-card", note: "card missing from reply — recovering" };
  }
  if (payload.stop_hook_active) return { kind: "silent", note: "hook-forced continuation" };
  if (!db.isOnboardingComplete(conn).knowledge_ready) {
    if (!opts.onboardCue || plan) return { kind: "silent", note: "onboarding not complete" };
    return { kind: "onboard", note: "onboarding cue (empty knowledge)" };
  }
  const d = coach.evaluateCue(conn, payload.session_id, { planMode: plan });
  return d.cue
    ? { kind: "cue", nextLessonNumber: d.nextLessonNumber, note: d.reason }
    : { kind: "silent", note: d.reason };
}

function runStopDecision(
  hookName: string,
  payload: HookPayload,
  opts: { onboardCue: boolean },
): never {
  let decision: StopDecision;
  try {
    decision = db.withConnection((conn) =>
      db.withTransaction(conn, () => decideStop(conn, payload, opts)),
    );
  } catch (err) {
    hookDebugLog(hookName, payload.session_id, `error: ${err}`);
    process.exit(0);
  }
  hookDebugLog(hookName, payload.session_id, decision.note);
  switch (decision.kind) {
    case "onboard":
      emitBlock(ONBOARD_CUE);
      break;
    case "recover-card":
      emitBlock(CARD_RECOVERY_CUE, "🎓 devcoach: recovering the lesson card…");
      break;
    case "cue":
      emitBlock(buildLessonCue(decision.nextLessonNumber), "🎓 devcoach: preparing a lesson…");
      break;
    default:
      break;
  }
  process.exit(0);
}

export function cmdLessonReady(payload: HookPayload = readHookPayload()): void {
  // No DB → no profile yet. Stay silent without creating coaching.db.
  if (!existsSync(db.DB_PATH)) process.exit(0);
  runStopDecision("lesson-ready", payload, { onboardCue: false });
}

/**
 * Merged Stop hook (one process spawn per stop): onboarding check first, then the
 * lesson-cue pipeline. `onboard-hook` + `lesson-ready` remain for already-installed
 * hooks; new installs wire only `stop-hook`.
 */
export function cmdStopHook(payload: HookPayload = readHookPayload()): void {
  if (!existsSync(db.DB_PATH)) {
    if (payload.stop_hook_active || payload.permission_mode === "plan") process.exit(0);
    hookDebugLog("stop-hook", payload.session_id, "onboarding cue (no DB)");
    emitBlock(ONBOARD_CUE);
  }
  runStopDecision("stop-hook", payload, { onboardCue: true });
}

const PROMPT_PRIME =
  "devcoach: the lesson pacing threshold will be reached at the end of this turn. Resolve " +
  "it before finishing:\n" +
  "- If this task is technical: invoke the `devcoach` skill (Skill tool), then end your " +
  "reply with ONE lesson card (the `### ──────── 🎓 devcoach ────────` block) followed by " +
  "a log_lesson call. The card must be the LAST visible text — after log_lesson returns, " +
  "output nothing else.\n" +
  "- If it is not technical: silently call the devcoach `skip_lesson` tool with a one-line " +
  "reason and output nothing about it.";

/**
 * UserPromptSubmit hook: read-only peek (never bumps — the Stop hook owns the counter).
 * When this turn's stop would reach the pacing threshold, prime the model up front via
 * invisible additionalContext so the lesson lands at the natural end of the reply; the
 * Stop hook stays as enforcement if it doesn't.
 */
export function cmdPromptHook(payload: HookPayload = readHookPayload()): void {
  if (payload.permission_mode === "plan") process.exit(0);
  if (!existsSync(db.DB_PATH)) process.exit(0);
  let wouldCue: boolean;
  try {
    wouldCue = db.withConnection((conn) => coach.explainCue(conn, payload.session_id).wouldCue);
  } catch (err) {
    hookDebugLog("prompt-hook", payload.session_id, `error: ${err}`);
    process.exit(0);
  }
  hookDebugLog("prompt-hook", payload.session_id, wouldCue ? "priming" : "no prime");
  if (!wouldCue) process.exit(0);
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: PROMPT_PRIME },
    })}\n`,
  );
  process.exit(0);
}

/** Argv dispatcher for src/bin.ts's lean hook path. */
export function runHook(cmd: string): void {
  switch (cmd) {
    case "stop-hook":
      cmdStopHook();
      break;
    case "prompt-hook":
      cmdPromptHook();
      break;
    case "onboard-hook":
      cmdOnboardHook();
      break;
    case "lesson-ready":
      cmdLessonReady();
      break;
    default:
      process.exit(0);
  }
}
