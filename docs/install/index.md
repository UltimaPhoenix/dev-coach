---
title: Installation
sidebar_label: Choose your setup
description: Choose how to install devcoach for your agent (the Claude Code plugin, Homebrew, Windows, npx / npm, the Claude Desktop extension, Gemini CLI, Codex CLI or another MCP agent) and see what each agent gets.
keywords: [install devcoach, devcoach Claude Code plugin, devcoach homebrew, devcoach windows, devcoach npx, Claude Desktop MCP, Gemini CLI MCP, Codex CLI MCP, MCP server install]
---

# Installation

import { Card, Cards } from "@site/src/components/Cards";
import Matrix, { Legend, No, Note, Notes, Partly, Ref, Yes } from "@site/src/components/Matrix";

devcoach is a local MCP server: it runs where your agent runs and keeps your coaching data in
`~/.devcoach/`, shared by every agent on that computer. Pick your agent first; the `devcoach` command
is optional.

## Which agent do you use?

<Cards columns={3}>
  <Card label="Automatic lessons" title="Claude Code" to="/install/claude-code-plugin">
    The **plugin**, two commands in Claude Code. Needs Node.js 24 on your PATH.
  </Card>
  <Card label="Lessons on request · beta" title="Claude Desktop" to="/install/claude-desktop">
    The **`.mcpb` extension**. No terminal; runs on Claude Desktop's own Node.
  </Card>
  <Card label="Automatic lessons · beta" title="Gemini CLI" to="/install/gemini-cli">
    One command in a terminal, or the Gemini extension.
  </Card>
  <Card label="Automatic lessons · beta" title="Codex CLI" to="/install/codex">
    One command in a terminal, then trust devcoach's hooks.
  </Card>
  <Card label="Lessons on request" title="Cursor and other MCP agents" to="/install/other-agents">
    Windsurf, Cline, Continue, Zed: one entry in the agent's MCP config.
  </Card>
  <Card label="Not supported" title="claude.ai web">
    It cannot reach a local MCP server ([why](../reference/privacy.md#why-it-cant-be-a-hosted--remote-connector)). Use Claude Desktop instead.
  </Card>
</Cards>

## Want the `devcoach` command too?

Homebrew, Windows and a global npm install add the [command line](../usage/cli.md) and `devcoach ui` for
the [web dashboard](../usage/web-ui.md). `devcoach install` then connects your agents, in place of the
plugin or the extension.

<Cards columns={4}>
  <Card label="macOS · Linux" title="Homebrew" to="/install/homebrew">
    Installs Node for you.
  </Card>
  <Card label="Windows · beta" title="PowerShell or Scoop" to="/install/windows">
    Installs Node for you.
  </Card>
  <Card label="Any system" title="npx / npm" to="/install/npx">
    Uses your Node.js 24. npx adds no command.
  </Card>
  <Card label="Claude Code" title="Plugin + command" to="/install/claude-code-plugin#the-cli-next-to-the-plugin">
    Skip `devcoach install`: it would register devcoach twice.
  </Card>
</Cards>

Skipped `devcoach install` for the plugin? Claude Desktop is then not connected either:
`devcoach install --claude-desktop` afterwards. Next to the Desktop extension, connect Claude Code
alone: `devcoach install --claude-code`.

## What each agent gets {/* #what-each-agent-gets */}

devcoach wires automatic lessons only into Claude Code, Gemini CLI and Codex CLI: when a task ends and a
lesson is due, the agent teaches it. In Claude Desktop and the other agents you ask for one.

<Matrix label="What each agent gets" minWidth={32}>

| Agent | Lessons after a task | The devcoach skill | devcoach's tools |
|---|---|---|---|
| **Claude Code** · plugin | <Yes>Automatic</Yes> | <Yes>Bundled<Ref n={1} to="bundled" /></Yes> | <Yes>All 25</Yes> |
| **Claude Code** · `devcoach install` | <Yes>Automatic</Yes> | <Partly>Copied<Ref n={2} to="copied" /></Partly> | <Yes>All 25</Yes> |
| **Claude Desktop** · extension *(beta)* or `devcoach install` | <No>When you ask<Ref n={3} to="ask" /></No> | <No>A prompt only<Ref n={3} to="ask" /></No> | <Yes>All 25</Yes> |
| **Gemini CLI** *(beta)* · `devcoach install` or extension | <Yes>Automatic</Yes> | <Partly>Copied<Ref n={2} to="copied" /> or bundled<Ref n={1} to="bundled" />; you allow it<Ref n={4} to="gemini" /></Partly> | <Yes>All 25</Yes> |
| **Codex CLI** *(beta)* · `devcoach install` | <Yes>Automatic, once you trust its hooks<Ref n={5} to="codex-trust" /></Yes> | <Partly>Copied<Ref n={2} to="copied" /></Partly> | <Partly>All 25<Ref n={6} to="codex-toml" /></Partly> |
| **Cursor, Windsurf, Cline, Continue, Zed** | <No>When you ask<Ref n={3} to="ask" /></No> | <No>A prompt only<Ref n={3} to="ask" /></No> | <Yes>All 25</Yes> |
| **claude.ai web** | <No>Not supported ([why](../reference/privacy.md#why-it-cant-be-a-hosted--remote-connector))</No> | <No>None</No> | <No>None</No> |

</Matrix>

<Notes>
<Legend />
<Note n={1} id="bundled">**Bundled**: updated with the plugin or the extension. Claude Code leaves auto-update off for this marketplace: turn it on in `/plugin` → **Marketplaces** → `ultimaphoenix`, or update the plugin yourself. Gemini extension: unzip the next release into the same folder, then `gemini extensions update devcoach`.</Note>
<Note n={2} id="copied">**Copied** by `devcoach install`: run it again after each upgrade (with `--gemini` or `--codex` for those agents). `devcoach doctor` says when the copy is out of date.</Note>
<Note n={3} id="ask">No hooks there: say *set up devcoach* once, then ask for a lesson (*teach me something from what we just did*). The devcoach skill's rules reach the model only through the **devcoach_instructions** prompt, if you attach it where the agent lists MCP prompts.</Note>
<Note n={4} id="gemini">Gemini CLI asks you to allow the devcoach skill when it loads it.</Note>
<Note n={5} id="codex-trust">Codex runs new hooks only after you trust them (its *Hooks need review* screen, or `/hooks`), and again after they change.</Note>
<Note n={6} id="codex-toml">Without `codex` on your PATH, `devcoach install --codex` prints a `[mcp_servers.devcoach]` block to add to `~/.codex/config.toml`; until then Codex has no devcoach tools.</Note>
</Notes>

## Compare the methods

Each method's page covers install *and* connect.

<Matrix label="Compare the install methods" minWidth={34}>

| Method | Brings its own Node.js | Adds the `devcoach` command | Hooks and skill after an upgrade |
|---|---|---|---|
| [Claude Code plugin](./claude-code-plugin.md) | <No>Yours (24+) and npm</No> | <No>No</No> | Updated with the plugin<Ref n={1} to="bundled" /> |
| [Homebrew](./homebrew.md) | <Yes>Installs it</Yes> | <Yes>Yes</Yes> | `devcoach install` again |
| [Windows](./windows.md) *(beta)* | <Yes>Installs it</Yes> | <Yes>Yes</Yes> | Re-run the line; Scoop: `devcoach install` again |
| [npx / npm](./npx.md) | <No>Yours (24+)</No> | <Partly>With npm, not npx</Partly> | `devcoach install` again |
| [Claude Desktop extension](./claude-desktop.md) *(beta)* | <Yes>Claude Desktop's own</Yes> | <No>No</No> | No hooks or skill |
| [Gemini CLI](./gemini-cli.md) *(beta)* | <Partly>With Homebrew or Windows; else yours (24+)</Partly> | <Partly>With Homebrew, npm or Windows</Partly> | `devcoach install --gemini` again, or the new extension |
| [Codex CLI](./codex.md) *(beta)* | <Partly>With Homebrew or Windows; else yours (24+)</Partly> | <Partly>With Homebrew, npm or Windows</Partly> | `devcoach install --codex` again, then trust changed hooks<Ref n={5} to="codex-trust" /> |
| [Other MCP agents](./other-agents.md), [MCP Registry](./other-agents.md#mcp-registry) | <No>Yours (24+)</No> | <No>No</No> | No hooks or skill |

</Matrix>

Without the command, ask your agent to open the web dashboard (`/devcoach:ui` with the plugin) and run
CLI commands as `npx -y devcoach …`. The MCP Registry entry (`io.github.UltimaPhoenix/devcoach`, npm
package `devcoach`, stdio) passes no arguments: your client's command must end in `mcp`.

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Once installed: onboarding and your first lesson.
  </Card>
</Cards>
