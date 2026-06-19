# Getting started

devcoach is an AI-integrated coaching tool — it lives inside your agent (Claude Code, Claude Desktop,
Cursor, Windsurf, etc.) and delivers lessons automatically as you work. There is no separate app to
open and no workflow to change.

---

## Prerequisites

- An MCP-compatible agent — Claude Code, Claude Desktop, Cursor, Windsurf, Cline, Continue, or Zed
- **Node.js ≥ 24** (devcoach uses Node's embedded `node:sqlite`)

No global install is required — `npx` runs devcoach on demand.

## Install & connect

devcoach runs **locally** — it works in Claude Code and Claude Desktop, but not on claude.ai web
(which only supports hosted/remote connectors). Pick the method that matches your setup; each one
below is self-contained.

### 1. Claude Code plugin (recommended)

Bundles the MCP server, the Stop hooks, and the coaching skill in a single install — there's nothing
else to wire up and **no need to run `devcoach install`** (don't run both, or the hooks register twice).

```bash
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

Everything activates on install — no restart. See [Claude Code plugin](claude-code-plugin.md) for the
other install paths (straight from the repo, or an offline zip) and how it works.

### 2. npx CLI (any MCP agent)

No install required. For Claude Code and Claude Desktop, one command registers the MCP server and wires
up automatic lesson delivery:

```bash
npx -y devcoach install
```

Restart your agent afterward. Prefer a global binary? `npm install -g devcoach`, then drop the `npx -y`
prefix everywhere.

**Other agents / manual config** — if `devcoach install` isn't available, add this to your agent's MCP
config file:

```json
{ "mcpServers": { "devcoach": { "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Config file locations: Cursor `~/.cursor/mcp.json` · Windsurf `~/.codeium/windsurf/mcp_config.json` ·
Claude Code `~/.claude.json` · Claude Desktop (see [mcp-server.md](mcp-server.md)). On **Claude Code**,
also add the Stop hooks to `~/.claude/settings.json` for automatic lesson delivery (skip this if you
used the plugin — it provides them):

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach onboard-hook" }] },
      { "hooks": [{ "type": "command", "command": "npx -y devcoach lesson-ready" }] }
    ]
  }
}
```

### 3. Homebrew (macOS / Linux)

```bash
brew tap UltimaPhoenix/tap
brew trust --tap UltimaPhoenix/tap   # required when Homebrew enforces HOMEBREW_REQUIRE_TAP_TRUST
brew install devcoach
devcoach install                     # Homebrew puts devcoach on your PATH — no npx prefix
```

The formula declares `depends_on "node"`, so Homebrew pulls in Node automatically. One-liner:
`brew install UltimaPhoenix/tap/devcoach`.

### 4. Claude Desktop extension (`.mcpb`)

A single bundle that runs on Desktop's built-in runtime — no Node or terminal required:

```bash
npm run mcpb   # → dist-mcpb/devcoach-<version>.mcpb
# Claude Desktop → Settings → Extensions → Install Extension… → pick the .mcpb
```

### 5. claude.ai web (skill copy)

Claude.ai does not support MCP servers. Copy the content of
[`assets/SKILL.md`](https://github.com/UltimaPhoenix/dev-coach/blob/main/assets/SKILL.md) into
claude.ai → Settings → Custom instructions. This gives the coaching behaviour only — lesson logging and
profile tracking won't work.

## Onboarding

The first time your agent connects, devcoach detects that no profile exists and walks you through setup
inline (no command needed): restore from a backup, auto-detect your stack from project files, or a
guided conversation. You confirm topics + confidence (0–10), group them, and coaching begins. You can
also run it in the terminal with `devcoach setup`.

## Your first lesson

Work as normal. After your agent completes a technical task, devcoach appends a short lesson calibrated
to your confidence on the relevant topic, then asks `✅ know · ❌ don't know · ⏭ skip`. Your response
adjusts that topic's confidence and shapes future lessons. Rate limits keep it unobtrusive
(default: ≤ 2/day, ≥ 4h apart).

## Next steps

- [CLI reference](cli.md) — query and manage your data from the terminal
- [Web dashboard](web-ui.md) — `npx -y devcoach ui` → http://localhost:7860
- [MCP server reference](mcp-server.md) — tools, resources, config
- [Configuration](configuration.md) — rate limits, data location, backups
