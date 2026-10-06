// Where devcoach runs from, which command a host should start, and why a host cannot start it.
// Every case injects platform / PATH / home, so macOS, Linux and Windows paths are tested here
// whatever OS runs the suite. The Claude Desktop fixture is the real log of a failed start
// (2026-10-05, user name replaced), the reason this module exists.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkServerCommand,
  chooseServerCommand,
  claudeDesktopLogPath,
  interpreterOf,
  NPX_COMMAND,
  readHostLog,
  resolveCommand,
} from "../src/cli/mcp-command";
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
const fixture = readFileSync(
  join(root, "tests", "fixtures", "claude-desktop-mcp-devcoach.log"),
  "utf8",
);

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

describe("resolveCommand — the lookup a host's spawn does", () => {
  it("Unix: the first executable on PATH; a non-executable file does not count", () => {
    const a = tmp("dc-rt-a-");
    const b = tmp("dc-rt-b-");
    writeFileSync(join(a, "devcoach"), "not executable", { mode: 0o644 });
    const hit = bin(b, "devcoach", "#!/bin/sh\n");
    expect(resolveCommand("devcoach", { path: `${a}:${b}`, platform: "darwin" })).toBe(hit);
    expect(resolveCommand("devcoach", { path: a, platform: "darwin" })).toBeNull();
    expect(resolveCommand(hit, { path: "", platform: "darwin" })).toBe(hit);
  });

  it("Windows: splits on `;` (drive letters contain `:`) and tries the PATHEXT extensions", () => {
    const dir = tmp("dc-rt-win-");
    const cmd = bin(dir, "devcoach.cmd", "@echo off\n");
    const path = `C:\\Windows\\system32;D:\\nope;${dir}`;
    expect(
      resolveCommand("devcoach", { path, pathext: ".COM;.EXE;.BAT;.CMD", platform: "win32" }),
    ).toBe(cmd);
    expect(resolveCommand("devcoach", { path, pathext: ".EXE", platform: "win32" })).toBeNull();
  });

  it("reads the #! line of a script, and nothing for a binary", () => {
    const dir = tmp("dc-rt-sh-");
    expect(interpreterOf(bin(dir, "a", "#!/opt/homebrew/opt/node/bin/node\nx"))).toBe(
      "/opt/homebrew/opt/node/bin/node",
    );
    expect(interpreterOf(bin(dir, "b", "#!/usr/bin/env node\r\nx"))).toBe("/usr/bin/env node");
    expect(interpreterOf(bin(dir, "c", "\u007fELF..."))).toBeNull();
    expect(interpreterOf(join(dir, "missing"))).toBeNull();
  });
});

describe("chooseServerCommand — what `devcoach install` writes", () => {
  const entry = "/opt/homebrew/Cellar/devcoach/2.6.3/libexec/lib/node_modules/devcoach/dist/bin.js";
  it("macOS / Linux: the absolute PATH hit (the link brew keeps, not the Cellar path)", () => {
    expect(
      chooseServerCommand({
        hit: "/opt/homebrew/bin/devcoach",
        entry,
        execPath: "/opt/homebrew/bin/node",
        platform: "darwin",
      }),
    ).toEqual({ command: "/opt/homebrew/bin/devcoach", args: ["mcp"], note: undefined });
  });

  it("nvm & co.: written, with a note that it belongs to one Node version", () => {
    const hit = "/home/a/.nvm/versions/node/v26.5.0/bin/devcoach";
    const m = chooseServerCommand({
      hit,
      entry: hit,
      execPath: "/usr/bin/node",
      platform: "linux",
    });
    expect(m.command).toBe(hit);
    expect(m.note).toContain("bound to Node v26.5.0 (nvm)");
  });

  it("not installed, or only in npx's cache (`npx -y devcoach install`): npx", () => {
    expect(
      chooseServerCommand({ hit: null, entry, execPath: "/x/node", platform: "darwin" }),
    ).toEqual(NPX_COMMAND);
    const npx = "/Users/a/.npm/_npx/0123/node_modules/.bin/devcoach";
    expect(
      chooseServerCommand({ hit: npx, entry: npx, execPath: "/x/node", platform: "darwin" }),
    ).toEqual(NPX_COMMAND);
  });

  it("Windows: node.exe + devcoach's bin.js — a .cmd shim cannot be spawned without a shell", () => {
    const winEntry = "C:\\Users\\A\\AppData\\Roaming\\npm\\node_modules\\devcoach\\dist\\bin.js";
    expect(
      chooseServerCommand({
        hit: "C:\\Users\\A\\AppData\\Roaming\\npm\\devcoach.cmd",
        entry: winEntry,
        execPath: "C:\\Program Files\\nodejs\\node.exe",
        platform: "win32",
      }),
    ).toEqual({
      command: "C:\\Program Files\\nodejs\\node.exe",
      args: [winEntry, "mcp"],
      note: undefined,
    });
  });
});

