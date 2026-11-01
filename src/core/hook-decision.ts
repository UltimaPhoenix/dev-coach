// The Stop and UserPromptSubmit hook decisions, in-process. Claude Code calls the server's
// `hook_stop` / `hook_prompt` tools through `mcp_tool` hook entries (plugin/hooks/hooks.json) and
// reads the tool's text the way it reads a command hook's stdout — so each decision here returns
// the ONE JSON object the hook contract expects (`{}` = stay silent). No process, no stdout, no
// exit code: any failure is a silent `{}`, exactly as the command hooks exited 0.
//
// The cue and prime texts are tuned (see the comments on each) and must stay byte for byte as
// they were in the command-hook design.
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import * as coach from "./coach";
import * as db from "./db";

/**
 * What a hook decision needs from the event: `stop_hook_active` (true when this stop is itself
 * a hook-forced continuation — re-blocking then would loop forever), `permission_mode` (`"plan"`
 * while the user is planning, when the model cannot deliver or save a lesson) and `session_id`
 * (the pacing counter's key under `nudge_scope=session`).
 */
export interface HookPayload {
  stop_hook_active: boolean;
  permission_mode: string | null;
  session_id: string | null;
}

/**
 * The tool arguments as an `mcp_tool` hook entry delivers them: every `${path}` of its `input`
 * map is substituted from the hook's JSON input AS A STRING (`"true"` / `"false"`), and a path
 * the event does not carry may arrive empty or as the literal placeholder.
 */
export interface HookInput {
  session_id?: string | null;
  stop_hook_active?: string | boolean | null;
  permission_mode?: string | null;
}

const PLACEHOLDER = /^\$\{[^}]*\}$/;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s === "" || PLACEHOLDER.test(s) ? null : s;
}

