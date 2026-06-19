// Surgically update the devcoach entry in the aggregator marketplace ("tap") repo's marketplace.json.
// The file is SHARED across every UltimaPhoenix plugin, so we merge — never regenerate — to avoid
// clobbering other plugins' entries. Idempotent: re-running with the same args is a no-op.
// Usage: node scripts/update-marketplace.mjs <version> <ref> <path-to-marketplace.json>
//   e.g. node scripts/update-marketplace.mjs 0.3.63 v0.3.63 mkt/.claude-plugin/marketplace.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [version, ref, file] = process.argv.slice(2);
if (!version || !ref || !file) {
  console.error("usage: node scripts/update-marketplace.mjs <version> <ref> <marketplace.json>");
  process.exit(1);
}

const DEVCOACH_ENTRY = {
  name: "devcoach",
  version,
  description: "Progressive technical coach: auto lessons, knowledge map, Stop hooks.",
  source: {
    source: "git-subdir",
    url: "https://github.com/UltimaPhoenix/dev-coach.git",
    path: "plugin",
    ref,
  },
};

// Read the existing catalog, or scaffold an empty one (first run against the empty tap repo).
let market;
if (existsSync(file)) {
  market = JSON.parse(readFileSync(file, "utf8"));
} else {
  market = {
    name: "ultimaphoenix",
    owner: { name: "UltimaPhoenix", url: "https://github.com/UltimaPhoenix" },
    plugins: [],
  };
}
market.plugins ??= [];

// Update only the devcoach entry; leave every other plugin untouched.
const i = market.plugins.findIndex((p) => p?.name === "devcoach");
if (i === -1) {
  market.plugins.push(DEVCOACH_ENTRY);
} else {
  market.plugins[i] = { ...market.plugins[i], ...DEVCOACH_ENTRY };
}

mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, `${JSON.stringify(market, null, 2)}\n`);
console.log(`updated ${file} → devcoach ${version} (ref ${ref})`);
