import { readdirSync, readFileSync } from "node:fs";
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
