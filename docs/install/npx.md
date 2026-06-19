---
title: npx / npm CLI
sidebar_label: npx / npm CLI
---

# npx / npm CLI (any MCP agent)

No install required — `npx` runs devcoach on demand. For **Claude Code** and **Claude Desktop**, one
command registers the MCP server and wires up automatic lesson delivery:

```bash
npx -y devcoach install
```

Restart your agent afterward. Prefer a global binary? `npm install -g devcoach`, then run `devcoach install`
(and drop the `npx -y` prefix everywhere).

## Manual MCP config (Claude Code)

If `devcoach install` isn't available, register it yourself.

**Option A — via the `claude mcp` CLI (recommended):**

```bash
claude mcp add devcoach npx -- -y devcoach mcp

# all projects (user scope):
claude mcp add --scope user devcoach npx -- -y devcoach mcp
```

**Option B — edit `~/.claude.json` directly:**

```json
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Then add the Stop hooks to `~/.claude/settings.json` for automatic lesson delivery (skip this if you used
the [plugin](./claude-code-plugin.md) — it already provides them):

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

Using another agent (Cursor, Windsurf, …)? See **[Other MCP agents](./other-agents.md)**.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
