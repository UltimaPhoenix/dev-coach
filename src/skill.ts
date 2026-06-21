// Reads bundled markdown from assets/ (the single source of truth).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Candidate bases: prod (dist/bin.js → ../assets) and dev (src/skill.ts → ../assets).
function readAsset(name: string, fallback: string): string {
  for (const base of ["../assets", "../../assets"]) {
    try {
      return readFileSync(join(here, base, name), "utf8");
    } catch {
      // try next candidate
    }
  }
  return fallback;
}

export const readSkill = (): string =>
  readAsset(
    "SKILL.md",
    "devcoach: coaching instructions unavailable (SKILL.md not found in package).",
  );
