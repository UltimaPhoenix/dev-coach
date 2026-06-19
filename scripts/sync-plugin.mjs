// Keep the Claude Code plugin (plugin/) in sync with the repo's single sources of truth:
//   • plugin/.claude-plugin/plugin.json  version  ←  package.json version
//   • plugin/skills/devcoach/SKILL.md             ←  assets/SKILL.md
// Idempotent: writing the same content twice is a no-op. Run it in the bump job and before packing.
//   node scripts/sync-plugin.mjs
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// 1. Sync the plugin manifest version with an in-place regex edit (same approach as the mcpb manifest
//    in the bump job) so the file keeps its Biome formatting — a full reserialize would fight Biome.
const manifestPath = join(root, "plugin", ".claude-plugin", "plugin.json");
const manifest = readFileSync(manifestPath, "utf8");
writeFileSync(manifestPath, manifest.replace(/"version": "[^"]+"/, `"version": "${version}"`));

// 2. Copy the coaching skill verbatim (single source of truth: assets/SKILL.md).
const skillDest = join(root, "plugin", "skills", "devcoach", "SKILL.md");
mkdirSync(dirname(skillDest), { recursive: true });
cpSync(join(root, "assets", "SKILL.md"), skillDest);

console.log(`synced plugin → version ${version}, SKILL.md copied`);
