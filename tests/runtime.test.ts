// Where devcoach runs from, and the startup line that says so. Every case injects platform /
// PATH / home, so macOS, Linux and Windows paths are tested here whatever OS runs the suite.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyPath,
  describeRuntime,
  displayPath,
  nodeManagerOf,
  nodeProblem,
  runtimeLine,
} from "../src/core/runtime";
import { VERSION } from "../src/version";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = (prefix: string) => mkdtempSync(join(tmpdir(), prefix));

describe("classifyPath — where an install lives", () => {
  it.each([
    // [platform, path, channel, manager, boundTo, ephemeral]
    [
      "darwin",
      "/opt/homebrew/Cellar/devcoach/2.6.3/libexec/lib/node_modules/devcoach/dist/bin.js",
      "homebrew",
      null,
      null,
      false,
    ],
    [
      "darwin",
      "/usr/local/Cellar/devcoach/2.6.3/libexec/lib/node_modules/devcoach/dist/bin.js",
      "homebrew",
      null,
      null,
      false,
    ],
    [
      "linux",
      "/home/linuxbrew/.linuxbrew/Cellar/devcoach/2.6.3/libexec/lib/node_modules/devcoach/dist/bin.js",
      "homebrew",
      null,
      null,
      false,
    ],
    ["darwin", "/usr/local/lib/node_modules/devcoach/dist/bin.js", "npm-global", null, null, false],
    ["linux", "/usr/lib/node_modules/devcoach/dist/bin.js", "npm-global", null, null, false],
    [
      "darwin",
      "/Users/a/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "nvm",
      "v26.5.0",
      false,
    ],
    [
      "linux",
      "/home/a/.local/share/fnm/node-versions/v24.1.0/installation/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "fnm",
      "v24.1.0",
      false,
    ],
    [
      "darwin",
      "/Users/a/.volta/tools/image/node/24.2.0/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "volta",
      "v24.2.0",
      false,
    ],
    [
      "linux",
      "/home/a/.asdf/installs/nodejs/24.3.0/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "asdf",
      "v24.3.0",
      false,
    ],
    [
      "linux",
      "/home/a/.local/share/mise/installs/node/24.4.0/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "mise",
      "v24.4.0",
      false,
    ],
    [
      "linux",
      "/usr/local/n/versions/node/24.5.0/lib/node_modules/devcoach/dist/bin.js",
      "npm-global",
      "n",
      "v24.5.0",
      false,
    ],
    [
      "darwin",
      "/Users/a/.npm/_npx/0123abcd/node_modules/devcoach/dist/bin.js",
      "npx",
      null,
      null,
      true,
    ],
    [
      "darwin",
      "/Users/a/.local/state/fnm_multishells/123_456/bin/devcoach",
      "unknown",
      "fnm",
      null,
      true,
    ],
    [
      "darwin",
      "/Users/a/.claude/plugins/data/devcoach-ultimaphoenix/node_modules/devcoach/dist/bin.js",
      "claude-plugin",
      null,
      null,
      false,
    ],
    [
      "darwin",
      "/Users/a/.devcoach/gemini-ext/node_modules/devcoach/dist/bin.js",
      "gemini-extension",
      null,
      null,
      false,
    ],
    [
      "darwin",
      "/Users/a/Library/Application Support/Claude/Claude Extensions/local.mcpb.devcoach/dist/bin.js",
      "claude-desktop-extension",
      null,
      null,
      false,
    ],
    ["darwin", "/Users/a/dev/dev-coach/dist/bin.js", "source", null, null, false],
    [
      "win32",
      "C:\\Users\\A\\AppData\\Roaming\\npm\\node_modules\\devcoach\\dist\\bin.js",
      "npm-global",
      null,
      null,
      false,
    ],
    [
      "win32",
      "C:\\Users\\A\\AppData\\Roaming\\nvm\\v24.6.0\\node_modules\\devcoach\\dist\\bin.js",
      "npm-global",
      "nvm-windows",
      "v24.6.0",
      false,
    ],
    [
      "win32",
      "C:\\Users\\A\\AppData\\Local\\npm-cache\\_npx\\9f8e\\node_modules\\devcoach\\dist\\bin.js",
      "npx",
      null,
      null,
      true,
    ],
    [
      "win32",
      "C:\\Users\\A\\.claude\\plugins\\data\\devcoach-ultimaphoenix\\node_modules\\devcoach\\dist\\bin.js",
      "claude-plugin",
      null,
      null,
      false,
    ],
    [
      "win32",
      "C:\\Users\\A\\AppData\\Roaming\\Claude\\Claude Extensions\\local.mcpb.devcoach\\dist\\bin.js",
      "claude-desktop-extension",
      null,
      null,
      false,
    ],
  ] as const)("%s %s → %s", (platform, path, channel, manager, boundTo, ephemeral) => {
    expect(classifyPath(path, platform)).toEqual({ channel, manager, boundTo, ephemeral });
  });
});

