// Rate limiting, profile, knowledge deltas, stats, and the lesson-cue decision engine.
import type { DatabaseSync } from "node:sqlite";
import {
  bumpNudge,
  countFilteredLessons,
  countLessonsSince,
  getAllKnowledge,
  getCueState,
  getKnowledgeEntries,
  getKnowledgeGroupList,
  getLastLessonTimestamp,
  getSettings,
  getTaughtTopicIds,
  isOnboardingComplete,
  markCuePending,
  NUDGE_RETRY_AFTER,
  peekNudge,
  setFeedback,
  upsertKnowledge,
} from "./db";
import type { Profile, RateLimitResult } from "./models";

export function checkRateLimit(db: DatabaseSync): RateLimitResult {
  try {
    const settings = getSettings(db);
    const now = new Date();

    const since24h = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const count = countLessonsSince(db, since24h);
    if (count >= settings.max_per_day) {
      return {
        allowed: false,
        reason: `Daily limit reached (${count}/${settings.max_per_day} lessons in the last 24h)`,
      };
    }

    const lastTs = getLastLessonTimestamp(db);
    if (lastTs != null) {
      const lastDt = new Date(lastTs);
      const elapsedMinutes = (now.getTime() - lastDt.getTime()) / 60000;
      if (elapsedMinutes < settings.min_gap_minutes) {
        const remaining = settings.min_gap_minutes - elapsedMinutes;
        const gapH = Math.floor(settings.min_gap_minutes / 60);
        const gapM = settings.min_gap_minutes % 60;
        const remTrunc = Math.trunc(remaining);
        const remH = Math.floor(remTrunc / 60);
        const remM = remTrunc % 60;
        const agoText =
          elapsedMinutes < 0
            ? `in ${Math.round(-elapsedMinutes)}m (future timestamp)`
            : `${Math.round(elapsedMinutes)}m ago`;
        return {
          allowed: false,
          reason:
            `Too soon: last lesson ${agoText}, minimum interval is ${gapH}h ${gapM}m ` +
            `(${remH}h ${remM}m remaining)`,
        };
      }
    }

    return { allowed: true };
  } catch (err) {
    return { allowed: true, reason: `Rate limit check failed: ${err}` };
  }
}

export function getProfile(db: DatabaseSync): Profile {
  try {
    return { knowledge: getKnowledgeEntries(db), groups: getKnowledgeGroupList(db) };
  } catch {
    return { knowledge: [], groups: [] };
  }
}

export function applyKnowledgeDelta(db: DatabaseSync, topic: string, delta: number): number {
  const current = getAllKnowledge(db)[topic] ?? 5;
  const newConfidence = Math.max(0, Math.min(10, current + delta));
  upsertKnowledge(db, topic, newConfidence);
  return newConfidence;
}

export function recordFeedback(
  db: DatabaseSync,
  lessonId: string,
  feedbackValue: string | null,
): string | null {
  const topicId = setFeedback(db, lessonId, feedbackValue);
  if (topicId && (feedbackValue === "know" || feedbackValue === "dont_know")) {
    applyKnowledgeDelta(db, topicId, feedbackValue === "know" ? 1 : -1);
  }
  return topicId;
}

