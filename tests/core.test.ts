import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import * as coach from "../src/core/coach";
import * as courses from "../src/core/courses";
import * as db from "../src/core/db";
import { detectStack, mergeStacks } from "../src/core/detect";
import { detectGitContext } from "../src/core/git";
import { normalizeTimestamp, parseLesson } from "../src/core/models";
import { buildPromptForLevel, formatLessonForDisplay } from "../src/core/prompts";
import { buildSharePayload, renderShareText, ShareInputError } from "../src/core/share";

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
    expect(db.getLessons(c)).toHaveLength(2);
    expect(db.getLessonById(c, "l1")?.topic_id).toBe("python");
    expect(db.getLessons(c, { category: "docker" }).map((l) => l.id)).toEqual(["l2"]);
    expect(db.getLessons(c, { level: "senior" })[0]?.id).toBe("l2");
    expect(db.getLessons(c, { starred: true })).toHaveLength(1);
    expect(db.getLessons(c, { search: "Generators" })[0]?.id).toBe("l1");
    expect(db.getLessons(c, { page: 1, per_page: 1 })).toHaveLength(1);
    expect(db.getAllCategories(c)).toEqual(["docker", "perf", "python"]);
    expect(db.getDistinctColumn(c, "project")).toEqual([]);
    expect(() => db.getDistinctColumn(c, "evil")).toThrow();
  });
  it("date range, period, feedback filters", () => {
    c = freshDb();
    db.insertLesson(c, lesson());
    expect(db.getLessons(c, { date_from: "2026-06-16", date_to: "2026-06-16" })).toHaveLength(1);
    expect(db.getLessons(c, { date_to: "2020-01-01" })).toHaveLength(0);
    expect(db.getLessons(c, { period: "year" })).toHaveLength(1); // lesson dated today → within the year
    expect(db.getLessons(c, { feedback: "none" })).toHaveLength(1);
    db.setFeedback(c, "l1", "know");
    expect(db.getLessons(c, { feedback: "know" })).toHaveLength(1);
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
      ui_home: "auto",
      nudge_every: 10,
      nudge_scope: "session",
      share_name: null,
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
    expect(db.getLessons(c2)).toHaveLength(1);
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
    expect(coach.recordFeedback(c, "l1", "know")).toMatchObject({
      topic_id: "python",
      previous: null,
      delta: 1,
    });
    expect(db.getAllKnowledge(c).python).toBe(7); // 6 after the +2 delta above, +1 for know
    // understood / dont_know never move confidence; leaving `know` undoes its +1; idempotent
    expect(coach.recordFeedback(c, "l1", "understood")).toMatchObject({
      previous: "know",
      delta: -1,
    });
    expect(db.getAllKnowledge(c).python).toBe(6);
    expect(coach.recordFeedback(c, "l1", "dont_know")).toMatchObject({
      previous: "understood",
      delta: 0,
    });
    expect(coach.recordFeedback(c, "l1", "dont_know")).toMatchObject({ delta: 0 });
    expect(db.getAllKnowledge(c).python).toBe(6);
    expect(coach.recordFeedback(c, "missing", "know")).toBeNull();
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
    writeFileSync(join(dir, "Package.swift"), "// swift-tools-version:6.0");
    mkdirSync(join(dir, "Thing.xcodeproj")); // *.xcodeproj is a directory entry
    const stack = detectStack(dir);
    expect(stack.javascript).toBe(6);
    expect(stack.react).toBe(6);
    expect(stack.express).toBe(6);
    expect(stack.docker).toBe(7);
    expect(stack.fastapi).toBe(6);
    expect(stack.django).toBe(6);
    expect(stack.github_actions).toBe(6);
    expect(stack.swift).toBe(6);
    expect(detectStack(join(tmpdir(), "does-not-exist-xyz"))).toEqual({});
  });
  it("mergeStacks keeps the highest confidence per topic", () => {
    expect(mergeStacks({ go: 5, docker: 7 }, { go: 6 }, {})).toEqual({ go: 6, docker: 7 });
    expect(mergeStacks()).toEqual({});
  });
  it("detectGitContext returns the expected shape", () => {
    const ctx = detectGitContext();
    expect(ctx).toHaveProperty("folder");
    expect(ctx).toHaveProperty("repository_platform");
    expect(typeof ctx.folder).toBe("string");
  });
});

