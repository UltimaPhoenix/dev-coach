// The devcoach entry for a Claude Code plugin marketplace, from a single source of truth.
// The metadata Claude Code shows in the plugin browser (description, author, homepage, repository,
// license, keywords) is read from plugin/.claude-plugin/plugin.json; `category` and `tags` are
// marketplace-only fields (plugin.json's strict validation rejects them there) and live here.
// Used by update-marketplace.mjs for the public UltimaPhoenix marketplace; tests/plugin.test.ts
// holds the hand-maintained self-marketplace (.claude-plugin/marketplace.json) to the same shape.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Vocabulary of the official Anthropic marketplace (development, productivity, learning, …).
export const MARKETPLACE_CATEGORY = "learning";
export const MARKETPLACE_TAGS = ["coaching", "learning", "mcp"];
export const MARKETPLACE_OWNER = { name: "UltimaPhoenix", url: "https://github.com/UltimaPhoenix" };
export const MARKETPLACE_DESCRIPTION =
  "Plugins by UltimaPhoenix — devcoach, the progressive technical coach for Claude Code.";
// The beta channel: a separate marketplace (its own repo), so the plugin keeps its name — the
// beta installs as devcoach@ultimaphoenix-beta with the same tools, commands and skill as the
// release, and users switch by enabling one of the two.
export const BETA_MARKETPLACE_NAME = "ultimaphoenix-beta";
export const BETA_MARKETPLACE_DESCRIPTION =
  "Beta channel of UltimaPhoenix's plugins — devcoach canaries built from develop, unreleased, may break.";
export const BETA_MARKETPLACE_TAGS = [...MARKETPLACE_TAGS, "beta"];

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

/** The beta entry: the canary's plugin zip (an `archive` source, pinned by URL + sha256). */
export function devcoachBetaEntry(version, url, sha256) {
  return {
    ...devcoachEntry(version, { source: "archive", url, sha256 }),
    tags: BETA_MARKETPLACE_TAGS,
  };
}

/**
 * Surgically merge `entry` into a marketplace catalog file: updates only the plugin with the
 * same name, leaves every other plugin untouched, scaffolds the catalog on first run (with
 * `defaults` for the marketplace-level fields) and never overwrites what the tap repo chose.
 * Idempotent.
 */
export function mergeMarketplaceEntry(file, entry, defaults) {
  let market;
  if (existsSync(file)) {
    market = JSON.parse(readFileSync(file, "utf8"));
  } else {
    market = { name: defaults.name, plugins: [] };
  }
  market.description ??= defaults.description;
  market.owner ??= { ...MARKETPLACE_OWNER };
  market.owner.url ??= MARKETPLACE_OWNER.url;
  market.plugins ??= [];
  // Canonical key order (name, description, owner, …) — a spread keeps the first position per key.
  market = { name: market.name, description: market.description, owner: market.owner, ...market };

  const i = market.plugins.findIndex((p) => p?.name === entry.name);
  if (i === -1) {
    market.plugins.push(entry);
  } else {
    // Canonical entry first, then any extra keys the tap repo added by hand.
    const extras = Object.fromEntries(
      Object.entries(market.plugins[i]).filter(([key]) => !(key in entry)),
    );
    market.plugins[i] = { ...entry, ...extras };
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(market, null, 2)}\n`);
}
