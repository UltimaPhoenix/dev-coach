---
title: Installation
sidebar_label: Choose your setup
---

# Installation

devcoach runs **locally** — a stdio MCP server that stores everything in `~/.devcoach/coaching.db` on the
machine where your agent runs. It works in **Claude Code** and **Claude Desktop**, but **not** on claude.ai
web (which only supports hosted/remote connectors — see [Privacy & security](../reference/privacy.md)).
Requires **Node.js ≥ 24**.

## Pick a method

| Your setup | Method |
|---|---|
| **Claude Code** | **[Claude Code plugin](./claude-code-plugin.md)** — bundles the MCP server, hooks & skill in one install *(recommended)* |
| **Any MCP agent** (Claude Code, Cursor, Windsurf, …) | **[npx / npm CLI](./npx.md)** — `npx -y devcoach install` |
| **macOS / Linux** | **[Homebrew](./homebrew.md)** |
| **Claude Desktop** | **[One-click extension (`.mcpb`)](./claude-desktop.md)** |
| **Cursor / Windsurf / Cline / Continue / Zed** | **[Other MCP agents](./other-agents.md)** |
| **claude.ai web** | **[Skill copy](./claude-ai.md)** |

The recommended path is the **[Claude Code plugin](./claude-code-plugin.md)** (everything in one install),
or **[npx](./npx.md)** for any other MCP agent — no global install, always the latest version. Each page
below is self-contained: it covers **install *and* connect**.

→ Next: once installed, head to **[Coaching in your agent](../usage/coaching.md)** for onboarding and your
first lesson.
