---
title: Other MCP agents
---

# Other MCP agents

Cursor, Windsurf, Cline, Continue, Zed, and other MCP-compatible tools connect to devcoach with a standard
MCP server entry. Add this to your agent's MCP config file:

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

| Agent | Config file |
|---|---|
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** (VS Code) | VS Code Settings → `cline.mcpServers` |
| **Continue.dev** | `~/.continue/config.json` → `mcpServers` |
| **Zed** | `.zed/settings.json` → `context_servers` |

:::note
The automatic **Stop hooks** (a lesson after each task) are Claude Code-specific. Other agents still have
full access to all MCP tools and resources — coaching can be triggered manually or by prompting your agent.
:::

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
