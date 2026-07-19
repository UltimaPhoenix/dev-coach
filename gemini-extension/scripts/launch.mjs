#!/usr/bin/env node
// devcoach Gemini CLI extension bootstrap.
//
// The extension ships only config + this launcher — the actual devcoach binary comes from npm, so
// there's no committed build artifact and no per-invocation `npx`. On first use we install the
// *pinned* version (gemini-extension/package.json) once into a persistent data dir under
// ~/.devcoach (extension updates may replace the extension dir, so the install must live outside
// it), then run it in-process. Subsequent calls (the MCP server start + every AfterAgent hook)
// just run `node` against the installed binary; we only re-install when the pinned version changes.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const data = join(homedir(), ".devcoach", "gemini-ext");
const srcManifest = join(root, "package.json");
const dstManifest = join(data, "package.json");
const binJs = join(data, "node_modules", "devcoach", "dist", "bin.js");

mkdirSync(data, { recursive: true });
const want = readFileSync(srcManifest, "utf8");
const have = existsSync(dstManifest) ? readFileSync(dstManifest, "utf8") : "";
if (!existsSync(binJs) || have !== want) {
  copyFileSync(srcManifest, dstManifest);
  // stdio "ignore": npm output must not touch the MCP server's stdout (protocol) or a hook's stderr (cue).
  const r = spawnSync(
    "npm",
    ["install", "--omit=dev", "--no-audit", "--no-fund", "--no-progress"],
    {
      cwd: data,
      stdio: "ignore",
    },
  );
  if (r.status !== 0 || !existsSync(binJs)) {
    console.error(
      "devcoach extension: could not install the devcoach package (needs Node ≥24 + network on first run).",
    );
    process.exit(0); // stay silent rather than break the agent's turn
  }
}

// Hand off in-process to the real binary — it reads the subcommand from argv ("mcp" / "gemini-stop-hook" / …).
await import(pathToFileURL(binJs).href);
