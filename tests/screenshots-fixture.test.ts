import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/db";
import { HIGHLIGHTER_PLACEHOLDER, hasCode, hasHighlighter } from "../src/core/highlighter";
import { CourseSchema, CourseStepSchema } from "../src/core/models";

// The demo data behind docs/screenshots/*.png (restored by scripts/screenshots.mjs). It is a
// public-facing artefact: test residue or duplicate groups end up in the README and the docs site.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = unzipSync(readFileSync(join(root, "scripts", "screenshots", "fixture.zip")));
const json = (name: string) => JSON.parse(strFromU8(files[name]));

describe("screenshot fixture (scripts/screenshots/fixture.zip)", () => {
  it("ships the four backup sections and the two demo courses", () => {
    expect(Object.keys(files).sort()).toEqual([
      "courses.json",
      "courses/from-a-cache-miss-to-a-stampede/index.html",
      "courses/retry-with-exponential-backoff-and-jitter/index.html",
      "knowledge.json",
      "learning-state.md",
      "lessons.json",
      "settings.json",
    ]);
  });

  it("has no duplicate or leftover groups and no test topics", () => {
    const knowledge = json("knowledge.json") as {
      groups: string[];
      topics: { topic: string; group: string | null }[];
    };
    const lower = knowledge.groups.map((g) => g.trim().toLowerCase());
    expect(new Set(lower).size).toBe(knowledge.groups.length);
    expect(lower).not.toContain("test");
    for (const t of knowledge.topics) {
      expect(t.topic).not.toBe("test");
      expect(t.topic).not.toMatch(/^sqlite_/);
      if (t.group) expect(knowledge.groups).toContain(t.group);
    }
  });

  it("shows the product defaults in the Settings screenshot", () => {
    const settings = json("settings.json") as Record<string, string | number>;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      expect(String(settings[key])).toBe(value);
    }
  });

  it("keeps the five demo lessons the docs pages link to", () => {
    const ids = (json("lessons.json") as { id: string }[]).map((l) => l.id).sort();
    expect(ids).toEqual([
      "lesson-ci-cd-pipeline-stages-001",
      "lesson-docker-layer-cache-001",
      "lesson-git-interactive-rebase-001",
      "lesson-postgresql-explain-analyze-001",
      "lesson-redis-cache-stampede-001",
    ]);
  });

  it("keeps the two demo courses the docs pages link to, with their documents", () => {
    const data = json("courses.json") as { courses: unknown[]; steps: unknown[] };
    const courses = data.courses.map((c) => CourseSchema.parse(c));
    const steps = data.steps.map((s) => CourseStepSchema.parse(s));
    expect(courses.map((c) => `${c.id}:${c.status}`).sort()).toEqual([
      "from-a-cache-miss-to-a-stampede:active",
      "retry-with-exponential-backoff-and-jitter:completed",
    ]);
    const lessonIds = (json("lessons.json") as { id: string }[]).map((l) => l.id);
    for (const course of courses) {
      if (course.lesson_id !== null) expect(lessonIds).toContain(course.lesson_id);
      const own = steps.filter((s) => s.course_id === course.id);
      expect(own.map((s) => s.position)).toEqual(own.map((_, i) => i + 1));
      const html = strFromU8(files[`courses/${course.id}/index.html`]);
      for (const step of own) expect(html).toContain(`<section id="${step.anchor}">`);
      expect(html.split(HIGHLIGHTER_PLACEHOLDER)).toHaveLength(2); // exactly one, empty
      expect(hasHighlighter(html)).toBe(false); // the library is filled on restore, never stored
      expect(hasCode(html)).toBe(true);
      expect(html).toContain('<pre><code class="language-');
      expect(html).toContain("<svg"); // the figures are drawn, not embedded
      // self-contained and anonymous: no URL, address or local path inside the documents
      expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org\/2000\/svg)/);
      expect(html).not.toMatch(/[\w.]+@[\w.]+\.\w+/);
      expect(html).not.toContain("/Users/");
    }
  });
});
