// One self-contained devcoach — every dependency inlined by tsup.mcpb.config.ts, only Node
// built-ins left external — and the proof that it is. Two containers ship it: the Claude Desktop
// extension (build-mcpb.mjs) and the standalone zip behind the Windows channels
// (build-standalone.mjs). Same bundle, same guards, so neither can drift from the other.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { builtinModules, createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

/**
 * Bundle into `<stage>/dist/bin.js` and copy what it reads at runtime (`assets/`: the skill, the
 * dashboard's static files) plus the licence texts that must travel with the code.
 */
export function stageSelfContained(stage) {
  // tsup's own CLI entry, run with this Node: `npx` is a .cmd shim on Windows, which spawnSync
  // cannot start without a shell (ENOENT on the first windows-latest run).
  const require = createRequire(import.meta.url);
  const tsupDir = dirname(require.resolve("tsup/package.json"));
  const tsupCli = join(tsupDir, require("tsup/package.json").bin.tsup);
  execFileSync(
    process.execPath,
    [tsupCli, "--config", "tsup.mcpb.config.ts", "--out-dir", join(stage, "dist")],
    { cwd: root, stdio: "inherit" },
  );
  cpSync(join(root, "assets"), join(stage, "assets"), { recursive: true });
  cpSync(join(root, "LICENSE"), join(stage, "LICENSE")); // AGPL text ships inside the bundle
  cpSync(join(root, "THIRD_PARTY_NOTICES.md"), join(stage, "THIRD_PARTY_NOTICES.md")); // vendored libs
}

/**
 * Exit 1 unless the staged tree is self-contained. Guard 1: no bare-specifier import survives in
 * the bundle (unresolvable where no node_modules exists). ESM statements only: esbuild emits
 * externals as `import … from "x"` / `import("x")`; `require("…")` text also occurs inside
 * inlined libraries (ajv's code generator) and is not a module reference. Guard 2: run the tree
 * from OUTSIDE the repo (the root node_modules would mask a missing package): the CLI must start
 * and the MCP server must answer an initialize handshake.
 */
export function assertSelfContained(stage, label) {
  const bundle = join(stage, "dist", "bin.js");
  const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
  const bare = [
    ...readFileSync(bundle, "utf8").matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"'\n]+)["']/g),
  ]
    .map((m) => m[1])
    .filter(
      (s) => /^(node:)?[@a-z0-9][\w./@-]*$/i.test(s) && !s.startsWith(".") && !builtins.has(s),
    );
  if (bare.length) {
    console.error(`${label}: bundle still imports packages: ${[...new Set(bare)].join(", ")}`);
    process.exit(1);
  }

  const probe = mkdtempSync(join(tmpdir(), "devcoach-bundle-"));
  cpSync(stage, probe, { recursive: true });
  const probeEnv = { ...process.env, DEVCOACH_DIR: join(probe, "data") };
  execFileSync(process.execPath, [join(probe, "dist", "bin.js"), "--help"], {
    cwd: probe,
    env: probeEnv,
    stdio: ["ignore", "ignore", "inherit"],
  });
  const init = spawnSync(process.execPath, [join(probe, "dist", "bin.js"), "mcp"], {
    cwd: probe,
    env: probeEnv,
    input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "bundle-smoke", version: "0.0.0" } } })}\n`,
    encoding: "utf8",
    timeout: 15000,
  });
  rmSync(probe, { recursive: true, force: true });
  if (!init.stdout?.includes('"serverInfo"')) {
    console.error(`${label}: MCP initialize handshake failed\n${init.stderr || ""}`);
    process.exit(1);
  }
  console.log(`${label}: self-contained (no package imports), CLI + MCP handshake OK`);
}
