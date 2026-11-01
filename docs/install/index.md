---
title: Installation
sidebar_label: Choose your setup
description: Install devcoach in about 30 seconds — Homebrew, the Claude Code plugin, npx, Gemini CLI or Codex CLI. A local coach that teaches you what you don't know yet from the code your AI agent writes.
keywords: [install devcoach, devcoach npx, devcoach homebrew, Claude Code plugin, Gemini CLI, Codex CLI]
---

# Installation

devcoach runs **locally** — a command-line program that stores everything in `~/.devcoach/coaching.db` on
the machine where your agent runs. It works in **Claude Code**, **Gemini CLI** *(beta)* and
**Codex CLI** *(beta)* — but **not** on claude.ai web (nothing there can run a program on your machine —
see [Privacy & security](../reference/privacy.md)); there you can paste the skill by hand. Requires
**Node.js ≥ 24** (Windows is untested).

## How devcoach plugs into your agent

Three local pieces. The agent's **hooks** cue a lesson at the right moment (devcoach's Stop /
UserPromptSubmit hooks in Claude Code; their AfterAgent / BeforeAgent and Stop twins in Gemini CLI and
Codex CLI). The devcoach **skill** tells the model how to coach. And the model drives devcoach through
its shell: every read and write is one `devcoach api <operation>` command — see the
[Agent API reference](../reference/agent-api.md). That is why devcoach supports exactly the agents
that have hooks, skills and a shell tool: Claude Code, Gemini CLI *(beta)* and Codex CLI *(beta)*.
Up to 2.x devcoach was also an MCP server; since 3.0 it is not, so the Claude Desktop chat extension and
the other MCP agents (Cursor, Windsurf, Cline, Continue, Zed) are no longer supported. Claude Desktop's
**Code** tab is Claude Code and keeps working.

## Which method is right for you?

devcoach works the same whichever way you install it — pick by how you like to work:

- **Developer, comfortable in a terminal → [Homebrew](./homebrew.md)** (macOS / Linux). One
  `brew install` sets up devcoach **and** the `devcoach` CLI, so you also get the
  [command line](../usage/cli.md) and can launch the [dashboard](../usage/web-ui.md) with a bare
  `devcoach ui`. *(On Windows, or if you prefer npm, [npx / npm](./npx.md) is the equivalent.)*
  Mind one thing: `brew upgrade` updates only the binary — you re-run `devcoach install` to refresh the
  hooks and the skill. In Claude Code the best of both is **plugin + Homebrew**: the plugin keeps the
  coaching wiring current automatically, Homebrew adds the CLI.
- **Prefer the simplest, no-terminal setup → the [Claude Code plugin](./claude-code-plugin.md)**
  (one-click from the marketplace). Nothing to configure — install and go. *(The plugin puts `devcoach`
  on Claude's shell for the coaching, not on your own terminal's PATH — open the
  [dashboard](../usage/web-ui.md) with `/devcoach:ui` or by asking Claude; run CLI commands with
  `npx -y devcoach …` if you ever need them. For the most stable experience, use Homebrew or npm.)*

## All methods

| Method | Best for | Terminal? | Status |
|---|---|---|---|
| **[Homebrew](./homebrew.md)** | **Developers on macOS / Linux who use the CLI** | Yes | Stable |
| **[Claude Code plugin](./claude-code-plugin.md)** | **Non-expert Claude Code users — one-click setup** | No | Stable |
| **[Gemini CLI](./gemini-cli.md)** | Google Gemini CLI — full loop (hooks + skill) | Yes | Beta |
| **[Codex CLI](./codex.md)** | OpenAI Codex CLI — full loop (hooks + skill) | Yes | Beta |
| **[npx / npm CLI](./npx.md)** | Claude Code without the plugin · Windows · npm workflows | Yes | Stable |
| **[claude.ai web](./claude-ai.md)** | claude.ai (manual skill paste, nothing saved) | — | Skill only |

Each page below is self-contained: it covers **install *and* connect**.

→ Next: once installed, head to **[Coaching in your agent](../usage/coaching.md)** for onboarding and your
first lesson.
