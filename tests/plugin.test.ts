import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo root = tests/ → ..  (these are static repo files, not runtime code).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const readJson = (...p: string[]) => JSON.parse(read(...p));

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
    expect(manifest.keywords).toEqual(expect.arrayContaining(["mcp"]));
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
    expect(entry.tags).toEqual(expect.arrayContaining(["coaching", "mcp"]));
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

  it("registers the devcoach MCP server over stdio via pinned node install", () => {
    const mcp = readJson("plugin", ".mcp.json");
    const server = mcp.mcpServers.devcoach;
    expect(server.type).toBe("stdio");
    expect(server.command).toBe("node");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: literal plugin-root placeholder, not a template
    expect(server.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs", "mcp"]);
  });

  it("ships the /devcoach:ui command wired to the open_ui tool", () => {
    const cmd = read("plugin", "commands", "ui.md");
    expect(cmd).toMatch(/^---\ndescription: .+/);
    // Plugin MCP tools are namespaced mcp__plugin_<plugin>_<server>__<tool>; the bare
    // mcp__devcoach__ name only exists when devcoach is wired as a plain MCP server.
    expect(cmd).toContain("allowed-tools: mcp__plugin_devcoach_devcoach__open_ui");
    expect(cmd).toContain("open_ui");
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
