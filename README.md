# devcoach

A local MCP server that acts as a progressive technical coach, integrating with Claude Code and Claude Desktop.

## Usage

```bash
uvx devcoach
```

## CLI

```bash
devcoach profile
devcoach lessons [--period today|week|month|year|all] [--category <tag>]
devcoach lesson <id>
devcoach settings
devcoach set <key> <value>
devcoach ui [--port 7860]
```

## Claude Code / Claude Desktop configuration

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "uvx",
      "args": ["devcoach"]
    }
  }
}
```
