// Generate the Scoop manifest for the devcoach standalone zip (the Windows twin of
// homebrew-formula.mjs). The CI `scoop` job writes it to bucket/devcoach.json in
// UltimaPhoenix/scoop-bucket at every release; `scoop install devcoach` installs Scoop's
// nodejs-lts next to it and shims devcoach.cmd, so no private Node is needed there.
// Usage: node scripts/scoop-manifest.mjs <version> <sha256>  > bucket/devcoach.json
const [version, sha] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "") || !/^[0-9a-f]{64}$/i.test(sha ?? "")) {
  console.error("usage: node scripts/scoop-manifest.mjs <version> <sha256>");
  process.exit(1);
}
const releases = "https://github.com/UltimaPhoenix/dev-coach/releases/download";

export const manifest = {
  version,
  description:
    "Progressive technical coach for AI coding agents — the devcoach MCP server + CLI (Claude Code, Claude Desktop, Gemini CLI, Codex CLI)",
  homepage: "https://ultimaphoenix.github.io/dev-coach/",
  license: "AGPL-3.0-only",
  url: `${releases}/v${version}/devcoach-${version}-standalone.zip`,
  hash: sha.toLowerCase(),
  depends: "nodejs-lts",
  bin: "devcoach.cmd",
  checkver: { github: "https://github.com/UltimaPhoenix/dev-coach" },
  autoupdate: {
    url: `${releases}/v$version/devcoach-$version-standalone.zip`,
    hash: { url: "$baseurl/SHASUMS256.txt" },
  },
  notes: [
    "Connect your agents with:  devcoach install",
    "devcoach registers hooks, an MCP server and a skill in your agents' config files. Scoop",
    "cannot undo that on uninstall, so before `scoop uninstall devcoach` run:",
    "  devcoach uninstall            # Claude Code + Claude Desktop (--all: also Gemini/Codex)",
    "  devcoach uninstall --data     # also delete ~\\.devcoach (lessons, profile, notebook)",
  ],
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
