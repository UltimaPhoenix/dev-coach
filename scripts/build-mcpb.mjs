// Bundle a self-contained Node server (tsup.mcpb.config.ts: every dependency inlined — the .mcpb
// ships no node_modules) + assets + manifest into mcpb/build/, prove it resolves outside the repo,
// validate, then pack the .mcpb with the official @anthropic-ai/mcpb CLI (npx fetches it).
//   node scripts/build-mcpb.mjs            →  dist-mcpb/devcoach-<version>.mcpb  (unsigned)
//   node scripts/build-mcpb.mjs --sign     →  also self-sign it (writes cert.pem/key.pem in mcpb/, gitignored)
// For a real distribution signature, sign with your own cert instead:
//   npx @anthropic-ai/mcpb sign dist-mcpb/devcoach-<version>.mcpb -c cert.pem -k key.pem
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const stage = join(root, "mcpb", "build");
const out = join(root, "dist-mcpb");

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
// One self-contained file: the npm dist/ imports its dependencies, which the extension cannot install.
execFileSync("npx", ["tsup", "--config", "tsup.mcpb.config.ts"], { cwd: root, stdio: "inherit" });
const bundle = join(stage, "dist", "bin.js");
cpSync(join(root, "assets"), join(stage, "assets"), { recursive: true });
cpSync(join(root, "LICENSE"), join(stage, "LICENSE")); // AGPL text ships inside the bundle

const manifest = JSON.parse(readFileSync(join(root, "mcpb", "manifest.json"), "utf8"));
manifest.version = version; // keep in sync with package.json
writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
if (existsSync(join(root, "mcpb", "icon.png"))) {
  cpSync(join(root, "mcpb", "icon.png"), join(stage, "icon.png"));
}

// Guard 1 — no bare-specifier import may survive in the bundle (unresolvable inside Claude Desktop).
// ESM statements only: esbuild emits externals as `import … from "x"` / `import("x")`; `require("…")`
// text also occurs inside inlined libraries (ajv's code generator) and is not a module reference.
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const bare = [
  ...readFileSync(bundle, "utf8").matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"'\n]+)["']/g),
]
  .map((m) => m[1])
  .filter((s) => /^(node:)?[@a-z0-9][\w./@-]*$/i.test(s) && !s.startsWith(".") && !builtins.has(s));
if (bare.length) {
  console.error(`mcpb bundle still imports packages: ${[...new Set(bare)].join(", ")}`);
  process.exit(1);
}
// Guard 2 — run the staged tree from OUTSIDE the repo (the root node_modules would mask a missing
// package): the CLI must start, and the MCP server must answer an initialize handshake.
const probe = mkdtempSync(join(tmpdir(), "devcoach-mcpb-"));
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
  input: `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "mcpb-smoke", version: "0.0.0" } } })}\n`,
  encoding: "utf8",
  timeout: 15000,
});
rmSync(probe, { recursive: true, force: true });
if (!init.stdout?.includes('"serverInfo"')) {
  console.error(`mcpb bundle: MCP initialize handshake failed\n${init.stderr || ""}`);
  process.exit(1);
}
console.log("mcpb bundle: self-contained (no package imports), CLI + MCP handshake OK");

// Validate the staged manifest against the official schema before packing (fail fast).
execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "validate", join(stage, "manifest.json")], {
  stdio: "inherit",
});

mkdirSync(out, { recursive: true });
const file = join(out, `devcoach-${version}.mcpb`);
execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "pack", stage, file], { stdio: "inherit" });
console.log(`packed ${file}`);

if (process.argv.includes("--sign")) {
  // Prefer a real code-signing cert from MCPB_CERT/MCPB_KEY (file paths — set by CI from secrets);
  // otherwise self-sign. Self-signed embeds a signature so Claude Desktop installs it, but as an
  // *unverified* publisher (self-signed certs don't chain to a trusted root — expected).
  const cert = process.env.MCPB_CERT;
  const key = process.env.MCPB_KEY;
  if (cert && key && existsSync(cert) && existsSync(key)) {
    execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "sign", file, "-c", cert, "-k", key], {
      stdio: "inherit",
    });
    console.log(`signed ${file} with MCPB_CERT`);
  } else {
    execFileSync("npx", ["-y", "@anthropic-ai/mcpb", "sign", file, "--self-signed"], {
      cwd: join(root, "mcpb"),
      stdio: "inherit",
    });
    console.log(
      `self-signed ${file} (unverified publisher — set MCPB_CERT/MCPB_KEY for a trusted signature)`,
    );
  }
}
