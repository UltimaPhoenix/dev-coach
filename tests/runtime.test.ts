// Where devcoach runs from, and how a command is found the way a spawn finds it. Every case
// injects platform / PATH / home, so macOS, Linux and Windows paths are tested here whatever OS
// runs the suite.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveCommand } from "../src/cli/path-lookup";
import {
  classifyPath,
  describeRuntime,
  describeWhere,
  nodeManagerOf,
  nodeProblem,
} from "../src/core/runtime";
import { VERSION } from "../src/version";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function bin(dir: string, name: string, body: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, body, { mode: 0o755 });
  return path;
}
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
  ] as const)("%s %s → %s", (platform, path, channel, manager, boundTo, ephemeral) => {
    expect(classifyPath(path, platform)).toEqual({ channel, manager, boundTo, ephemeral });
  });

  it("describes an install in words: the channel, what Node it is bound to, whether it will vanish", () => {
    expect(describeWhere(classifyPath("/opt/homebrew/Cellar/devcoach/2.6.3/x/dist/bin.js"))).toBe(
      "homebrew",
    );
    expect(
      describeWhere(
        classifyPath("/Users/a/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach/dist/bin.js"),
      ),
    ).toBe("npm-global, bound to Node v26.5.0 (nvm)");
    expect(
      describeWhere(classifyPath("/Users/a/.npm/_npx/0123/node_modules/devcoach/dist/bin.js")),
    ).toBe("npx, temporary location");
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

describe("describeRuntime — which devcoach is running", () => {
  it("says which devcoach, on which Node, installed how — and what it depends on", () => {
    const info = describeRuntime({
      codePath:
        "/Users/a/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach/dist/chunk-AB12CD.js",
      execPath: "/Users/a/.nvm/versions/node/v26.5.0/bin/node",
      nodeVersion: "26.5.0",
      platform: "darwin",
    });
    expect(info.version).toBe(VERSION);
    expect(info.node).toBe("26.5.0");
    expect(info.nodeManager).toBe("nvm");
    expect(info.entry).toBe("/Users/a/.nvm/versions/node/v26.5.0/lib/node_modules/devcoach");
    expect(describeWhere(info.where)).toBe("npm-global, bound to Node v26.5.0 (nvm)");
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
});

describe("resolveCommand — the lookup a spawn does", () => {
  it("Unix: the first executable on PATH; a non-executable file does not count", () => {
    const a = tmp("dc-rt-a-");
    const b = tmp("dc-rt-b-");
    writeFileSync(join(a, "devcoach"), "not executable", { mode: 0o644 });
    const hit = bin(b, "devcoach", "#!/bin/sh\n");
    expect(resolveCommand("devcoach", { path: `${a}:${b}`, platform: "darwin" })).toBe(hit);
    expect(resolveCommand("devcoach", { path: a, platform: "darwin" })).toBeNull();
    expect(resolveCommand("devcoach", { path: "", platform: "darwin" })).toBeNull();
    expect(resolveCommand(hit, { path: "", platform: "darwin" })).toBe(hit);
    expect(resolveCommand(join(a, "missing"), { path: "", platform: "darwin" })).toBeNull();
  });

  it("Windows: splits on `;` (drive letters contain `:`) and tries the PATHEXT extensions", () => {
    const dir = tmp("dc-rt-win-");
    const cmd = bin(dir, "devcoach.cmd", "@echo off\n");
    const path = `C:\\Windows\\system32;D:\\nope;${dir}`;
    expect(
      resolveCommand("devcoach", { path, pathext: ".COM;.EXE;.BAT;.CMD", platform: "win32" }),
    ).toBe(cmd);
    expect(resolveCommand("devcoach", { path, pathext: ".EXE", platform: "win32" })).toBeNull();
    // a name that already carries an extension is tried as is
    expect(resolveCommand("devcoach.cmd", { path, pathext: ".EXE", platform: "win32" })).toBe(cmd);
  });

  it("defaults to this process's PATH and platform", () => {
    const dir = tmp("dc-rt-default-");
    const hit = bin(dir, "dc-rt-probe", "#!/bin/sh\n");
    const saved = process.env.PATH;
    process.env.PATH = dir;
    try {
      expect(resolveCommand("dc-rt-probe")).toBe(process.platform === "win32" ? null : hit);
    } finally {
      process.env.PATH = saved;
    }
  });
});
