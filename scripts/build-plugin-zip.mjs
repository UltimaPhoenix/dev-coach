// Pack the Claude Code plugin into downloadable zips — two layouts, one payload:
//
//   dist-plugin/devcoach-plugin-<version>.zip          offline install (release vector C): a
//       self-contained marketplace — .claude-plugin/marketplace.json (source "./plugin") at the
//       root + the plugin/ payload, so after `unzip` a user runs `/plugin marketplace add <dir>`.
//   dist-plugin/devcoach-plugin-archive-<version>.zip  the plugin ROOT at the top of the zip
//       (.claude-plugin/plugin.json, hooks/, .mcp.json, skills/, …): the shape an `archive`
//       marketplace source expects. The beta marketplace pins this one to each canary — the
//       marketplace layout above is NOT a plugin archive (its root has no plugin.json), which
//       once left the beta plugin installed but inert.
//
// Run `node scripts/sync-plugin.mjs` first (the plugin:zip npm script does).
// DEVCOACH_DIST_PLUGIN overrides the output directory (tests).
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// Collect files into flat { "archive/path": Uint8Array } maps (fflate's zipSync shape).
const read = (absPath) => new Uint8Array(readFileSync(absPath));
const collect = (absDir, archiveDir, into) => {
  for (const entry of readdirSync(absDir)) {
    const abs = join(absDir, entry);
    const arc = archiveDir ? `${archiveDir}/${entry}` : entry;
    if (statSync(abs).isDirectory()) collect(abs, arc, into);
    else into[arc] = read(abs);
  }
  return into;
};

const pluginRoot = collect(join(root, "plugin"), "", {});
const marketplace = {
  ".claude-plugin/marketplace.json": read(join(root, ".claude-plugin", "marketplace.json")),
};
for (const [path, bytes] of Object.entries(pluginRoot)) marketplace[`plugin/${path}`] = bytes;

const out = process.env.DEVCOACH_DIST_PLUGIN ?? join(root, "dist-plugin");
mkdirSync(out, { recursive: true });
for (const [name, files] of [
  [`devcoach-plugin-${version}.zip`, marketplace],
  [`devcoach-plugin-archive-${version}.zip`, pluginRoot],
]) {
  const file = join(out, name);
  writeFileSync(file, zipSync(files, { level: 9 }));
  console.log(`packed ${relative(root, file)} (${Object.keys(files).length} files)`);
}
