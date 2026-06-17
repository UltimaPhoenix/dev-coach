// Reads the bundled SKILL.md from assets/ (the single source of truth).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Candidate locations: prod (dist/bin.js → ../assets) and dev (src/skill.ts → ../assets).
const CANDIDATES = [join(here, "../assets/SKILL.md"), join(here, "../../assets/SKILL.md")];

export function readSkill(): string {
  for (const path of CANDIDATES) {
    try {
      return readFileSync(path, "utf8");
    } catch {
      // try next candidate
    }
  }
  return "devcoach: coaching instructions unavailable (SKILL.md not found in package).";
}