describe("lesson sharing — storage & pacing", () => {
  let c: DatabaseSync | undefined;
  afterEach(() => c?.close());

  const payloadFor = (id: string, sharedBy: string | null = "Ada") =>
    buildSharePayload(lesson({ id, topic_id: "docker", title: `Shared ${id}` }), {
      includeContext: false,
      sharedBy,
    });

  it("migrates a v2 database in place: new columns, user_version 3, imports work", () => {
    const path = join(mkdtempSync(join(tmpdir(), "dc-db-")), "old.db");
    const old = db.getInitializedConnection(path);
    old.exec("ALTER TABLE lessons DROP COLUMN imported");
    old.exec("ALTER TABLE lessons DROP COLUMN shared_by");
    old.exec("PRAGMA user_version = 2");
    old.close();
    c = db.getInitializedConnection(path);
    const cols = (c.prepare("PRAGMA table_info(lessons)").all() as { name: string }[]).map(
      (r) => r.name,
    );
    expect(cols).toContain("imported");
    expect(cols).toContain("shared_by");
    expect((c.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(
      db.SCHEMA_VERSION,
    );
    expect(coach.importSharedLesson(c, payloadFor("m1")).inserted).toBe(1);
  });

  it("v4 rewrites pre-existing dont_know answers to understood — once", () => {
    const path = join(mkdtempSync(join(tmpdir(), "dc-db-")), "v3.db");
    const old = db.getInitializedConnection(path);
    db.insertLesson(old, lesson({ id: "old", feedback: "dont_know" }));
    old.exec("PRAGMA user_version = 3");
    old.close();
    c = db.getInitializedConnection(path);
    expect(db.getLessonById(c, "old")?.feedback).toBe("understood");
    // a fresh answer on a v4 database is what the user meant: couldn't follow
    db.insertLesson(c, lesson({ id: "fresh", feedback: "dont_know" }));
    c.close();
    c = db.getInitializedConnection(path);
    expect(db.getLessonById(c, "fresh")?.feedback).toBe("dont_know");
  });

  it("an imported lesson is ours (taught topic, feedback works) but never touches pacing", () => {
    c = freshDb();
    db.setSetting(c, "max_per_day", "1");
    const r = coach.importSharedLesson(c, payloadFor("p1"));
    expect(r).toMatchObject({ kind: "shared", inserted: 1, duplicated: 0, topic_tracked: false });
    expect(r.lesson).toMatchObject({
      id: "p1",
      imported: true,
      shared_by: "Ada",
      feedback: null,
      starred: false,
    });
    // dated "now" yet invisible to the daily budget and the min-gap…
    expect(coach.checkRateLimit(c)).toEqual({ allowed: true });
    expect(db.getLastLessonTimestamp(c)).toBeNull();
    expect(coach.getStats(c)).toMatchObject({
      total_lessons: 1,
      lessons_today: 0,
      imported_lessons: 1,
    });
    // …but taught, and feedback calibrates the profile as for any lesson.
    expect(db.getTaughtTopicIds(c)).toEqual(["docker"]);
    expect(coach.recordFeedback(c, "p1", "know")?.topic_id).toBe("docker");
    expect(db.getAllKnowledge(c).docker).toBe(6);
    // an own lesson right after still counts as usual
    db.insertLesson(c, lesson({ id: "own", timestamp: new Date() }));
    expect(coach.checkRateLimit(c).allowed).toBe(false);
  });

  it("re-importing the same share is a duplicate; an own lesson with the same slug is never clobbered", () => {
    c = freshDb();
    db.insertLesson(c, lesson({ id: "same-slug", title: "My own lesson" }));
    const first = coach.importSharedLesson(c, payloadFor("same-slug"));
    expect(first.inserted).toBe(1);
    expect(first.lesson?.id).toBe("same-slug-shared");
    expect(db.getLessonById(c, "same-slug")?.title).toBe("My own lesson");
    const again = coach.importSharedLesson(c, payloadFor("same-slug"));
    expect(again).toMatchObject({ inserted: 0, duplicated: 1 });
    expect(again.lesson?.id).toBe("same-slug-shared");
    // the same slug from a different sender is a different lesson
    const other = coach.importSharedLesson(c, payloadFor("same-slug", "Bob"));
    expect(other.inserted).toBe(1);
    expect(other.lesson?.id).toBe("same-slug-shared-2");
    expect(
      db
        .getLessons(c, { imported: true })
        .map((l) => l.id)
        .sort(),
    ).toEqual(["same-slug-shared", "same-slug-shared-2"]);
    expect(db.getLessons(c, { imported: false }).map((l) => l.id)).toEqual(["same-slug"]);
    // by sender: exact match on the filter, substring (case-insensitive) through search
    expect(db.getLessons(c, { shared_by: "Bob" }).map((l) => l.id)).toEqual(["same-slug-shared-2"]);
    expect(db.getLessons(c, { shared_by: "bob" })).toEqual([]);
    expect(db.getLessons(c, { search: "bob" }).map((l) => l.id)).toEqual(["same-slug-shared-2"]);
    expect(db.listSharedBy(c)).toEqual(["Ada", "Bob"]);
    // batch delete: unknown ids are ignored, the count is what actually went
    expect(db.deleteLessons(c, [])).toBe(0);
    expect(db.deleteLessons(c, ["same-slug-shared", "ghost"])).toBe(1);
    expect(db.deleteLessons(c, ["same-slug-shared"])).toBe(0);
    expect(
      db
        .getLessons(c)
        .map((l) => l.id)
        .sort(),
    ).toEqual(["same-slug", "same-slug-shared-2"]);
  });

  it("topic_tracked is an own-property check (a topic named like an Object.prototype key is not 'tracked')", () => {
    c = freshDb();
    const p = payloadFor("proto-topic");
    p.lesson.topic_id = "toString";
    expect(coach.importSharedLesson(c, p).topic_tracked).toBe(false);
    db.upsertKnowledge(c, "toString", 5);
    const q = payloadFor("proto-topic", "Bob");
    q.lesson.topic_id = "toString";
    expect(coach.importSharedLesson(c, q).topic_tracked).toBe(true);
  });

  it("many senders sharing the same slug all import (suffixes are generated, not a fixed list)", () => {
    c = freshDb();
    const ids = ["Ann", "Bob", "Cid", "Dee", "Eve", "Fay"].map(
      (who) => coach.importSharedLesson(c, payloadFor("popular", who)).lesson?.id,
    );
    expect(ids).toEqual([
      "popular",
      "popular-shared",
      "popular-shared-2",
      "popular-shared-3",
      "popular-shared-4",
      "popular-shared-5",
    ]);
  });

  it("importSharedInput takes any encoding, keeps the legacy JSON array path, and rejects junk", () => {
    c = freshDb();
    const p = payloadFor("via-text");
    expect(coach.importSharedInput(c, renderShareText(p)).lesson?.id).toBe("via-text");
    expect(coach.importSharedInput(c, JSON.stringify([lesson({ id: "legacy" })]))).toMatchObject({
      kind: "lessons",
      inserted: 1,
      lesson: null,
      topic_tracked: null,
    });
    expect(db.getLessonById(c, "legacy")?.imported).toBe(false);
    expect(() => coach.importSharedInput(c, "hello there")).toThrow(ShareInputError);
  });

  it("usage defaults for log_lesson ignore imported context; backups round-trip the flag and sender", () => {
    c = freshDb();
    db.setSetting(c, "share_name", "Ada");
    const withContext = buildSharePayload(
      lesson({
        id: "ctx",
        project: "their-project",
        repository: "them/repo",
        repository_platform: "github",
      }),
      { includeContext: true, sharedBy: "Bob" },
    );
    coach.importSharedLesson(c, withContext);
    expect(db.getUsageDefaults(c).project).toBeNull();
    const zip = db.createBackupZip(c);
    const c2 = freshDb();
    db.restoreBackupZip(c2, zip);
    const restored = db.getLessonById(c2, "ctx");
    expect(restored).toMatchObject({ imported: true, shared_by: "Bob", project: "their-project" });
    expect(db.getSettings(c2).share_name).toBe("Ada");
    c2.close();
  });
});

describe("courses — storage, validation, backup", () => {
  let c: DatabaseSync;
  afterEach(() => c?.close());

  it("creates a slugged directory, indexes real sections only, tracks progress", () => {
    c = freshDb();
    const a = courses.createCourse(c, { title: "Sums & Powers!", topic_id: "math" });
    expect(a.id).toBe("sums-powers");
    expect(existsSync(courses.courseDir(a.id))).toBe(true);
    const b = courses.createCourse(c, { title: "Sums & Powers!", topic_id: "math" });
    expect(b.id).toBe("sums-powers-2");
    expect(() => courses.courseDir("../etc")).toThrow(/Invalid course id/);
    expect(courses.courseDocument(a.id)).toBeNull(); // nothing written yet
    expect(() =>
      courses.addStep(c, a.id, { title: "x", kind: "concept", anchor: "step-1" }),
    ).toThrow(/no document yet/);
    writeFileSync(courses.documentPath(a.id), '<section id="step-1"></section><div id="step-2">');
    expect(courses.courseDocument(a.id)).toBe(courses.documentPath(a.id));
    const s1 = courses.addStep(c, a.id, { title: "Sums", kind: "concept", anchor: "step-1" });
    expect(s1.position).toBe(1);
    expect(() =>
      courses.addStep(c, a.id, { title: "dup", kind: "concept", anchor: "step-1" }),
    ).toThrow(/already registered/);
    expect(() => courses.addStep(c, a.id, { title: "x", kind: "check", anchor: "step-3" })).toThrow(
      /No element/,
    );
    courses.addStep(c, a.id, { title: "Powers", kind: "example", anchor: "step-2" });
    expect(courses.hasActiveCourse(c)).toBe(true);
    expect(courses.setStepStatus(c, a.id, 1, "done")?.status).toBe("active");
    expect(courses.setStepStatus(c, a.id, 2, "done")?.status).toBe("completed");
    expect(courses.setStepStatus(c, a.id, 2, "todo")?.status).toBe("active"); // reopened
    expect(courses.setStepStatus(c, a.id, 9, "done")).toBeNull();
    expect(courses.progress(courses.getCourse(c, a.id)!)).toEqual({ done: 1, total: 2 });
    expect(courses.setCourseStatus(c, b.id, "abandoned")?.status).toBe("abandoned");
    expect(courses.listCourses(c, { status: "active" }).map((x) => x.id)).toEqual([a.id]);
    // a symlinked document is refused at read time
    rmSync(courses.documentPath(b.id), { force: true });
    symlinkSync(courses.documentPath(a.id), courses.documentPath(b.id));
    expect(courses.courseDocument(b.id)).toBeNull();
    expect(courses.deleteCourse(c, a.id)).toBe(true);
    expect(existsSync(courses.courseDir(a.id))).toBe(false);
    expect(courses.getCourse(c, a.id)).toBeNull();
    expect(courses.deleteCourse(c, "../x")).toBe(false);
  });

  it("backup carries courses + documents; restore refuses stray paths and never overwrites", () => {
    c = freshDb();
    const a = courses.createCourse(c, { title: "Backed up", topic_id: "math" });
    writeFileSync(courses.documentPath(a.id), '<section id="step-1">hi</section>');
    courses.addStep(c, a.id, { title: "One", kind: "concept", anchor: "step-1" });
    const zip = db.createBackupZip(c);
    const names = Object.keys(unzipSync(zip));
    expect(names).toContain("courses.json");
    expect(names).toContain(`courses/${a.id}/index.html`);
    // wipe, then restore into a fresh DB + a fresh disk
    courses.deleteCourse(c, a.id);
    const c2 = freshDb();
    const r = db.restoreBackupZip(c2, zip);
    expect(r.courses).toBe(1);
    expect(courses.getCourse(c2, a.id)?.steps).toHaveLength(1);
    expect(readFileSync(courses.documentPath(a.id), "utf8")).toContain("hi");
    // a second restore is a no-op (rows ignored, file kept as is)
    writeFileSync(courses.documentPath(a.id), "edited");
    expect(db.restoreBackupZip(c2, zip).courses).toBe(0);
    expect(readFileSync(courses.documentPath(a.id), "utf8")).toBe("edited");
    // a crafted archive: unknown course id, traversal, oversized — nothing reaches the disk
    const evil = zipSync({
      "courses.json": strToU8(JSON.stringify({ courses: [], steps: [] })),
      "courses/../escape.html": strToU8("x"),
      "courses/not-a-course/index.html": strToU8("x"),
    });
    db.restoreBackupZip(c2, evil);
    expect(existsSync(join(db.COURSES_DIR, "..", "escape.html"))).toBe(false);
    expect(existsSync(join(db.COURSES_DIR, "not-a-course"))).toBe(false);
    c2.close();
  });
});
