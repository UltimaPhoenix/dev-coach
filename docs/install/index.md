---
title: Installation
sidebar_label: Choose your setup
description: Install devcoach in about 30 seconds — Homebrew, the Claude Code plugin, npx, or Claude Desktop. A local MCP server for progressive technical coaching in your AI agent.
keywords: [install devcoach, devcoach npx, devcoach homebrew, Claude Code plugin, Claude Desktop MCP, MCP server install]
---

# Installation

devcoach runs **locally** — a stdio MCP server that stores everything in `~/.devcoach/coaching.db` on the
machine where your agent runs. It works in **Claude Code** and **Claude Desktop**, but **not** on claude.ai
web (which only supports hosted/remote connectors — see [Privacy & security](../reference/privacy.md)).
Requires **Node.js ≥ 24**.

## Which method is right for you?

devcoach works the same whichever way you install it — pick by how you like to work:

- **Developer, comfortable in a terminal → [Homebrew](./homebrew.md)** (macOS / Linux). One
  `brew install` sets up devcoach **and** the `devcoach` CLI, so you also get the
  [command line](../usage/cli.md) and can launch the [dashboard](../usage/web-ui.md) with a bare
  `devcoach ui`. *(On Windows, or if you prefer npm, [npx / npm](./npx.md) is the equivalent.)*
- **Prefer the simplest, no-terminal setup → the [Claude Code plugin](./claude-code-plugin.md)** *(Beta)*
  (one-click from the marketplace) or, on Claude Desktop, the **[`.mcpb` extension](./claude-desktop.md)** *(Beta)*.
  Nothing to configure — install and go. *(These don't add the `devcoach` CLI; run CLI commands with
  `npx -y devcoach …` if you ever need them. For the most stable experience, use Homebrew or npm.)*

## All methods

| Method | Best for | Terminal? | Status |
|---|---|---|---|
| **[Homebrew](./homebrew.md)** | **Developers on macOS / Linux who use the CLI** | Yes | Stable |
| **[npx / npm CLI](./npx.md)** | Any MCP agent · Windows · npm workflows | Yes | Stable |
| **[Claude Code plugin](./claude-code-plugin.md)** | **Non-expert Claude Code users — one-click setup** | No | Beta |
| **[Claude Desktop (`.mcpb`)](./claude-desktop.md)** | **Non-expert Claude Desktop users — one-click setup** | No | Beta |
| **[Other MCP agents](./other-agents.md)** | Cursor, Windsurf, Cline, Continue, Zed | Yes | Beta |
| **[claude.ai web](./claude-ai.md)** | claude.ai (skill-only, no MCP) | — | Beta |

Each page below is self-contained: it covers **install *and* connect**.

→ Next: once installed, head to **[Coaching in your agent](../usage/coaching.md)** for onboarding and your
first lesson.
