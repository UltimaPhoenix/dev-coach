import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as db from "../src/core/db";

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
});
