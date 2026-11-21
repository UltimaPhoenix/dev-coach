---
title: Installation
sidebar_label: Choose your setup
description: Install devcoach in about 30 seconds — Homebrew, the Claude Code plugin, npx, or Claude Desktop. A local MCP server that helps you learn from the code your AI writes.
keywords: [install devcoach, devcoach npx, devcoach homebrew, Claude Code plugin, Claude Desktop MCP, MCP server install]
---

# Installation

import { Card, Cards } from "@site/src/components/Cards";

devcoach runs **locally**: a stdio MCP server that stores everything in `~/.devcoach/coaching.db` on the
machine where your agent runs. It works in **Claude Code**, **Claude Desktop**, **Gemini CLI** *(beta)*,
**Codex CLI** *(beta)* and any other MCP client, including registry-aware ones via the
[MCP Registry](./other-agents.md#mcp-registry).

:::note[Before you pick]

- **Node.js ≥ 24** is required. On Windows the [one-line installer](./windows.md) brings its own.
- **Not on claude.ai web**, which only supports hosted/remote connectors (see
  [Privacy & security](../reference/privacy.md)). There you can paste the skill by hand.

:::

## Which method is right for you?

devcoach works the same whichever way you install it. Pick by how you like to work:

<Cards columns={2}>
  <Card label="Terminal" title="Homebrew" to="/install/homebrew">
    macOS / Linux. One `brew install` sets up devcoach and the `devcoach` CLI.
  </Card>
  <Card label="Terminal · Windows" title="PowerShell or Scoop" to="/install/windows">
    The Windows equivalent of Homebrew: one PowerShell line, or the Scoop bucket.
  </Card>
  <Card label="No terminal" title="Claude Code plugin" to="/install/claude-code-plugin">
    The simplest setup: one click from the marketplace. On Claude Desktop, the `.mcpb` extension *(Beta)*.
  </Card>
  <Card label="Best in Claude Code" title="Plugin + Homebrew" to="/install/claude-code-plugin#the-cli-next-to-the-plugin">
    The coaching from the plugin, the CLI from Homebrew.
  </Card>
</Cards>

:::info[With Homebrew]

- **The CLI**: you get the [command line](../usage/cli.md) and launch the [dashboard](../usage/web-ui.md)
  with a bare `devcoach ui`.
- **`brew upgrade`** updates only the binary: re-run `devcoach install` to refresh the hooks and the skill.
- **Plugin + Homebrew** is the best of both in Claude Code: the plugin keeps the coaching wiring current
  automatically, Homebrew adds the CLI.

:::

:::info[Without a terminal]

- **The plugin and the [`.mcpb` extension](./claude-desktop.md)** need nothing to configure: install and go.
- **No `devcoach` CLI** comes with them: open the [dashboard](../usage/web-ui.md) with `/devcoach:ui` or by
  asking Claude, and run CLI commands with `npx -y devcoach …` if you ever need them.
- **For the most stable experience**, use Homebrew or npm.

:::

## All methods

| Method | Best for | Terminal? | Status |
|---|---|---|---|
| **[Homebrew](./homebrew.md)** | **Developers on macOS / Linux who use the CLI** | Yes | Stable |
| **[Windows](./windows.md)** | **Developers on Windows — one PowerShell line, or Scoop** | Yes | Beta |
| **[Claude Code plugin](./claude-code-plugin.md)** | **Non-expert Claude Code users — one-click setup** | No | Stable |
| **[Claude Desktop (`.mcpb`)](./claude-desktop.md)** | **Non-expert Claude Desktop users — one-click setup** | No | Beta |
| **[Gemini CLI](./gemini-cli.md)** | Google Gemini CLI — full loop (hooks + skill) | Yes | Beta |
| **[Codex CLI](./codex.md)** | OpenAI Codex CLI — full loop (hooks + skill) | Yes | Beta |
| **[npx / npm CLI](./npx.md)** | Any MCP agent · npm workflows | Yes | Stable |
| **[Other MCP agents](./other-agents.md)** | Cursor, Windsurf, Cline, Continue, Zed | Yes | Beta |
| **[MCP Registry](./other-agents.md#mcp-registry)** | Any registry-aware client — `io.github.UltimaPhoenix/devcoach` | Depends on the client | Beta |
| **[claude.ai web](./claude-ai.md)** | claude.ai (manual skill paste, no MCP) | — | Skill only |

Each page in the table is self-contained: it covers **install *and* connect**.

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Once installed: onboarding and your first lesson.
  </Card>
</Cards>
