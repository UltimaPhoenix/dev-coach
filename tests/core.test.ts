import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import * as coach from "../src/core/coach";
import * as db from "../src/core/db";
import { detectStack } from "../src/core/detect";
import { detectGitContext } from "../src/core/git";
import { normalizeTimestamp, parseLesson } from "../src/core/models";
import { buildPromptForLevel, formatLessonForDisplay } from "../src/core/prompts";

function freshDb(): DatabaseSync {
  return db.getInitializedConnection(join(mkdtempSync(join(tmpdir(), "dc-db-")), "c.db"));
}

const lesson = (over: Record<string, unknown> = {}) =>
  parseLesson({
    id: "l1",
    timestamp: "2026-06-16T10:00:00Z",
    topic_id: "python",
    categories: ["python", "perf"],
    title: "Generators",
    level: "mid",
    summary: "lazy",
    ...over,
  });

describe("models", () => {
  it("normalizes timestamps (naive→UTC, offset, clamp, date-only)", () => {
    expect(normalizeTimestamp("2025-01-15T20:30:00Z")).toBe("2025-01-15T20:30:00Z");
    expect(normalizeTimestamp("2025-01-15T20:30:00")).toBe("2025-01-15T20:30:00Z");
    expect(normalizeTimestamp("2025-01-15")).toBe("2025-01-15T00:00:00Z");
    expect(normalizeTimestamp("2025-01-15T20:30:00+02:00")).toBe("2025-01-15T18:30:00Z");
    expect(normalizeTimestamp("2999-01-01T00:00:00Z").startsWith("20")).toBe(true); // clamped
  });
  it("rejects bad timestamps", () => {
    expect(() => normalizeTimestamp("not-a-date")).toThrow();
    expect(() => parseLesson({ ...lesson(), timestamp: "nope" })).toThrow();
  });
  it("coerces optional fields to null and defaults", () => {
    const l = lesson();
    expect(l.body).toBeNull();
    expect(l.feedback).toBeNull();
    expect(l.starred).toBe(false);
  });
});

describe("db lessons", () => {
  let c: DatabaseSync;
  afterEach(() => c?.close());
  it("inserts, reads, filters, paginates", () => {
    c = freshDb();
    db.insertLesson(c, lesson());
    db.insertLesson(
      c,
      lesson({
        id: "l2",
        topic_id: "docker",
        categories: ["docker"],
        level: "senior",
        title: "Layers",
        starred: true,
      }),
    );
    expect(db.getLessons(c).length).toBe(2);
    expect(db.getLessonById(c, "l1")?.topic_id).toBe("python");
    expect(db.getLessons(c, { category: "docker" }).map((l) => l.id)).toEqual(["l2"]);
    expect(db.getLessons(c, { level: "senior" })[0]?.id).toBe("l2");
    expect(db.getLessons(c, { starred: true }).length).toBe(1);
    expect(db.getLessons(c, { search: "Generators" })[0]?.id).toBe("l1");
    expect(db.getLessons(c, { page: 1, per_page: 1 }).length).toBe(1);
    expect(db.getAllCategories(c)).toEqual(["docker", "perf", "python"]);
    expect(db.getDistinctColumn(c, "project")).toEqual([]);
    expect(() => db.getDistinctColumn(c, "evil")).toThrow();
  });
  it("date range, period, feedback filters", () => {
    c = freshDb();
    db.insertLesson(c, lesson());
    expect(db.getLessons(c, { date_from: "2026-06-16", date_to: "2026-06-16" }).length).toBe(1);
    expect(db.getLessons(c, { date_to: "2020-01-01" }).length).toBe(0);
    expect(db.getLessons(c, { period: "year" }).length).toBe(1); // lesson dated today → within the year
    expect(db.getLessons(c, { feedback: "none" }).length).toBe(1);
    db.setFeedback(c, "l1", "know");
    expect(db.getLessons(c, { feedback: "know" }).length).toBe(1);
  });
  it("star, delete, taught, counts", () => {
    c = freshDb();
    db.insertLesson(c, lesson());
    expect(db.setStar(c, "l1", true)).toBe(true);
    expect(db.setStar(c, "missing", true)).toBe(false);
    expect(db.getTaughtTopicIds(c)).toEqual(["python"]);
    expect(db.countLessonsSince(c, "2000-01-01T00:00:00Z")).toBe(1);
    expect(db.getLastLessonTimestamp(c)).toBe("2026-06-16T10:00:00Z");
    expect(db.deleteLesson(c, "l1")).toBe(true);
    expect(db.deleteLesson(c, "l1")).toBe(false);
    expect(db.getLastLessonTimestamp(c)).toBeNull();
  });
});

