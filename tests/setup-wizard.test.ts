import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Scripted answers for the readline prompts (mock must be declared before importing commands).
let scripted: string[] = [];
let idx = 0;
vi.mock("node:readline/promises", () => ({
  createInterface: () => ({
    question: async () => scripted[idx++] ?? "",
    close: () => {},
  }),
}));

import { runCli } from "../src/cli/commands";
import * as db from "../src/core/db";

async function runSetup(answers: string[]): Promise<string> {
  scripted = answers;
  idx = 0;
  const lines: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => lines.push(a.join(" ")));
  const exitSpy = vi.spyOn(process, "exit").mockImplementation(((): never => {
    throw new Error("__exit__");
  }) as never);
  const argv = process.argv;
  process.argv = ["node", "bin", "setup"];
  try {
    await runCli();
  } catch (e) {
    if ((e as Error).message !== "__exit__") throw e;
  } finally {
    process.argv = argv;
    logSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return lines.join("\n");
}

describe("setup wizard", () => {
  it("manual mode builds a grouped profile + settings", async () => {
    // Step1 backup: skip · Step2 mode: m · topics: "python 7", "rust 5", done ·
    // Step3 groups: y, group "Languages" for python, "" for rust · Step4: max 3, gap 120
    const out = await runSetup([
      "",
      "m",
      "python 7",
      "rust 5",
      "",
      "y",
      "Languages",
      "",
      "3",
      "120",
    ]);
    expect(out).toContain("Setup complete");
    expect(db.withConnection((c) => db.getAllKnowledge(c)).python).toBe(7);
    expect(db.withConnection((c) => db.getSettings(c)).max_per_day).toBe(3);
  });

  it("import mode restores from a backup zip", async () => {
    const zip = db.withConnection((c) => {
      db.upsertKnowledge(c, "go", 6);
      return db.createBackupZip(c);
    });
    const file = join(mkdtempSync(join(tmpdir(), "dc-setup-")), "b.zip");
    writeFileSync(file, zip);
    const out = await runSetup([file]); // Step1 backup path provided
    expect(out).toContain("Setup complete");
  });
});
