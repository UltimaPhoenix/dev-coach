// Surgically update the devcoach entry in the aggregator marketplace ("tap") repo's marketplace.json.
// The file is SHARED across every UltimaPhoenix plugin, so we merge — never regenerate — to avoid
// clobbering other plugins' entries. Idempotent: re-running with the same args is a no-op.
// Usage: node scripts/update-marketplace.mjs <version> <ref> <path-to-marketplace.json>
//   e.g. node scripts/update-marketplace.mjs 0.3.63 v0.3.63 mkt/.claude-plugin/marketplace.json
import {
  devcoachEntry,
  MARKETPLACE_DESCRIPTION,
  mergeMarketplaceEntry,
} from "./marketplace-entry.mjs";

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
mergeMarketplaceEntry(file, entry, { name: "ultimaphoenix", description: MARKETPLACE_DESCRIPTION });
console.log(`updated ${file} → devcoach ${version} (ref ${ref})`);
