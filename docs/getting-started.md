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

```bash
npx -y devcoach install
```

This registers devcoach as an MCP server in Claude Code and/or Claude Desktop and wires up the Stop
hooks for automatic lesson delivery. Restart your agent afterward.

Prefer a global install? `npm install -g devcoach`, then drop the `npx -y` prefix everywhere.

### Manual MCP config

If `devcoach install` isn't available for your agent, add this to its MCP config file:

```json
{ "mcpServers": { "devcoach": { "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Config file locations: Cursor `~/.cursor/mcp.json` · Windsurf `~/.codeium/windsurf/mcp_config.json` ·
Claude Code `~/.claude.json` · Claude Desktop (see [mcp-server.md](mcp-server.md)).

Claude Code only — add the Stop hooks to `~/.claude/settings.json`:

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
