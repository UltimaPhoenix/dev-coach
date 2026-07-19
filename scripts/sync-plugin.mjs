// Keep the Claude Code plugin (plugin/) and the Gemini CLI extension (gemini-extension/)
// in sync with the repo's single sources of truth:
//   • plugin/.claude-plugin/plugin.json  version  ←  package.json version
//   • plugin/skills/devcoach/            ←  assets/SKILL.md + assets/references/
//   • gemini-extension/gemini-extension.json  version  ←  package.json version
//   • gemini-extension/skills/devcoach/  ←  assets/SKILL.md + assets/references/
//   • both package.json pins             ←  package.json version
// Idempotent: writing the same content twice is a no-op. Run it in the bump job and before packing.
//   node scripts/sync-plugin.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// 1. Sync the plugin manifest version with an in-place regex edit (same approach as the mcpb manifest
//    in the bump job) so the file keeps its Biome formatting — a full reserialize would fight Biome.
const manifestPath = join(root, "plugin", ".claude-plugin", "plugin.json");
const manifest = readFileSync(manifestPath, "utf8");
writeFileSync(manifestPath, manifest.replace(/"version": "[^"]+"/, `"version": "${version}"`));

// 2. Copy the coaching skill verbatim (single source of truth: assets/SKILL.md +
//    assets/references/ for progressive disclosure).
const skillDir = join(root, "plugin", "skills", "devcoach");
mkdirSync(skillDir, { recursive: true });
cpSync(join(root, "assets", "SKILL.md"), join(skillDir, "SKILL.md"));
rmSync(join(skillDir, "references"), { recursive: true, force: true });
cpSync(join(root, "assets", "references"), join(skillDir, "references"), { recursive: true });

// 3. Pin the published devcoach version the plugin installs at runtime (scripts/launch.mjs) to this
//    release — same in-place regex approach, so a version bump re-triggers the launcher's npm install.
const pluginPkgPath = join(root, "plugin", "package.json");
const pluginPkg = readFileSync(pluginPkgPath, "utf8");
writeFileSync(pluginPkgPath, pluginPkg.replace(/"devcoach": "[^"]+"/, `"devcoach": "${version}"`));

// 4. Same three steps for the Gemini CLI extension (manifest version, skill copy, runtime pin).
const extManifestPath = join(root, "gemini-extension", "gemini-extension.json");
const extManifest = readFileSync(extManifestPath, "utf8");
writeFileSync(
  extManifestPath,
  extManifest.replace(/"version": "[^"]+"/, `"version": "${version}"`),
);
const extSkillDir = join(root, "gemini-extension", "skills", "devcoach");
mkdirSync(extSkillDir, { recursive: true });
cpSync(join(root, "assets", "SKILL.md"), join(extSkillDir, "SKILL.md"));
rmSync(join(extSkillDir, "references"), { recursive: true, force: true });
cpSync(join(root, "assets", "references"), join(extSkillDir, "references"), { recursive: true });
const extPkgPath = join(root, "gemini-extension", "package.json");
const extPkg = readFileSync(extPkgPath, "utf8");
writeFileSync(extPkgPath, extPkg.replace(/"devcoach": "[^"]+"/, `"devcoach": "${version}"`));

console.log(
  `synced plugin + gemini-extension → version ${version}, SKILL.md copied, devcoach pinned`,
);
