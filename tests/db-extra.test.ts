import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";
import { parseLesson } from "../src/core/models";

const mk = (o: Record<string, unknown>) =>
  parseLesson({
    timestamp: "2026-06-16T09:00:00Z",
    topic_id: "python",
    categories: ["python"],
    level: "mid",
    summary: "s",
    ...o,
  });

describe("db edge cases", () => {
  it("periodToCutoff handles every supported period", () => {
    for (const p of ["today", "week", "month", "year"]) {
      expect(db.periodToCutoff(p)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(db.periodToCutoff("all")).toBeNull();
    expect(db.periodToCutoff(null)).toBeNull();
  });

  it("getSettings migrates legacy min_hours_between → minutes", () => {
    const s = db.withConnection((c) => {
      c.exec("DELETE FROM settings WHERE key = 'min_gap_minutes'");
      c.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('min_hours_between', '4')");
      return db.getSettings(c);
    });
    expect(s.min_gap_minutes).toBe(240); // 4h × 60
  });

  it("getSettings falls back to the default gap when neither key is set", () => {
    const s = db.withConnection((c) => {
      c.exec("DELETE FROM settings WHERE key IN ('min_gap_minutes', 'min_hours_between')");
      return db.getSettings(c);
    });
    expect(s.min_gap_minutes).toBe(240);
  });

  it("restoreBackupZip accepts the legacy {topic: confidence} knowledge format", () => {
    const zip = zipSync({ "knowledge.json": strToU8(JSON.stringify({ python: 5, rust: 8 })) });
    const r = db.withConnection((c) => {
      c.exec("DELETE FROM knowledge");
      const res = db.restoreBackupZip(c, zip);
      return { res, know: db.getAllKnowledge(c) };
    });
    expect(r.res.topics).toBe(2);
    expect(r.know.rust).toBe(8);
  });

  it("getLessons honors date_to-with-time, starred true/false, and search filters", () => {
    const c = db.getInitializedConnection(":memory:"); // also covers the :memory: connection path
    db.insertLesson(c, mk({ id: "a", title: "A", starred: true }));
    db.insertLesson(
      c,
      mk({
        id: "b",
        timestamp: "2026-06-10T09:00:00Z",
        topic_id: "go",
        title: "Bee",
        summary: "find me",
      }),
    );
    expect(db.getLessons(c, { date_to: "2026-06-12T00:00:00" }).map((l) => l.id)).toEqual(["b"]);
    expect(db.getLessons(c, { starred: true }).map((l) => l.id)).toEqual(["a"]);
    expect(db.getLessons(c, { starred: false }).map((l) => l.id)).toEqual(["b"]);
    expect(db.getLessons(c, { search: "find" }).map((l) => l.id)).toEqual(["b"]);
  });

  it("getSettings parses every ui_theme and defaults max_per_day", () => {
    const c = db.getInitializedConnection(":memory:");
    for (const t of ["dark", "light", "system", "bogus"]) {
      db.setSetting(c, "ui_theme", t);
      expect(["dark", "light", "system"]).toContain(db.getSettings(c).ui_theme);
    }
    c.exec("DELETE FROM settings WHERE key = 'max_per_day'");
    expect(db.getSettings(c).max_per_day).toBe(2);
  });

  it("restoreBackupZip restores grouped and ungrouped topics", () => {
    const zip = zipSync({
      "knowledge.json": strToU8(
        JSON.stringify({
          groups: ["Languages"],
          topics: [
            { topic: "python", confidence: 7, group: "Languages" },
            { topic: "misc", confidence: 3, group: "Other" },
          ],
        }),
      ),
    });
    const c = db.getInitializedConnection(":memory:");
    const res = db.restoreBackupZip(c, zip);
    expect(res.topics).toBe(2);
    const know = db.getAllKnowledge(c);
    expect(know.python).toBe(7);
    expect(know.misc).toBe(3);
  });
});
