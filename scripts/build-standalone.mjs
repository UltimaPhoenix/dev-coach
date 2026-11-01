// devcoach-<version>-standalone.zip — the one artifact behind every Windows channel: install.ps1
// downloads it, the Scoop bucket points at it, and a plain unzip runs anywhere a Node ≥ 24 is.
// Flat layout (files at the zip root): dist/bin.js (the self-contained bundle), assets/, LICENSE,
// THIRD_PARTY_NOTICES.md, package.json (name + version — install.ps1 reads it) and two launchers
// from scripts/standalone/: devcoach.cmd (cmd.exe / PowerShell) and devcoach (Git Bash). Both
// prefer a node.exe in a sibling `node/` directory — where install.ps1 puts its private Node —
// and fall back to `node` on the PATH (Scoop's nodejs-lts).
//   node scripts/build-standalone.mjs  →  dist-standalone/devcoach-<version>-standalone.zip
// DEVCOACH_DIST_STANDALONE overrides the output directory (tests).
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";
import { assertSelfContained, root, stageSelfContained, version } from "./lib/self-contained.mjs";

const stage = join(root, "dist-standalone", "stage");
const out = process.env.DEVCOACH_DIST_STANDALONE ?? join(root, "dist-standalone");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
stageSelfContained(stage);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(stage, "package.json"),
  `${JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      license: pkg.license,
      homepage: pkg.homepage,
      type: "module",
      bin: { devcoach: "dist/bin.js" },
      engines: pkg.engines,
    },
    null,
    2,
  )}\n`,
);
assertSelfContained(stage, "standalone bundle");

// The launchers: devcoach.cmd keeps its CRLF line endings (cmd.exe misreads LF in a few label
// and parenthesis cases), the sh one is marked executable in the zip (Unix external attributes).
const read = (p) => new Uint8Array(readFileSync(p));
const files = {};
const collect = (dir, arc) => {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const path = arc ? `${arc}/${entry}` : entry;
    if (statSync(abs).isDirectory()) collect(abs, path);
    else files[path] = read(abs);
  }
};
collect(stage, "");
files["devcoach.cmd"] = read(join(root, "scripts", "standalone", "devcoach.cmd"));
files.devcoach = [
  read(join(root, "scripts", "standalone", "devcoach")),
  { attrs: 0o100755 << 16, os: 3 },
];

mkdirSync(out, { recursive: true });
const file = join(out, `devcoach-${version}-standalone.zip`);
writeFileSync(file, zipSync(files, { level: 9 }));
console.log(`packed ${relative(root, file)} (${Object.keys(files).length} files)`);