describe("db knowledge + groups + settings", () => {
  let c: DatabaseSync;
  afterEach(() => c?.close());
  it("upserts, clamps, groups, usage defaults", () => {
    c = freshDb();
    db.upsertKnowledge(c, "python", 4);
    db.upsertKnowledge(c, "python", 99); // clamp to 10
    expect(db.getAllKnowledge(c).python).toBe(10);
    db.assignTopicToGroup(c, "python", "Languages");
    expect(db.getKnowledgeGroupList(c)[0]).toEqual({ name: "Languages", topics: ["python"] });
    expect(db.addGroup(c, "Backend")).toBe(true);
    expect(db.addGroup(c, "Backend")).toBe(false);
    db.unassignTopicFromGroup(c, "python");
    expect(db.getKnowledgeGroups(c).Languages).toEqual([]);
    expect(db.deleteGroup(c, "Backend")).toBe(true);
    expect(db.deleteKnowledge(c, "python")).toBe(true);
    expect(db.deleteKnowledge(c, "python")).toBe(false);
    expect(() => db.addGroup(c, "  ")).toThrow();
  });
  it("settings get/set + migration + onboarding flag", () => {
    c = freshDb();
    expect(db.getSettings(c)).toEqual({
      max_per_day: 2,
      min_gap_minutes: 240,
      ui_theme: "system",
      nudge_every: 10,
      nudge_scope: "session",
    });
    db.setSetting(c, "max_per_day", "5");
    db.setSetting(c, "ui_theme", "dark");
    expect(db.getSettings(c).max_per_day).toBe(5);
    expect(db.getSettings(c).ui_theme).toBe("dark");
    db.setSetting(c, "min_gap_minutes", "0");
    c.exec("DELETE FROM settings WHERE key='min_gap_minutes'");
    db.setSetting(c, "min_hours_between", "3"); // legacy → 180
    expect(db.getSettings(c).min_gap_minutes).toBe(180);
    expect(db.isOnboardingComplete(c).knowledge_ready).toBe(false);
    db.upsertKnowledge(c, "x", 5);
    expect(db.isOnboardingComplete(c).knowledge_ready).toBe(true);
    db.insertLesson(c, lesson());
    expect(db.getUsageDefaults(c).repository).toBeNull();
  });
  it("nudge counter: per-session, global SUM, reset, prune", () => {
    c = freshDb();
    // per-session: each session counts independently
    expect(db.bumpNudge(c, "s1", "session")).toBe(1);
    expect(db.bumpNudge(c, "s1", "session")).toBe(2);
    expect(db.bumpNudge(c, "s2", "session")).toBe(1);
    // global: SUM across all sessions (s1=2, s2=1, s3=1 → 4)
    expect(db.bumpNudge(c, "s3", "global")).toBe(4);
    // reset clears every counter
    db.resetNudge(c);
    expect(db.bumpNudge(c, "s1", "session")).toBe(1);
    // prune keeps the table bounded to MAX_NUDGE_SESSIONS
    for (let i = 0; i < db.MAX_NUDGE_SESSIONS + 5; i++) db.bumpNudge(c, `p${i}`, "session");
    const n = Number((c.prepare("SELECT COUNT(*) AS n FROM nudge_state").get() as { n: number }).n);
    expect(n).toBeLessThanOrEqual(db.MAX_NUDGE_SESSIONS);
  });
  it("cue_state: pending lifecycle + resetNudge disarms", () => {
    c = freshDb();
    expect(db.getCueState(c)).toEqual({
      pending: false,
      last_cue_at: null,
      last_skip_reason: null,
      display_pending: false,
    });
    db.bumpNudge(c, "s1", "session");
    db.markCuePending(c);
    const armed = db.getCueState(c);
    expect(armed.pending).toBe(true);
    expect(armed.last_cue_at).not.toBeNull();
    // markCuePending also restarts pacing from zero
    expect(db.peekNudge(c, "s1", "session")).toBe(0);
    // skip resolves the whole window: pending disarmed AND counters restarted
    db.bumpNudge(c, "s1", "session");
    db.clearCuePending(c, "nothing technical");
    expect(db.getCueState(c).pending).toBe(false);
    expect(db.getCueState(c).last_skip_reason).toBe("nothing technical");
    expect(db.peekNudge(c, "s1", "session")).toBe(0);
    db.markCuePending(c);
    db.resetNudge(c); // log_lesson path
    expect(db.getCueState(c).pending).toBe(false);
    // display flag: set by log_lesson, consumed once by the next stop
    db.markDisplayPending(c);
    expect(db.takeDisplayPending(c)).toBe(true);
    expect(db.takeDisplayPending(c)).toBe(false);
  });

  it("evaluateCue: gates in order, resets on emission, retries, counts plan mode", () => {
    c = freshDb();
    const opts = { planMode: false };
    expect(coach.evaluateCue(c, "s1", opts).reason).toContain("onboarding");

    db.upsertKnowledge(c, "ts", 5);
    db.setSetting(c, "nudge_every", "5");
    db.setSetting(c, "min_gap_minutes", "0");
    db.setSetting(c, "max_per_day", "99");

    // pacing: 4 silent stops, cue on the 5th, counter reset + retry armed
    for (let i = 1; i <= 4; i++) {
      const d = coach.evaluateCue(c, "s1", opts);
      expect(d.cue).toBe(false);
      expect(d.reason).toContain(`paced (${i}/5)`);
    }
    const cue = coach.evaluateCue(c, "s1", opts);
    expect(cue.cue).toBe(true);
    expect(cue.nextLessonNumber).toBe(1);
    expect(db.getCueState(c).pending).toBe(true);
    // retry window: threshold drops to min(3, nudge_every)
    expect(coach.evaluateCue(c, "s1", opts).reason).toContain("paced (1/3");
    expect(coach.evaluateCue(c, "s1", opts).cue).toBe(false);
    expect(coach.evaluateCue(c, "s1", opts).cue).toBe(true);

    // plan mode: never counts and never cues
    db.resetNudge(c);
    for (let i = 1; i <= 4; i++) coach.evaluateCue(c, "s1", opts);
    const plan = coach.evaluateCue(c, "s1", { planMode: true });
    expect(plan.cue).toBe(false);
    expect(plan.reason).toContain("plan mode (not counted)");
    expect(db.peekNudge(c, "s1", "session")).toBe(4); // the plan-mode stop did NOT count
    expect(coach.evaluateCue(c, "s1", opts).cue).toBe(true); // 5th real stop cues

    // rate limited: accumulates without cueing and without arming the retry
    db.resetNudge(c);
    db.setSetting(c, "max_per_day", "0");
    for (let i = 1; i <= 5; i++) coach.evaluateCue(c, "s1", opts);
    const limited = coach.evaluateCue(c, "s1", opts);
    expect(limited.cue).toBe(false);
    expect(limited.reason).toContain("rate limited");
    expect(db.getCueState(c).pending).toBe(false);
    db.setSetting(c, "max_per_day", "99");
    expect(coach.evaluateCue(c, "s1", opts).cue).toBe(true); // first allowed stop cues

    // nudge_every=0 → every eligible stop cues
    db.setSetting(c, "nudge_every", "0");
    expect(coach.evaluateCue(c, "s1", opts).cue).toBe(true);
    expect(coach.evaluateCue(c, "s1", opts).reason).toContain("pacing disabled");
  });

  it("explainCue: read-only dry run of the next stop", () => {
    c = freshDb();
    expect(coach.explainCue(c, "s1").wouldCue).toBe(false); // onboarding incomplete
    db.upsertKnowledge(c, "ts", 5);
    db.setSetting(c, "nudge_every", "2");
    db.setSetting(c, "min_gap_minutes", "0");
    db.setSetting(c, "max_per_day", "99");
    const below = coach.explainCue(c, "s1");
    expect(below.wouldCue).toBe(false);
    expect(below.reasons.join()).toContain("1/2");
    expect(db.peekNudge(c, "s1", "session")).toBe(0); // never bumps
    db.bumpNudge(c, "s1", "session");
    expect(coach.explainCue(c, "s1").wouldCue).toBe(true);
    db.setSetting(c, "max_per_day", "0");
    const limited = coach.explainCue(c, "s1");
    expect(limited.wouldCue).toBe(false);
    expect(limited.reasons.join()).toContain("rate limited");
  });

  it("backup → restore round-trip", () => {
    c = freshDb();
    db.upsertKnowledge(c, "python", 4);
    db.assignTopicToGroup(c, "python", "Languages");
    db.insertLesson(c, lesson());
    const zip = db.createBackupZip(c);
    const c2 = freshDb();
    const r = db.restoreBackupZip(c2, zip);
    expect(r.topics).toBe(1);
    expect(r.lessons).toBe(1);
    expect(db.getLessons(c2).length).toBe(1);
    // duplicate import is skipped
    const r2 = db.restoreBackupZip(c2, zip);
    expect(r2.skipped).toBe(1);
    c2.close();
  });
  it("import lessons reports invalid", () => {
    c = freshDb();
    const res = db.importLessons(c, [lesson(), { bad: true }]);
    expect(res.inserted).toBe(1);
    expect(res.invalid).toBe(1);
  });
});