describe("the Node behind it", () => {
  it.each([
    ["darwin", "/opt/homebrew/Cellar/node/26.10.0_1/bin/node", "homebrew"],
    ["darwin", "/usr/local/opt/node/bin/node", "homebrew"],
    ["linux", "/home/linuxbrew/.linuxbrew/bin/node", "homebrew"],
    ["darwin", "/Users/a/.nvm/versions/node/v26.5.0/bin/node", "nvm"],
    [
      "darwin",
      "/Users/a/Library/Application Support/fnm/node-versions/v24.1.0/installation/bin/node",
      "fnm",
    ],
    ["darwin", "/Users/a/.volta/tools/image/node/24.2.0/bin/node", "volta"],
    ["linux", "/usr/bin/node", "system"],
    ["linux", "/snap/node/1234/bin/node", "system"],
    ["win32", "C:\\Program Files\\nodejs\\node.exe", "system"],
    ["win32", "C:\\Users\\A\\AppData\\Roaming\\nvm\\v24.6.0\\node.exe", "nvm-windows"],
    ["darwin", "/somewhere/else/node", "unknown"],
  ] as const)("%s %s → %s", (platform, path, manager) => {
    expect(nodeManagerOf(path, platform)).toBe(manager);
  });

  it("names the Node requirement only when it is not met", () => {
    expect(nodeProblem("24.0.0")).toBeNull();
    expect(nodeProblem("26.10.0")).toBeNull();
    expect(nodeProblem("22.11.0")).toBe(
      `devcoach ${VERSION} needs Node 24 or newer (it uses the built-in node:sqlite); this is Node 22.11.0`,
    );
  });
});

describe("the startup line", () => {
  it("shows the home directory as ~ or %USERPROFILE%, so a shared log does not carry the user name", () => {
    expect(displayPath("/Users/a/.nvm/x", "/Users/a", "darwin")).toBe("~/.nvm/x");
    expect(displayPath("/Users/ab/x", "/Users/a", "darwin")).toBe("/Users/ab/x");
    expect(displayPath("C:\\Users\\A\\AppData\\x", "C:\\Users\\A", "win32")).toBe(
      "%USERPROFILE%\\AppData\\x",
    );
    expect(displayPath("/opt/homebrew/bin/node", "/Users/a", "darwin")).toBe(
      "/opt/homebrew/bin/node",
    );
  });

  it("says which devcoach, on which Node, installed how — and what it depends on", () => {
    const info = describeRuntime({
      codePath:
        "/Users/a/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach/dist/chunk-AB12CD.js",
      execPath: "/Users/a/.nvm/versions/node/v26.5.0/bin/node",
      nodeVersion: "26.5.0",
      platform: "darwin",
    });
    expect(runtimeLine("mcp", info, ["data ~/.devcoach (schema 6)"], "/Users/a", "darwin")).toBe(
      `devcoach ${VERSION} mcp · node 26.5.0 via nvm (~/.nvm/versions/node/v26.5.0/bin/node) · ` +
        "npm-global, bound to Node v26.5.0 (nvm) (~/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach) · " +
        "data ~/.devcoach (schema 6)",
    );
  });

  it("describes the devcoach that runs, not the launcher that imported it (argv[1] is the launcher)", () => {
    const info = describeRuntime({
      codePath:
        "/Users/a/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.0/node_modules/devcoach/dist/chunk-9XY.js",
      execPath: "/opt/homebrew/Cellar/node/26.10.0_1/bin/node",
      nodeVersion: "26.10.0",
      platform: "darwin",
    });
    expect(info.where.channel).toBe("claude-plugin");
    expect(info.entry).toBe(
      "/Users/a/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.0/node_modules/devcoach",
    );
    // by default: this very module — from source here
    expect(describeRuntime().where.channel).toBe("source");
    expect(describeRuntime().entry).toBe(root);
  });

  it("the server writes it to stderr, and the client once the handshake is done — stdout stays the protocol", async () => {
    const data = tmp("dc-rt-data-");
    const child = spawn(
      process.execPath,
      [join(root, "node_modules", "tsx", "dist", "cli.mjs"), join(root, "src", "bin.ts"), "mcp"],
      { env: { ...process.env, DEVCOACH_DIR: data, NO_COLOR: "1" }, stdio: "pipe" },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d;
    });
    child.stderr.on("data", (d) => {
      err += d;
    });
    const send = (m: object) => child.stdin.write(`${JSON.stringify(m)}\n`);
    send({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "claude-ai", version: "0.1.0" },
      },
    });
    const until = async (cond: () => boolean) => {
      for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
    };
    await until(() => out.includes("\n"));
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    await until(() => err.includes("client "));
    child.kill();
    const lines = err.trim().split("\n");
    expect(lines[0]).toMatch(
      new RegExp(
        `^devcoach ${VERSION.replace(/\./g, "\\.")} mcp · node \\d+\\.\\d+\\.\\d+ via \\S+ \\(`,
      ),
    );
    expect(lines[0]).toContain("source (");
    expect(lines[0]).toContain("(no database yet)"); // and it did not create one
    expect(lines[1]).toBe(`devcoach ${VERSION} mcp · client claude-ai 0.1.0`);
    for (const line of out.trim().split("\n")) expect(() => JSON.parse(line)).not.toThrow();
    expect(JSON.parse(out.split("\n")[0] ?? "").result.serverInfo).toEqual({
      name: "devcoach",
      version: VERSION,
    });
  }, 20_000);
});
