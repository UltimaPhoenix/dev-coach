// The launcher (assets/launcher/launch.mjs → plugin/scripts/launch.mjs) as real child processes:
// a sandboxed data dir and a FAKE `npm` first on PATH, so the install path runs for real without
// the network. Each failure scenario here once ended as a mute "failed to connect".
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error — a plain .mjs script: the pure helpers are imported without running main()
import { MIN_NODE_MAJOR, nodeProblem, runtimeKey } from "../assets/launcher/launch.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const LAUNCHER = join(root, "plugin", "scripts", "launch.mjs");
const PINNED = JSON.parse(read("plugin", "package.json")).dependencies.devcoach as string;

// A stand-in for npm: writes a stub devcoach whose bin prints its argv. FAKE_NPM selects the
// behaviour; every call is appended to FAKE_NPM_CALLS.
const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path");
fs.appendFileSync(process.env.FAKE_NPM_CALLS, process.argv.slice(2).join(" ") + "\\n");
if (process.argv[2] === "--version") { console.log("99.0.0"); process.exit(0); }
const mode = process.env.FAKE_NPM || "ok";
const finish = () => {
  if (mode === "fail") { console.error("npm ERR! network unreachable"); process.exit(1); }
  const dist = path.join(process.cwd(), "node_modules", "devcoach", "dist");
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, "bin.js"), 'console.log("devcoach-stub " + process.argv.slice(2).join(" "));\\n');
  fs.writeFileSync(path.join(process.cwd(), "node_modules", "devcoach", "package.json"), '{"type":"module","version":"${PINNED}"}');
  process.exit(0);
};
if (mode === "slow") setTimeout(finish, Number(process.env.FAKE_NPM_DELAY || 1500)); else finish();
`;

interface Sandbox {
  data: string;
  calls: string;
  env: NodeJS.ProcessEnv;
}

function sandbox(opts: { npm?: boolean } = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "dc-launch-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  // `node` for the fake npm's shebang (and nothing else: no real npm on this PATH)
  symlinkSync(process.execPath, join(bin, "node"));
  if (opts.npm !== false) {
    writeFileSync(join(bin, "npm"), FAKE_NPM);
    chmodSync(join(bin, "npm"), 0o755);
  }
  const data = join(dir, "data");
  const calls = join(dir, "npm-calls.log");
  writeFileSync(calls, "");
  return {
    data,
    calls,
    env: {
      PATH: [bin, "/usr/bin", "/bin"].join(delimiter),
      HOME: dir,
      DEVCOACH_RUNTIME_DIR: data,
      FAKE_NPM_CALLS: calls,
    },
  };
}

const run = (sb: Sandbox, mode: string, env: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [LAUNCHER, mode], {
    env: { ...sb.env, ...env },
    encoding: "utf8",
    timeout: 30_000,
  });
const start = (sb: Sandbox, mode: string, env: NodeJS.ProcessEnv = {}): ChildProcess =>
  spawn(process.execPath, [LAUNCHER, mode], { env: { ...sb.env, ...env }, stdio: "pipe" });
const exited = (p: ChildProcess) =>
  new Promise<number | null>((resolve) => p.on("exit", (code) => resolve(code)));
const installs = (sb: Sandbox) =>
  readFileSync(sb.calls, "utf8")
    .split("\n")
    .filter((l) => l.startsWith("install")).length;
const runtimeDirs = (sb: Sandbox) => readdirSync(join(sb.data, "runtime"));
const until = async (cond: () => boolean, ms = 10_000) => {
  const deadline = Date.now() + ms;
  while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  return cond();
};

describe("launcher helpers", () => {
  it("names the Node requirement, and only when it is not met", () => {
    expect(nodeProblem(`${MIN_NODE_MAJOR}.0.0`)).toBeNull();
    expect(nodeProblem("26.10.0")).toBeNull();
    expect(nodeProblem("22.11.0")).toMatch(/Node 22\.11\.0 is too old.*Node 24 or newer/);
    expect(nodeProblem("18.19.1")).toContain("node:sqlite");
  });

  it("derives a directory-safe key from a version or a tarball spec", () => {
    expect(runtimeKey("2.6.3")).toBe("2.6.3");
    expect(runtimeKey("2.7.0-next.612.g686a538")).toBe("2.7.0-next.612.g686a538");
    expect(runtimeKey("file:/tmp/a b/devcoach-9.9.9.tgz")).toMatch(/^[\w.-]+$/);
  });
});

describe("launcher mirror", () => {
  it("the plugin's launcher is the single source, byte for byte (npm run plugin:sync)", () => {
    expect(read("plugin", "scripts", "launch.mjs")).toBe(read("assets", "launcher", "launch.mjs"));
  });

  it("the plugin says where its runtime lives; it has no hook modes to configure", () => {
    const plugin = JSON.parse(read("plugin", "scripts", "launch.config.json"));
    expect(plugin).toEqual({ label: "devcoach plugin", dataEnv: "CLAUDE_PLUGIN_DATA" });
    expect(read("assets", "launcher", "launch.mjs")).not.toMatch(/-hook\b/);
  });
});

describe("launcher install", () => {
  it("installs the pinned version once, hands off to the server, and never calls npm again", () => {
    const sb = sandbox();
    const first = run(sb, "mcp");
    expect(first.status).toBe(0);
    expect(first.stdout).toBe("devcoach-stub mcp\n"); // npm's output never reaches stdout
    expect(installs(sb)).toBe(1);
    expect(runtimeDirs(sb)).toEqual([PINNED]);
    expect(readFileSync(join(sb.data, "install.log"), "utf8")).toContain(`devcoach@${PINNED}`);
    // No argument at all is the server too (bin.js ignores its arguments).
    expect(run(sb, "").stdout).toBe("devcoach-stub \n");
    expect(installs(sb)).toBe(1);
  });

  it("doctor installs what is missing and then reports a ready runtime, exit 0", () => {
    const sb = sandbox();
    const doctor = run(sb, "doctor");
    expect(doctor.status).toBe(0);
    expect(doctor.stderr).toBe("");
    expect(doctor.stdout).toContain(`devcoach plugin: devcoach ${PINNED} is installed`);
    expect(doctor.stdout).toContain("the MCP server starts from it");
    expect(doctor.stdout).toMatch(/node:\s+\d+\.\d+\.\d+ \(needs ≥ 24\)/);
    expect(doctor.stdout).toContain("npm:      99.0.0");
    expect(doctor.stdout).toContain(join(sb.data, "runtime", PINNED));
    expect(doctor.stdout).not.toContain("not installed");
    expect(installs(sb)).toBe(1);
  });

  it("--install installs and exits without starting anything", () => {
    const sb = sandbox();
    const install = run(sb, "--install");
    expect(install.status).toBe(0);
    expect(install.stdout).toBe("");
    expect(runtimeDirs(sb)).toEqual([PINNED]);
    expect(run(sb, "--install").status).toBe(0);
    expect(installs(sb)).toBe(1);
  });

  it("a new pin installs beside the old runtime and prunes it — and the pre-2.6.4 layout", () => {
    const sb = sandbox();
    expect(run(sb, "mcp").status).toBe(0);
    mkdirSync(join(sb.data, "node_modules", "devcoach"), { recursive: true }); // old layout
    writeFileSync(join(sb.data, "package.json"), "{}");
    const next = run(sb, "mcp", { DEVCOACH_RUNTIME_SPEC: "9.9.9" });
    expect(next.stdout).toBe("devcoach-stub mcp\n");
    expect(runtimeDirs(sb)).toEqual(["9.9.9"]);
    expect(existsSync(join(sb.data, "node_modules"))).toBe(false);
    expect(existsSync(join(sb.data, "package.json"))).toBe(false);
  });

  it("three starts at once end with one runtime and no leftovers", async () => {
    const sb = sandbox();
    const env = { FAKE_NPM: "slow", FAKE_NPM_DELAY: "600" };
    const codes = await Promise.all(
      [start(sb, "mcp", env), start(sb, "mcp", env), start(sb, "mcp", env)].map(exited),
    );
    expect(codes).toEqual([0, 0, 0]);
    expect(runtimeDirs(sb)).toEqual([PINNED]);
  });

  it("an install killed halfway never looks installed: the next start recovers", async () => {
    const sb = sandbox();
    const doomed = start(sb, "mcp", { FAKE_NPM: "slow", FAKE_NPM_DELAY: "20000" });
    expect(await until(() => installs(sb) === 1)).toBe(true);
    doomed.kill("SIGKILL");
    await exited(doomed);
    spawnSync("pkill", ["-f", sb.data]); // the orphaned fake npm
    expect(runtimeDirs(sb).some((d) => d.includes(".tmp-"))).toBe(true);
    expect(runtimeDirs(sb)).not.toContain(PINNED);
    const again = run(sb, "mcp");
    expect(again.stdout).toBe("devcoach-stub mcp\n");
    expect(runtimeDirs(sb)).toEqual([PINNED]);
  });
});

describe("launcher failures say why", () => {
  it("npm fails: the server exits 1 with the reason and the log; doctor prints the diagnosis", () => {
    const sb = sandbox();
    const mcp = run(sb, "mcp", { FAKE_NPM: "fail" });
    expect(mcp.status).toBe(1);
    expect(mcp.stdout).toBe("");
    expect(mcp.stderr).toContain(`could not install devcoach ${PINNED}`);
    expect(mcp.stderr).toContain(join(sb.data, "install.log"));
    expect(existsSync(join(sb.data, "runtime", PINNED))).toBe(false);
    const doctor = run(sb, "doctor", { FAKE_NPM: "fail" });
    expect(doctor.status).toBe(1);
    expect(doctor.stdout).toBe("");
    expect(doctor.stderr).toContain("the devcoach runtime is not available");
    expect(doctor.stderr).toContain(`reason:   could not install devcoach ${PINNED}`);
    expect(doctor.stderr).toMatch(/node:\s+\d+\.\d+\.\d+ \(needs ≥ 24\)/);
    expect(doctor.stderr).toContain("(not installed)");
    expect(doctor.stderr).toContain("npm ERR! network unreachable"); // the log's tail
    const install = run(sb, "--install", { FAKE_NPM: "fail" });
    expect(install.status).toBe(1);
    expect(install.stderr).toContain(`could not install devcoach ${PINNED}`);
  });

  it("npm missing: says so, without a stack trace", () => {
    const sb = sandbox({ npm: false });
    const mcp = run(sb, "mcp");
    expect(mcp.status).toBe(1);
    expect(mcp.stderr).toContain("`npm` was not found on the PATH");
    expect(mcp.stderr).not.toContain("    at ");
    const doctor = run(sb, "doctor");
    expect(doctor.status).toBe(1);
    expect(doctor.stderr).toContain("npm:      not found on PATH");
  });

  it("a runtime that cannot be loaded is dropped, so the next start reinstalls", () => {
    const sb = sandbox();
    expect(run(sb, "mcp").status).toBe(0);
    const bin = join(sb.data, "runtime", PINNED, "node_modules", "devcoach", "dist", "bin.js");
    writeFileSync(bin, 'import "./missing-chunk.js";\n');
    const broken = run(sb, "mcp");
    expect(broken.status).toBe(1);
    expect(broken.stderr).toContain("could not start");
    expect(existsSync(join(sb.data, "runtime", PINNED))).toBe(false);
    expect(run(sb, "mcp").stdout).toBe("devcoach-stub mcp\n");
  });
});
