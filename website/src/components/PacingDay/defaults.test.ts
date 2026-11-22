// The pacing figure draws devcoach's real defaults: the twin of DEFAULT_SETTINGS in src/core/db.ts.
// Run with `npm test` (node --test; Node 24+ strips the types natively).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { PACING_DEFAULTS } from "./defaults.ts";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const db = readFileSync(join(repo, "src", "core", "db.ts"), "utf8");

/** The value of one key inside `export const DEFAULT_SETTINGS … = { … };`. */
function productDefault(key: string): number {
  const block = db.match(/export const DEFAULT_SETTINGS[^=]*=\s*\{([^}]*)\}/);
  assert.ok(block, "DEFAULT_SETTINGS in src/core/db.ts");
  const value = block[1].match(new RegExp(`\\b${key}:\\s*"(\\d+)"`));
  assert.ok(value, `${key} in DEFAULT_SETTINGS`);
  return Number(value[1]);
}

test("the figure's numbers are the product defaults", () => {
  assert.deepEqual(
    {
      maxPerDay: productDefault("max_per_day"),
      minGapMinutes: productDefault("min_gap_minutes"),
      nudgeEvery: productDefault("nudge_every"),
    },
    { ...PACING_DEFAULTS },
  );
});