/** Coerce the hook's (string-substituted) arguments; anything odd reads as a fresh, non-plan stop. */
export function parseHookInput(raw: HookInput | null | undefined): HookPayload {
  const active = raw?.stop_hook_active;
  return {
    stop_hook_active: active === true || text(active) === "true",
    permission_mode: text(raw?.permission_mode),
    session_id: text(raw?.session_id),
  };
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

/** What a hook tool returns: the JSON object Claude Code reads as the hook's output. */
export type HookDirective = Record<string, unknown>;

/** The silent outcome: nothing to say, the turn ends as it was going to. */
export const SILENT: HookDirective = {};

/**
 * Block the stop: Claude Code reads `{decision:"block", reason}`, blocks the stop and feeds
 * `reason` to the model as the reason it must keep working. Current Claude Code shows a
 * generic "Stop hook error occurred" notice on ANY blocking Stop hook (verified empirically —
 * even a minimal spec-perfect block), so blocks are kept rare by design: the prompt-stage
 * priming is the primary delivery channel and the block is the fallback. The `systemMessage`
 * line tells the user what the notice is about ("🎓 devcoach: checking whether a lesson is
 * due…" — neutral on purpose: a cue legitimately resolved by a silent skip_lesson must not
 * read as a failed lesson).
 */
function block(reason: string, systemMessage?: string): HookDirective {
  const out: HookDirective = { decision: "block", reason };
  if (systemMessage) out.systemMessage = systemMessage;
  return out;
}

export const CUE_SYSTEM_MESSAGE = "🎓 devcoach: checking whether a lesson is due…";

// No DB yet → onboarding has not run. Cue WITHOUT creating coaching.db or any
// marker file, so an interrupted onboarding leaves nothing behind and re-cues on
// the next task. The artifacts appear only when complete_onboarding actually runs.
export const ONBOARD_CUE =
  "devcoach: the user has no coaching profile yet. Ask them how they want to set it up " +
  "and STRONGLY recommend Automatic — devcoach scans their full Claude Code history " +
  "across all their projects (call get_onboarding for the detected stack and " +
  "per-project evidence) so the profile reflects what they actually build. Also offer " +
  "Guided (a short conversation to map topics and confidence levels) and Import " +
  "(restore from a backup), but lead with Automatic; do not pick for them. After they " +
  "choose, build the profile and save it by calling the devcoach `complete_onboarding` " +
  "MCP tool (not a shell command) before ending your turn.";

// The notebook's observations are refreshed only every Nth delivered lesson, not after
// each one. The hook owns the count (the DB is the source of truth) so the model never
// has to count.
export const NOTEBOOK_UPDATE_EVERY = 10;

/**
 * The cue is pure delegation: the devcoach *skill* is the single source of truth for
 * the full coaching flow — the cue makes the model load it deterministically via the
 * Skill tool and repeats NONE of its rules (a duplicated copy drifts; a drifted "output
 * nothing" once ate the card entirely). It carries only what the skill cannot know — the
 * notebook-checkpoint count — plus a fallback that keeps the cue self-contained when the
 * skill is not installed.
 */
export function buildLessonCue(nextLessonNumber: number): string {
  const updateDue = nextLessonNumber % NOTEBOOK_UPDATE_EVERY === 0;
  const nextCheckpoint =
    Math.ceil(nextLessonNumber / NOTEBOOK_UPDATE_EVERY) * NOTEBOOK_UPDATE_EVERY;
  const notebookStep = updateDue
    ? `This is lesson #${nextLessonNumber} — a notebook checkpoint (every ${NOTEBOOK_UPDATE_EVERY} ` +
      "lessons): after log_lesson returns the feedback, also read references/calibration.md in the " +
      "devcoach skill and run its notebook-update step (a direct file write), recording " +
      `"(updated after ${nextLessonNumber} lessons)".`
    : "Skip the notebook update this time — it is refreshed only every " +
      `${NOTEBOOK_UPDATE_EVERY} lessons (next checkpoint at lesson #${nextCheckpoint}).`;

  return (
    "devcoach: a lesson is due for the technical work just completed. Do it now — do not " +
    "acknowledge this message and do not explain what you are about to do.\n\n" +
    "Invoke the `devcoach` skill (Skill tool) NOW and follow it exactly — the skill is the single " +
    "source of truth for the entire flow, including the explicit no-op when the completed " +
    "work does not warrant a lesson.\n" +
    `${notebookStep}\n\n` +
    "If the devcoach skill is not available, fall back to: call get_briefing (one call: " +
    "profile, taught topics, notebook); pick ONE untaught profile topic at or " +
    "above the user's confidence band; call log_lesson silently (body = 3–6 short paragraphs " +
    "tied to the task plus a `💡 *Senior tip:*` line, clean markdown without bands or a " +
    "title line); THEN write the card as the FINAL message of the turn: plain markdown (no " +
    "'>' blockquote) between two band headings `### ──────── 🎓 devcoach ────────` and " +
    "`### ──────── [topic] · [level] ────────`, with `**[Title]** · [Category] · [Level]`, " +
    "the body you passed, and the tip — saving is not showing; the card in the final " +
    "message is the only thing the user sees. If instead the work does not warrant a lesson " +
    "(pure questions, chat, nothing technical), call the devcoach `skip_lesson` tool with a " +
    "one-line reason.\n\n" +
    "The rate-limit check is already done by this hook — skip it. Work in silence: never " +
    "narrate devcoach tool calls or resource reads ('checking your profile…'). Output only " +
    "the lesson card (or nothing). No preamble, no meta-commentary."
  );
}

export function buildPromptPrime(): string {
  return (
    "devcoach: the lesson pacing threshold will be reached at the end of this turn. Resolve " +
    "it before finishing:\n" +
    "- If this task is technical: invoke the `devcoach` skill (Skill tool) and follow it exactly " +
    "to close your reply — the skill is the single source of truth for the entire lesson " +
    "flow.\n" +
    "- If it is not technical: silently call the devcoach `skip_lesson` tool with a one-line " +
    "reason and output nothing about it.\n" +
    "- Either way, work in silence: never narrate devcoach tool calls or resource reads " +
    "('checking your profile…')."
  );
}

type StopDecision =
  | { kind: "silent"; note: string }
  | { kind: "onboard"; note: string }
  | { kind: "cue"; nextLessonNumber: number; note: string };

/**
 * The whole per-stop decision on ONE connection inside ONE IMMEDIATE transaction:
 * a single lock/journal cycle, and atomic against a concurrent stop (two sessions
 * can never both cue from the same counter state).
 *
 * Order: forced-continuation suppression → onboarding → cue engine.
 */
function decideStop(conn: DatabaseSync, payload: HookPayload): StopDecision {
  const plan = payload.permission_mode === "plan";
  if (payload.stop_hook_active) return { kind: "silent", note: "hook-forced continuation" };
  if (db.compatOf(conn))
    return { kind: "silent", note: "read-only: database newer than this build" };
  if (!db.isOnboardingComplete(conn).knowledge_ready) {
    if (plan) return { kind: "silent", note: "onboarding not complete" };
    return { kind: "onboard", note: "onboarding cue (empty knowledge)" };
  }
  // A course in progress is a multi-turn conversation (prerequisite Q&A, one step per message):
  // a lesson cue landing in the middle would force a dead skip_lesson turn. Pause without
  // touching the counters; cues resume as soon as the course is completed or abandoned.
  if (db.hasActiveCourse(conn)) return { kind: "silent", note: "course in progress — cues paused" };
  const d = coach.evaluateCue(conn, payload.session_id, { planMode: plan });
  return d.cue
    ? { kind: "cue", nextLessonNumber: d.nextLessonNumber, note: d.reason }
    : { kind: "silent", note: d.reason };
}

/**
 * The Stop hook's answer: onboarding check first, then the lesson-cue pipeline. A missing
 * database means onboarding never ran — cue it without creating the file.
 */
export function stopDirective(input: HookInput | null | undefined): HookDirective {
  const payload = parseHookInput(input);
  if (!existsSync(db.DB_PATH)) {
    if (payload.stop_hook_active || payload.permission_mode === "plan") return SILENT;
    hookDebugLog("hook_stop", payload.session_id, "onboarding cue (no DB)");
    return block(ONBOARD_CUE);
  }
  let decision: StopDecision;
  try {
    decision = db.withConnection((conn) =>
      db.withTransaction(conn, () => decideStop(conn, payload)),
    );
  } catch (err) {
    // Includes a database newer than this build: withTransaction refuses it up front.
    hookDebugLog("hook_stop", payload.session_id, `error: ${err}`);
    return SILENT;
  }
  hookDebugLog("hook_stop", payload.session_id, decision.note);
  switch (decision.kind) {
    case "onboard":
      return block(ONBOARD_CUE);
    case "cue":
      return block(buildLessonCue(decision.nextLessonNumber), CUE_SYSTEM_MESSAGE);
    default:
      return SILENT;
  }
}

/**
 * The UserPromptSubmit hook's answer: a read-only peek (never bumps — the stop hook owns the
 * counter). When this turn's stop would reach the pacing threshold, prime the model up front
 * via invisible additionalContext so the lesson lands at the natural end of the reply; the
 * stop hook stays as enforcement if it doesn't.
 */
export function promptDirective(input: HookInput | null | undefined): HookDirective {
  const payload = parseHookInput(input);
  if (payload.permission_mode === "plan") return SILENT;
  if (!existsSync(db.DB_PATH)) return SILENT;
  let wouldCue: boolean;
  try {
    // Read-only on a newer database: a primed lesson could not be saved — never prime.
    wouldCue = db.withConnection(
      (conn) =>
        db.compatOf(conn) === null &&
        !db.hasActiveCourse(conn) &&
        coach.explainCue(conn, payload.session_id).wouldCue,
    );
  } catch (err) {
    hookDebugLog("hook_prompt", payload.session_id, `error: ${err}`);
    return SILENT;
  }
  hookDebugLog("hook_prompt", payload.session_id, wouldCue ? "priming" : "no prime");
  if (!wouldCue) return SILENT;
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: buildPromptPrime(),
    },
  };
}
