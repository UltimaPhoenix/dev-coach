// Pin the devcoach entry of the BETA marketplace (UltimaPhoenix/claude-plugins-marketplace-beta) to
// a canary build: the plugin zip of the rolling `next` prerelease, as an `archive` source with its
// sha256 — the zip is the only artifact whose launcher pins the canary npm version (the pin is made
// in the runner and never committed). Same surgical merge as update-marketplace.mjs.
// Usage: node scripts/update-beta-marketplace.mjs <version> <zip-url> <sha256> <marketplace.json>
import {
  BETA_MARKETPLACE_DESCRIPTION,
  BETA_MARKETPLACE_NAME,
  devcoachBetaEntry,
  mergeMarketplaceEntry,
} from "./marketplace-entry.mjs";

const [version, url, sha256, file] = process.argv.slice(2);
if (!version || !url || !sha256 || !file) {
  console.error(
    "usage: node scripts/update-beta-marketplace.mjs <version> <zip-url> <sha256> <marketplace.json>",
  );
  process.exit(1);
}
if (!/^https:\/\//.test(url) || !/^[0-9a-f]{64}$/i.test(sha256)) {
  console.error("update-beta-marketplace: the zip URL must be https and the sha256 64 hex chars");
  process.exit(1);
}

mergeMarketplaceEntry(file, devcoachBetaEntry(version, url, sha256.toLowerCase()), {
  name: BETA_MARKETPLACE_NAME,
  description: BETA_MARKETPLACE_DESCRIPTION,
});
console.log(`updated ${file} → devcoach ${version} (beta, ${url})`);
