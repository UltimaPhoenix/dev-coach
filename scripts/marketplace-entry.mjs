// The devcoach entry for a Claude Code plugin marketplace, from a single source of truth.
// The metadata Claude Code shows in the plugin browser (description, author, homepage, repository,
// license, keywords) is read from plugin/.claude-plugin/plugin.json; `category` and `tags` are
// marketplace-only fields (plugin.json's strict validation rejects them there) and live here.
// Used by update-marketplace.mjs for the public UltimaPhoenix marketplace; tests/plugin.test.ts
// holds the hand-maintained self-marketplace (.claude-plugin/marketplace.json) to the same shape.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Vocabulary of the official Anthropic marketplace (development, productivity, learning, …).
export const MARKETPLACE_CATEGORY = "learning";
export const MARKETPLACE_TAGS = ["coaching", "learning", "mcp"];
export const MARKETPLACE_OWNER = { name: "UltimaPhoenix", url: "https://github.com/UltimaPhoenix" };
export const MARKETPLACE_DESCRIPTION =
  "Plugins by UltimaPhoenix — devcoach, the progressive technical coach for Claude Code.";

export function readPluginManifest() {
  return JSON.parse(readFileSync(join(root, "plugin", ".claude-plugin", "plugin.json"), "utf8"));
}

/** Build the devcoach marketplace entry for `version`, pointing at `source`. */
export function devcoachEntry(version, source) {
  const { name, description, author, homepage, repository, license, keywords } =
    readPluginManifest();
  return {
    name,
    version,
    description,
    author,
    homepage,
    repository,
    license,
    category: MARKETPLACE_CATEGORY,
    keywords,
    tags: MARKETPLACE_TAGS,
    source,
  };
}
