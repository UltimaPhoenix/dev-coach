---
title: npx / npm CLI
sidebar_label: npx / npm CLI
---

# npx / npm CLI (any MCP agent)

No install required — `npx` runs devcoach on demand. For **Claude Code** and **Claude Desktop**, one
command registers the MCP server, wires up automatic lesson delivery (Stop hooks), and installs the
coaching **skill** into `~/.claude/skills/devcoach/`:

```bash
npx -y devcoach install
```

Restart your agent afterward. Prefer a global binary? `npm install -g devcoach`, then run `devcoach install`
(and drop the `npx -y` prefix everywhere). After upgrading devcoach, re-run `devcoach install` to refresh
the skill — `devcoach stats` reminds you when it's out of date.

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

Then add the hooks to `~/.claude/settings.json` for automatic lesson delivery (skip this if you used
the [plugin](./claude-code-plugin.md) — it already provides them). `stop-hook` decides after each turn
whether a lesson is due; `prompt-hook` primes the model up front when one is:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach stop-hook", "timeout": 60 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach prompt-hook", "timeout": 30 }] }
    ]
  }
}
```

If devcoach is installed globally, prefer its absolute path over `npx -y devcoach` (no npx cache or
network needed at hook time) — `devcoach install` picks the best command automatically, and repairs
older two-entry layouts. Run `devcoach doctor` to verify the wiring.

Using another agent (Cursor, Windsurf, …)? See **[Other MCP agents](./other-agents.md)**.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
