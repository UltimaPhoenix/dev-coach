import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/db";

// The demo data behind docs/screenshots/*.png (restored by scripts/screenshots.mjs). It is a
// public-facing artefact: test residue or duplicate groups end up in the README and the docs site.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = unzipSync(readFileSync(join(root, "scripts", "screenshots", "fixture.zip")));
const json = (name: string) => JSON.parse(strFromU8(files[name]));

describe("screenshot fixture (scripts/screenshots/fixture.zip)", () => {
  it("ships the four backup sections", () => {
    expect(Object.keys(files).sort()).toEqual([
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
});