describe("coach", () => {
  let c: DatabaseSync;
  afterEach(() => c?.close());
  it("rate limit: allowed, daily cap, gap", () => {
    c = freshDb();
    expect(coach.checkRateLimit(c).allowed).toBe(true);
    db.setSetting(c, "max_per_day", "1");
    db.setSetting(c, "min_gap_minutes", "0");
    db.insertLesson(c, lesson({ id: "a", timestamp: new Date().toISOString() }));
    expect(coach.checkRateLimit(c).allowed).toBe(false); // daily cap reached
    db.setSetting(c, "max_per_day", "10");
    db.setSetting(c, "min_gap_minutes", "240");
    const r = coach.checkRateLimit(c);
    expect(r.allowed).toBe(false); // too soon
    expect(r.reason).toContain("Too soon");
  });
  it("profile, delta, feedback, stats, taught", () => {
    c = freshDb();
    db.upsertKnowledge(c, "python", 4);
    expect(coach.getProfile(c).knowledge[0]?.topic).toBe("python");
    expect(coach.applyKnowledgeDelta(c, "python", 2)).toBe(6);
    expect(coach.applyKnowledgeDelta(c, "newtopic", 1)).toBe(6); // base 5 + 1
    db.insertLesson(c, lesson());
    expect(coach.recordFeedback(c, "l1", "know")).toBe("python");
    const stats = coach.getStats(c);
    expect(stats.total_lessons).toBe(1);
    expect((stats.weakest_topics as unknown[]).length).toBeGreaterThan(0);
    expect(coach.listTaughtTopics(c)).toEqual(["python"]);
  });
});

