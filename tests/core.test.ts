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
    expect(db.getSettings(c)).toEqual({ max_per_day: 2, min_gap_minutes: 240, ui_theme: "system" });
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
    const out = formatLessonForDisplay(lesson({ task_context: "loop" }));
    expect(out).toContain("🎓 devcoach");
    expect(out).toContain("**Generators**");
    expect(out).toContain("Context: loop");
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