describe("a host's log and why it cannot start devcoach", () => {
  it("reads Claude Desktop's PATH and its most specific last error from a real failed start", () => {
    expect(readHostLog(fixture, "darwin")).toEqual({
      path: [
        "/Users/alex/.nvm/versions/node/v26.5.0/bin",
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/Users/alex/.local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ].join(":"),
      lastError: "Failed to spawn process: No such file or directory",
    });
    expect(readHostLog("nothing useful\n")).toEqual({ path: null, lastError: null });
  });

  it("knows where Claude Desktop keeps that log on each OS", () => {
    expect(claudeDesktopLogPath("darwin", {}, "/Users/a")).toBe(
      "/Users/a/Library/Logs/Claude/mcp-server-devcoach.log",
    );
    expect(claudeDesktopLogPath("win32", { APPDATA: "/w/Roaming" }, "/w")).toBe(
      join("/w/Roaming", "Claude", "logs", "mcp-server-devcoach.log"),
    );
    expect(claudeDesktopLogPath("linux", {}, "/home/a")).toBe(
      "/home/a/.config/Claude/logs/mcp-server-devcoach.log",
    );
  });

  const fakeRun = (versions: Record<string, string>) => (command: string, args: string[]) =>
    args.includes("--version") ? (versions[command] ?? null) : null;

  it("yesterday's case: a bare `devcoach` that is not on the host's PATH", () => {
    const empty = tmp("dc-rt-empty-");
    const f = checkServerCommand(
      { command: "devcoach", args: ["mcp"] },
      { path: empty, pathSource: "Claude Desktop's PATH", platform: "darwin" },
    );
    expect(f).toHaveLength(1);
    expect(f[0]?.level).toBe("bad");
    expect(f[0]?.text).toContain("`devcoach` is not found on Claude Desktop's PATH");
    expect(f[0]?.text).toContain("Failed to spawn process: No such file or directory");
  });

  it("the other ENOENT: the file is there, its #! interpreter is not", () => {
    const dir = tmp("dc-rt-interp-");
    const script = bin(dir, "devcoach", "#!/opt/gone/node\n");
    const f = checkServerCommand(
      { command: script, args: ["mcp"] },
      { pathSource: "PATH", platform: "darwin" },
    );
    expect(f.at(-1)?.level).toBe("bad");
    expect(f.at(-1)?.text).toContain("its interpreter /opt/gone/node does not exist");
  });

  it("#!/usr/bin/env node with no node on the host's PATH", () => {
    const dir = tmp("dc-rt-env-");
    bin(dir, "devcoach", "#!/usr/bin/env node\n");
    const f = checkServerCommand(
      { command: "devcoach" },
      { path: dir, pathSource: "Claude Desktop's PATH", platform: "darwin" },
    );
    expect(f.at(-1)?.text).toContain("finds no `node` on Claude Desktop's PATH");
  });

  it("a healthy absolute command: the Node it runs on and the devcoach it runs", () => {
    const dir = tmp("dc-rt-ok-");
    const node = bin(dir, "node", "#!/bin/sh\n");
    const script = bin(dir, "devcoach", `#!${node}\n`);
    const ok = checkServerCommand(
      { command: script, args: ["mcp"] },
      {
        pathSource: "PATH",
        platform: "darwin",
        run: fakeRun({ [node]: "v26.5.0", [script]: VERSION }),
      },
    );
    expect(ok.map((x) => x.level)).toEqual(["ok", "ok", "ok"]);
    expect(ok[1]?.text).toBe(`runs on Node 26.5.0 (${node})`);
    expect(ok[2]?.text).toBe(`it runs devcoach ${VERSION}`);
    const old = checkServerCommand(
      { command: script },
      {
        pathSource: "PATH",
        platform: "darwin",
        run: fakeRun({ [node]: "v22.11.0", [script]: "2.5.0" }),
      },
    );
    expect(old.find((x) => x.level === "bad")?.text).toContain("runs on Node v22.11.0");
    expect(old.at(-1)?.text).toBe(`it runs devcoach 2.5.0; this doctor is ${VERSION}`);
  });

  it("where it lives: npx's cache is a dead end, an nvm directory is a warning", () => {
    const home = tmp("dc-rt-home-");
    const npx = bin(
      join(home, ".npm", "_npx", "0123", "node_modules", ".bin"),
      "devcoach",
      "#!/bin/sh\n",
    );
    expect(
      checkServerCommand(
        { command: npx },
        { pathSource: "PATH", platform: "darwin", run: () => null },
      ).some((x) => x.level === "bad" && x.text.includes("temporary location")),
    ).toBe(true);
    const nvm = bin(
      join(home, ".nvm", "versions", "node", "v26.5.0", "bin"),
      "devcoach",
      "#!/bin/sh\n",
    );
    expect(
      checkServerCommand(
        { command: nvm },
        { pathSource: "PATH", platform: "darwin", run: () => null },
      ).some((x) => x.level === "warn" && x.text.includes("bound to Node v26.5.0 (nvm)")),
    ).toBe(true);
  });

  it("bare names and npx are flagged, a Windows node.exe + bin.js form is followed to its script", () => {
    const dir = tmp("dc-rt-bare-");
    bin(dir, "devcoach", "#!/bin/sh\n");
    const bare = checkServerCommand(
      { command: "devcoach" },
      { path: dir, pathSource: "PATH", platform: "darwin", run: () => null },
    );
    expect(bare.some((x) => x.level === "warn" && x.text.startsWith("bare name"))).toBe(true);
    expect(checkServerCommand(NPX_COMMAND, { pathSource: "PATH" })).toEqual([
      {
        level: "warn",
        text: "starts via `npx -y devcoach` — needs the npx cache (or the network) at every start",
      },
    ]);
    const node = bin(dir, "node", "#!/bin/sh\n");
    const missing = checkServerCommand(
      { command: node, args: [join(dir, "gone.js"), "mcp"] },
      { pathSource: "PATH", platform: "darwin" },
    );
    expect(missing.at(-1)).toEqual({
      level: "bad",
      text: `devcoach's script ${join(dir, "gone.js")} does not exist`,
    });
  });
});
