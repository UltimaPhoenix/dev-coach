// Surgically update the devcoach entry in the aggregator marketplace ("tap") repo's marketplace.json.
// The file is SHARED across every UltimaPhoenix plugin, so we merge — never regenerate — to avoid
// clobbering other plugins' entries. Idempotent: re-running with the same args is a no-op.
// Usage: node scripts/update-marketplace.mjs <version> <ref> <path-to-marketplace.json>
//   e.g. node scripts/update-marketplace.mjs 0.3.63 v0.3.63 mkt/.claude-plugin/marketplace.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { devcoachEntry, MARKETPLACE_DESCRIPTION, MARKETPLACE_OWNER } from "./marketplace-entry.mjs";

const [version, ref, file] = process.argv.slice(2);
if (!version || !ref || !file) {
  console.error("usage: node scripts/update-marketplace.mjs <version> <ref> <marketplace.json>");
  process.exit(1);
}

// Entry metadata comes from plugin/.claude-plugin/plugin.json (see marketplace-entry.mjs); only
// the source is specific to the public marketplace: the tagged plugin/ subdir of this repo.
const entry = devcoachEntry(version, {
  source: "git-subdir",
  url: "https://github.com/UltimaPhoenix/dev-coach.git",
  path: "plugin",
  ref,
});

// Read the existing catalog, or scaffold an empty one (first run against the empty tap repo).
let market;
if (existsSync(file)) {
  market = JSON.parse(readFileSync(file, "utf8"));
} else {
  market = { name: "ultimaphoenix", plugins: [] };
}
// Marketplace-level metadata: fill in what's missing, never overwrite what the tap repo chose
// (`claude plugin validate --strict` warns on a marketplace without a description).
market.description ??= MARKETPLACE_DESCRIPTION;
market.owner ??= { ...MARKETPLACE_OWNER };
market.owner.url ??= MARKETPLACE_OWNER.url;
market.plugins ??= [];
// Canonical key order (name, description, owner, …) — a spread keeps the first position per key.
market = { name: market.name, description: market.description, owner: market.owner, ...market };

// Update only the devcoach entry; leave every other plugin untouched.
const i = market.plugins.findIndex((p) => p?.name === "devcoach");
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
console.log(`updated ${file} → devcoach ${version} (ref ${ref})`);