export function getStats(db: DatabaseSync): Record<string, unknown> {
  try {
    const now = new Date();
    const total = countFilteredLessons(db);
    const todayCutoff = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const weekCutoff = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const lessonsToday = countLessonsSince(db, todayCutoff);
    const lessonsWeek = countLessonsSince(db, weekCutoff);
    const knowledge = getAllKnowledge(db);
    const sortedK = Object.entries(knowledge).sort((a, b) => a[1] - b[1]);
    const weakest = sortedK.slice(0, 5).map(([topic, confidence]) => ({ topic, confidence }));
    const strongest = sortedK
      .slice(-5)
      .reverse()
      .map(([topic, confidence]) => ({ topic, confidence }));
    return {
      total_lessons: total,
      lessons_today: lessonsToday,
      lessons_this_week: lessonsWeek,
      weakest_topics: weakest,
      strongest_topics: strongest,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

export function listTaughtTopics(db: DatabaseSync): string[] {
  try {
    return getTaughtTopicIds(db);
  } catch {
    return [];
  }
}

// ── Lesson-cue decision engine (used by the Stop hook, doctor, and prompt-hook) ──

export interface CueDecision {
  cue: boolean;
  /** Human-readable outcome — surfaced by `doctor` and DEVCOACH_HOOK_DEBUG. */
  reason: string;
  nextLessonNumber: number;
}

/**
 * Decide whether this stop cues a lesson. Mutates pacing state: bumps the interaction
 * counter (plan-mode stops never count — planning is not coachable work) and, when it
 * cues, resets the counter and arms the shorter retry threshold (markCuePending).
 * Rate-limited stops keep accumulating so the cue fires at the first allowed stop.
 */
export function evaluateCue(
  db: DatabaseSync,
  sessionId: string | null,
  opts: { planMode: boolean },
): CueDecision {
  const none = (reason: string): CueDecision => ({ cue: false, reason, nextLessonNumber: 0 });
  if (opts.planMode) return none("plan mode (not counted)");
  if (!isOnboardingComplete(db).knowledge_ready) return none("onboarding not complete");

  const settings = getSettings(db);
  let pacing = "pacing disabled (nudge_every=0)";
  if (settings.nudge_every > 0) {
    const n = bumpNudge(db, sessionId ?? "__nosession__", settings.nudge_scope);
    const { pending } = getCueState(db);
    const threshold = pending
      ? Math.min(NUDGE_RETRY_AFTER, settings.nudge_every)
      : settings.nudge_every;
    pacing = `${n}/${threshold}${pending ? " (retry window)" : ""}`;
    if (n < threshold) return none(`paced (${pacing})`);
  }
  const rate = checkRateLimit(db);
  if (!rate.allowed) return none(`rate limited: ${rate.reason ?? "denied"}`);

  markCuePending(db);
  return {
    cue: true,
    reason: `cue (${pacing})`,
    nextLessonNumber: Number(getStats(db).total_lessons ?? 0) + 1,
  };
}

/**
 * Read-only dry run of `evaluateCue` for the NEXT eligible stop — no bump, no state
 * change. Drives `doctor`'s verdict and the prompt-hook's priming decision.
 */
export function explainCue(
  db: DatabaseSync,
  sessionId: string | null,
): { wouldCue: boolean; reasons: string[] } {
  try {
    const reasons: string[] = [];
    let wouldCue = true;
    if (!isOnboardingComplete(db).knowledge_ready) {
      return { wouldCue: false, reasons: ["onboarding not complete — no knowledge topics yet"] };
    }
    const settings = getSettings(db);
    if (settings.nudge_every > 0) {
      const n = peekNudge(db, sessionId ?? "__nosession__", settings.nudge_scope) + 1;
      const { pending } = getCueState(db);
      const threshold = pending
        ? Math.min(NUDGE_RETRY_AFTER, settings.nudge_every)
        : settings.nudge_every;
      if (n < threshold) {
        wouldCue = false;
        reasons.push(
          `pacing: next stop would be ${n}/${threshold}${pending ? " (retry window)" : ""}`,
        );
      } else {
        reasons.push(`pacing: next stop reaches the threshold (${n}/${threshold})`);
      }
    } else {
      reasons.push("pacing disabled (nudge_every=0) — every eligible stop cues");
    }
    const rate = checkRateLimit(db);
    if (rate.allowed) {
      reasons.push("rate limit: allowed");
    } else {
      wouldCue = false;
      reasons.push(`rate limited: ${rate.reason ?? "denied"}`);
    }
    return { wouldCue, reasons };
  } catch (err) {
    return { wouldCue: false, reasons: [`check failed: ${err}`] };
  }
}