describe("prompts", () => {
  it("formats a lesson card and level prompts", () => {
    const out = formatLessonForDisplay(lesson({ body: "Lazy evaluation defers work.\n\n💡 tip" }));
    expect(out).toContain("🎓 devcoach");
    expect(out).toContain("**Generators**");
    expect(out).toContain("Lazy evaluation defers work.");
    expect(out).not.toContain("> ");
    // body missing → summary is the card text
    expect(formatLessonForDisplay(lesson({ body: null }))).toContain("lazy");
    expect(buildPromptForLevel("docker", "ctx", 2)).toContain("beginner");
    expect(buildPromptForLevel("docker", "ctx", 5)).toContain("intermediate");
    expect(buildPromptForLevel("docker", "ctx", 8)).toContain("senior-level");
    expect(buildPromptForLevel("docker", "ctx", 10)).toBe("");
  });
});

describe("detect + git", () => {
  it("detects a JS/Docker/python stack", () => {
    const dir = mkdtempSync(join(tmpdir(), "dc-stack-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ dependencies: { react: "1", express: "1" } }),
    );
    writeFileSync(join(dir, "Dockerfile"), "FROM node");
    writeFileSync(join(dir, "pyproject.toml"), "fastapi\ndjango");
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(dir, ".github", "workflows", "ci.yml"), "on: push");
    const stack = detectStack(dir);
    expect(stack.javascript).toBe(6);
    expect(stack.react).toBe(6);
    expect(stack.express).toBe(6);
    expect(stack.docker).toBe(7);
    expect(stack.fastapi).toBe(6);
    expect(stack.django).toBe(6);
    expect(stack.github_actions).toBe(6);
    expect(detectStack(join(tmpdir(), "does-not-exist-xyz"))).toEqual({});
  });
  it("detectGitContext returns the expected shape", () => {
    const ctx = detectGitContext();
    expect(ctx).toHaveProperty("folder");
    expect(ctx).toHaveProperty("repository_platform");
    expect(typeof ctx.folder).toBe("string");
  });
});
