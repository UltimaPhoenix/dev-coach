// Pack the Claude Code plugin into a downloadable, offline-installable zip (release vector C).
// The archive is a self-contained marketplace: its root holds .claude-plugin/marketplace.json (source
// "./plugin") + the plugin/ payload, so after `unzip` a user runs `/plugin marketplace add <dir>`.
// Run `node scripts/sync-plugin.mjs` first (the plugin:zip npm script does).
//   → dist-plugin/devcoach-plugin-<version>.zip
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// Collect files into a flat { "archive/path": Uint8Array } map (fflate's zipSync shape).
const files = {};
const addFile = (absPath, archivePath) => {
  files[archivePath] = new Uint8Array(readFileSync(absPath));
};
const addTree = (absDir, archiveDir) => {
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    const arc = `${archiveDir}/${entry}`;
    if (statSync(abs).isDirectory()) addTree(abs, arc);
    else addFile(abs, arc);
  }
};

// The self-marketplace catalog at the archive root + the whole plugin/ payload.
addFile(join(root, ".claude-plugin", "marketplace.json"), ".claude-plugin/marketplace.json");
addTree(join(root, "plugin"), "plugin");

const out = join(root, "dist-plugin");
mkdirSync(out, { recursive: true });
const file = join(out, `devcoach-plugin-${version}.zip`);
writeFileSync(file, zipSync(files, { level: 9 }));
console.log(`packed ${relative(root, file)} (${Object.keys(files).length} files)`);
