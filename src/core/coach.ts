// Rate limiting, profile, knowledge deltas, and stats.
import type { DatabaseSync } from "node:sqlite";
import {
  countFilteredLessons,
  countLessonsSince,
  getAllKnowledge,
  getKnowledgeEntries,
  getKnowledgeGroupList,
  getLastLessonTimestamp,
  getSettings,
  getTaughtTopicIds,
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
