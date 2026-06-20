import { readFileSync } from "node:fs";
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

  it("bundled SKILL.md is identical to assets/SKILL.md (single source of truth)", () => {
    expect(read("plugin", "skills", "devcoach", "SKILL.md")).toBe(read("assets", "SKILL.md"));
  });

  it("self-marketplace points at ./plugin", () => {
    const market = readJson(".claude-plugin", "marketplace.json");
    expect(market.name).toBe("devcoach");
    const entry = market.plugins.find((p: { name: string }) => p.name === "devcoach");
    expect(entry).toBeDefined();
    expect(entry.source).toBe("./plugin");
  });

  it("registers the devcoach MCP server over stdio via pinned node install", () => {
    const mcp = readJson("plugin", ".mcp.json");
    const server = mcp.mcpServers.devcoach;
    expect(server.type).toBe("stdio");
    expect(server.command).toBe("node");
    expect(server.args).toEqual(["${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs", "mcp"]);
  });

  it("ships both Stop hooks (onboard-hook + lesson-ready)", () => {
    const { hooks } = readJson("plugin", "hooks", "hooks.json");
    const commands = (hooks.Stop as { hooks: { command: string }[] }[]).flatMap((e) =>
      e.hooks.map((h) => h.command),
    );
    expect(commands.some((c) => c.includes("onboard-hook"))).toBe(true);
    expect(commands.some((c) => c.includes("lesson-ready"))).toBe(true);
  });
});
