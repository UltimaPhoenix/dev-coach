import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Repo root = tests/ → ..  (these are static repo files, not runtime code).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const readJson = (...p: string[]) => JSON.parse(read(...p));

describe("gemini cli extension packaging (beta)", () => {
  it("extension manifest version matches package.json (run `npm run plugin:sync`)", () => {
    const pkg = readJson("package.json");
    const manifest = readJson("gemini-extension", "gemini-extension.json");
    expect(manifest.name).toBe("devcoach");
    expect(manifest.version).toBe(pkg.version);
  });

  it("bundled skill dir is identical to assets/ (single source of truth)", () => {
    expect(read("gemini-extension", "skills", "devcoach", "SKILL.md")).toBe(
      read("assets", "SKILL.md"),
    );
    for (const ref of readdirSync(join(root, "assets", "references"))) {
      expect(read("gemini-extension", "skills", "devcoach", "references", ref)).toBe(
        read("assets", "references", ref),
      );
    }
  });

  it("registers the devcoach MCP server via the pinned node install", () => {
    const manifest = readJson("gemini-extension", "gemini-extension.json");
    const server = manifest.mcpServers.devcoach;
    expect(server.command).toBe("node");
    expect(server.args).toEqual(["${extensionPath}/scripts/launch.mjs", "mcp"]);
  });

  it("ships the AfterAgent + BeforeAgent hooks with Gemini's millisecond timeouts", () => {
    const { hooks } = readJson("gemini-extension", "hooks", "hooks.json");
    type Entry = { hooks: { command: string; timeout?: number }[] };
    const stop = (hooks.AfterAgent as Entry[]).flatMap((e) => e.hooks);
    expect(stop).toHaveLength(1);
    expect(stop[0].command).toContain("gemini-stop-hook");
    expect(stop[0].timeout).toBe(60000);
    const prime = (hooks.BeforeAgent as Entry[]).flatMap((e) => e.hooks);
    expect(prime).toHaveLength(1);
    expect(prime[0].command).toContain("gemini-prompt-hook");
    expect(prime[0].timeout).toBe(30000);
  });

  it("pins the launcher to the released devcoach version", () => {
    const pkg = readJson("package.json");
    const pin = readJson("gemini-extension", "package.json");
    expect(pin.dependencies.devcoach).toBe(pkg.version);
    // The launcher must install OUTSIDE the extension dir (updates replace it).
    const launcher = read("gemini-extension", "scripts", "launch.mjs");
    expect(launcher).toContain('join(homedir(), ".devcoach", "gemini-ext")');
  });
});
