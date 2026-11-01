import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

// Repo root = tests/ → ..  (these are static repo files, not runtime code).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const readJson = (...p: string[]) => JSON.parse(read(...p));

/** Unix mode of a zip entry, read from the central directory's external attributes (0 when not Unix). */
function zipMode(zip: Buffer, name: string): number {
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let at = zip.indexOf(signature); at !== -1; ) {
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const os = zip[at + 5] ?? 0; // "version made by", high byte: 3 = Unix
    const attrs = zip.readUInt32LE(at + 38);
    if (zip.subarray(at + 46, at + 46 + nameLength).toString("utf8") === name) {
      return os === 3 ? (attrs >>> 16) & 0o7777 : 0;
    }
    at = zip.indexOf(signature, at + 46 + nameLength + extraLength + commentLength);
  }
  return 0;
}

describe("claude code plugin packaging", () => {
  it("plugin manifest version matches package.json (run `npm run plugin:sync`)", () => {
    const pkg = readJson("package.json");
    const manifest = readJson("plugin", ".claude-plugin", "plugin.json");
    expect(manifest.name).toBe("devcoach");
    expect(manifest.version).toBe(pkg.version);
  });

  it("plugin manifest satisfies Claude Code's schema (`claude plugin validate`)", () => {
    const manifest = readJson("plugin", ".claude-plugin", "plugin.json");
    // `repository` must be a plain URL string. Up to v1.0.1 it was the npm-style {type, url}
    // object, which Claude Code's validator rejects — so every marketplace install failed with
    // "repository: Invalid input: expected string, received object". CI also runs the real
    // validator (--strict) so the next schema drift fails the build, not the install.
    expect(manifest.repository).toBe("https://github.com/UltimaPhoenix/dev-coach");
    expect(manifest.description).toEqual(expect.any(String));
    expect(manifest.author).toEqual({ name: "UltimaPhoenix", url: expect.any(String) });
    expect(manifest.homepage).toMatch(/^https:\/\//);
    expect(manifest.license).toEqual(expect.any(String));
    expect(manifest.keywords).toEqual(expect.arrayContaining(["skills"]));
    expect(manifest.keywords).not.toContain("mcp");
    expect(manifest.description).not.toMatch(/MCP/); // the plugin bundles the CLI, not a server
  });

  it("bundled skill dir is identical to assets/ (single source of truth)", () => {
    expect(read("plugin", "skills", "devcoach", "SKILL.md")).toBe(read("assets", "SKILL.md"));
    for (const ref of readdirSync(join(root, "assets", "references"))) {
      expect(read("plugin", "skills", "devcoach", "references", ref)).toBe(
        read("assets", "references", ref),
      );
    }
  });

  it("self-marketplace points at ./plugin", () => {
    const market = readJson(".claude-plugin", "marketplace.json");
    expect(market.name).toBe("devcoach");
    const entry = market.plugins.find((p: { name: string }) => p.name === "devcoach");
    expect(entry).toBeDefined();
    expect(entry.source).toBe("./plugin");
    // `claude plugin validate --strict` (run in CI) warns on a marketplace without one.
    expect(market.description).toEqual(expect.any(String));
  });

  it("self-marketplace entry mirrors plugin.json metadata + the marketplace-only fields", () => {
    const pkg = readJson("package.json");
    const manifest = readJson("plugin", ".claude-plugin", "plugin.json");
    const market = readJson(".claude-plugin", "marketplace.json");
    const entry = market.plugins.find((p: { name: string }) => p.name === "devcoach");
    expect(market.owner).toEqual({ name: "UltimaPhoenix", url: expect.stringMatching(/^https/) });
    // Pinned by `npm run plugin:sync` like every other manifest.
    expect(entry.version).toBe(pkg.version);
    // What Claude Code shows in the plugin browser comes from plugin.json — never diverge.
    for (const key of ["description", "author", "homepage", "repository", "license", "keywords"]) {
      expect(entry[key], key).toEqual(manifest[key]);
    }
    // category/tags belong to the marketplace entry only (plugin.json rejects them in strict mode).
    expect(entry.category).toBe("learning");
    expect(entry.tags).toEqual(expect.arrayContaining(["coaching", "skills"]));
  });

  it("build-plugin-zip.mjs packs the offline-marketplace zip AND a plugin-root zip for archive sources", () => {
    const dist = mkdtempSync(join(tmpdir(), "devcoach-zip-"));
    execFileSync(process.execPath, [join(root, "scripts", "build-plugin-zip.mjs")], {
      env: { ...process.env, DEVCOACH_DIST_PLUGIN: dist },
      stdio: "pipe",
    });
    const version = readJson("package.json").version;
    const bytes = (name: string) => readFileSync(join(dist, name));
    const entries = (name: string) => Object.keys(unzipSync(bytes(name)));
    const offline = entries(`devcoach-plugin-${version}.zip`);
    expect(offline).toContain(".claude-plugin/marketplace.json");
    expect(offline).toContain("plugin/.claude-plugin/plugin.json");
    expect(offline).toContain("plugin/hooks/hooks.json");
    // The archive layout: the plugin root at the top, no marketplace manifest, no plugin/ prefix.
    const archive = entries(`devcoach-plugin-archive-${version}.zip`);
    for (const path of [
      ".claude-plugin/plugin.json",
      "bin/devcoach",
      "hooks/hooks.json",
      "scripts/launch.mjs",
      "scripts/launch.config.json",
      "skills/devcoach/SKILL.md",
      "commands/course.md",
      "commands/setup.md",
      "package.json",
    ]) {
      expect(archive, path).toContain(path);
    }
    expect(archive).not.toContain(".mcp.json"); // the plugin is no MCP server any more
    expect(archive.some((p) => p.startsWith("plugin/"))).toBe(false);
    expect(archive.some((p) => p.endsWith("marketplace.json"))).toBe(false);
    expect(archive).toHaveLength(offline.length - 1);
    // bin/devcoach must come out of the zip executable: it is the `devcoach` command on the Bash
    // tool's PATH, and an unzip only keeps the bit when the entry carries Unix attributes.
    const archiveZip = bytes(`devcoach-plugin-archive-${version}.zip`);
    expect(zipMode(archiveZip, "bin/devcoach") & 0o111).not.toBe(0);
    expect(zipMode(archiveZip, "hooks/hooks.json") & 0o111).toBe(0);
    expect(
      zipMode(bytes(`devcoach-plugin-${version}.zip`), "plugin/bin/devcoach") & 0o111,
    ).not.toBe(0);
  });

  it("update-beta-marketplace.mjs pins the canary zip (archive + sha256) in the beta catalog", () => {
    const manifest = readJson("plugin", ".claude-plugin", "plugin.json");
    const dir = mkdtempSync(join(tmpdir(), "devcoach-beta-mkt-"));
    const file = join(dir, ".claude-plugin", "marketplace.json");
    const sha = "a".repeat(64);
    const url =
      "https://github.com/UltimaPhoenix/dev-coach/releases/download/next/devcoach-plugin-archive-9.9.0-next.1.gabc1234.zip";
    const args = [
      join(root, "scripts", "update-beta-marketplace.mjs"),
      "9.9.0-next.1.gabc1234",
      url,
      sha,
      file,
    ];
    execFileSync(process.execPath, args); // scaffolds the catalog on first run
    execFileSync(process.execPath, args); // idempotent
    const market = JSON.parse(readFileSync(file, "utf8"));
    expect(market.name).toBe("ultimaphoenix-beta");
    expect(market.description).toContain("canaries");
    expect(market.owner.name).toBe("UltimaPhoenix");
    expect(market.plugins).toHaveLength(1);
    expect(market.plugins[0]).toMatchObject({
      name: "devcoach", // same plugin name: installs as devcoach@ultimaphoenix-beta
      version: "9.9.0-next.1.gabc1234",
      description: manifest.description,
      tags: expect.arrayContaining(["beta"]),
      source: { source: "archive", url, sha256: sha },
    });
    expect(() =>
      execFileSync(process.execPath, [args[0], "1.0.0", "http://insecure", sha, file], {
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("update-marketplace.mjs enriches only the devcoach entry of the shared tap catalog", () => {
    const manifest = readJson("plugin", ".claude-plugin", "plugin.json");
    const dir = mkdtempSync(join(tmpdir(), "devcoach-mkt-"));
    const file = join(dir, ".claude-plugin", "marketplace.json");
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        name: "ultimaphoenix",
        owner: { name: "UltimaPhoenix" },
        plugins: [
          { name: "other", description: "untouched", source: "./other" },
          { name: "devcoach", version: "0.3.63", description: "old", source: { source: "git" } },
        ],
      }),
    );
    execFileSync(process.execPath, [
      join(root, "scripts", "update-marketplace.mjs"),
      "9.9.9",
      "v9.9.9",
      file,
    ]);
    const market = JSON.parse(readFileSync(file, "utf8"));
    expect(market.plugins[0]).toEqual({
      name: "other",
      description: "untouched",
      source: "./other",
    });
    expect(market.plugins[1]).toEqual({
      name: "devcoach",
      version: "9.9.9",
      description: manifest.description,
      author: manifest.author,
      homepage: manifest.homepage,
      repository: manifest.repository,
      license: manifest.license,
      category: "learning",
      keywords: manifest.keywords,
      tags: expect.arrayContaining(["coaching"]),
      source: {
        source: "git-subdir",
        url: "https://github.com/UltimaPhoenix/dev-coach.git",
        path: "plugin",
        ref: "v9.9.9",
      },
    });
    // Marketplace-level metadata is filled in when missing, never overwritten.
    expect(market.description).toEqual(expect.any(String));
    expect(market.owner).toEqual({
      name: "UltimaPhoenix",
      url: "https://github.com/UltimaPhoenix",
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("ships the AGPL license text with the plugin (synced from LICENSE)", () => {
    expect(read("plugin", "LICENSE")).toBe(read("LICENSE"));
  });

  it("ships no MCP server: no .mcp.json, and the launcher config names the `devcoach` command", () => {
    expect(readdirSync(join(root, "plugin"))).not.toContain(".mcp.json");
    // What the hook cues tell the model to run (the launcher exports it as DEVCOACH_COMMAND).
    expect(readJson("plugin", "scripts", "launch.config.json").command).toBe("devcoach");
  });

  it("ships bin/devcoach — the `devcoach` command on the Bash tool's PATH while the plugin is enabled", () => {
    const shim = read("plugin", "bin", "devcoach");
    expect(shim.startsWith("#!/bin/sh\n")).toBe(true);
    expect(shim).toContain('exec node "$(dirname "$0")/../scripts/launch.mjs" "$@"');
    expect(statSync(join(root, "plugin", "bin", "devcoach")).mode & 0o111).not.toBe(0);
  });

  // The model drives devcoach through `devcoach api …` in the Bash tool: every command
  // pre-approves exactly that prefix for its turn, and nothing wider.
  it.each([
    ["ui", ["open_ui", "stop_ui"]],
    ["share", ["share_lesson", "get_lessons"]],
    ["import", ["import_lesson", "add_topic"]],
    ["course", ["create_course", "add_course_step", "update_course_progress", "get_courses"]],
    ["setup", ["get_onboarding", "complete_onboarding", "get_profile"]],
  ])(
    "ships the /devcoach:%s command, pre-approving `devcoach api` for its operations",
    (name, ops) => {
      const cmd = read("plugin", "commands", `${name}.md`);
      expect(cmd).toMatch(/^---\ndescription: .+/);
      const allowed = cmd.match(/^allowed-tools: (.+)$/m)?.[1] ?? "";
      expect(allowed).toContain("Bash(devcoach *)");
      expect(allowed).not.toContain("mcp__");
      // `Bash(node:*)` pre-approved EVERY node command; `Bash(node */launch.mjs *)` would too
      // (everything before the first `*` is the prefix). Only the launcher's exact path may be.
      expect(allowed).not.toMatch(/Bash\(node:\*\)|Bash\(node \*/);
      for (const op of ops) expect(cmd.split("---")[2]).toContain(op);
    },
  );

  // /devcoach:setup is the explicit way in when coaching never started: it must check the
  // runtime FIRST (through the launcher, which can diagnose itself when devcoach cannot load),
  // then the command, and only then run onboarding — from the skill's one flow, not a copy.
  it("/devcoach:setup checks runtime → command → profile, in that order", () => {
    const cmd = read("plugin", "commands", "setup.md");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder, not a template
    expect(cmd).toContain('node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" doctor');
    const allowed = cmd.match(/^allowed-tools: (.+)$/m)?.[1] ?? "";
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder, not a template
    expect(allowed).toContain("Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs *)");
    expect(allowed).toContain("Bash(devcoach *)");
    const order = ["**Runtime.**", "**Command.**", "**Profile.**"].map((s) => cmd.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(cmd).toContain("devcoach api get_onboarding");
    expect(cmd).toContain("references/onboarding.md");
    expect(cmd).not.toContain("/mcp");
    expect(cmd).not.toContain("**Server.**");
  });

  it("ships the merged stop-hook + prompt-hook, each with a timeout", () => {
    const { hooks } = readJson("plugin", "hooks", "hooks.json");
    type Entry = { hooks: { command: string; timeout?: number }[] };
    const stop = (hooks.Stop as Entry[]).flatMap((e) => e.hooks);
    expect(stop).toHaveLength(1);
    expect(stop[0].command).toContain("stop-hook");
    expect(stop[0].timeout).toBe(60);
    const prompt = (hooks.UserPromptSubmit as Entry[]).flatMap((e) => e.hooks);
    expect(prompt).toHaveLength(1);
    expect(prompt[0].command).toContain("prompt-hook");
    expect(prompt[0].timeout).toBe(30);
  });
});
