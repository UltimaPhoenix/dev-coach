// Pack the Gemini CLI extension into a release archive. Gemini's release-based install
// flow (`gemini extensions install <repo-url>`) prefers a GitHub Release asset over a
// clone when one is attached; the manifest must sit at the ROOT of the archive, so the
// zip holds gemini-extension/'s contents directly (not the directory itself).
// Run `node scripts/sync-plugin.mjs` first (the gemini:zip npm script does).
//   → dist-gemini/devcoach-gemini-extension-<version>.zip
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const files = {};
const addTree = (absDir, archiveDir) => {
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    const arc = archiveDir ? `${archiveDir}/${entry}` : entry;
    if (statSync(abs).isDirectory()) addTree(abs, arc);
    else files[arc] = new Uint8Array(readFileSync(abs));
  }
};

addTree(join(root, "gemini-extension"), "");

const out = join(root, "dist-gemini");
mkdirSync(out, { recursive: true });
const file = join(out, `devcoach-gemini-extension-${version}.zip`);
writeFileSync(file, zipSync(files, { level: 9 }));
console.log(`packed ${relative(root, file)} (${Object.keys(files).length} files)`);
