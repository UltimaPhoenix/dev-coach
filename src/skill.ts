// Reads bundled markdown from assets/ (the single source of truth).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Candidate bases: prod (dist/bin.js → ../assets) and dev (src/skill.ts → ../assets).
function findAssets(): string | null {
  for (const base of ["../assets", "../../assets"]) {
    if (existsSync(join(here, base, "SKILL.md"))) return join(here, base);
  }
  return null;
}

export const readSkill = (): string => {
  const base = findAssets();
  if (base === null)
    return "devcoach: coaching instructions unavailable (SKILL.md not found in package).";
  return readFileSync(join(base, "SKILL.md"), "utf8");
};

export interface SkillReference {
  name: string;
  content: string;
}

/**
 * The skill's on-demand reference files (assets/references/*.md) — installed next to
 * SKILL.md for progressive disclosure, and appended to the MCP prompt for clients
 * without a skill directory (Claude Desktop).
 */
export function readSkillReferences(): SkillReference[] {
  const base = findAssets();
  if (base === null) return [];
  try {
    return readdirSync(join(base, "references"))
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => ({ name: f, content: readFileSync(join(base, "references", f), "utf8") }));
  } catch {
    return [];
  }
}
