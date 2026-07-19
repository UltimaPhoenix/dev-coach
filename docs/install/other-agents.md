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

:::tip Gemini CLI and Codex CLI have first-class support
**[Gemini CLI](./gemini-cli.md)** *(beta)* and **[Codex CLI](./codex.md)** *(beta)* get the full
coaching loop — automatic lesson hooks and the devcoach skill — via `devcoach install --gemini` /
`--codex`. Use those pages instead of the generic config below.
:::

:::note
The automatic **stop hooks** (a lesson after each task) exist only for Claude Code, Gemini CLI, and
Codex CLI. The agents on this page still have full access to all MCP tools and resources — coaching
can be triggered manually or by prompting your agent.
:::

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
