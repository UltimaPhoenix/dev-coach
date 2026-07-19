---
title: Gemini CLI
sidebar_label: Gemini CLI (Beta)
description: Install devcoach in Google Gemini CLI — MCP server, AfterAgent lesson hooks, and the coaching skill, via one command or the Gemini extension.
keywords: [devcoach gemini cli, gemini cli mcp server, gemini cli extension, gemini cli hooks, gemini agent skills]
---

# Gemini CLI *(Beta)*

devcoach runs the **full coaching loop** in Google's Gemini CLI: the MCP server (tools + resources),
automatic lesson cues after each task (Gemini's `AfterAgent`/`BeforeAgent` hooks mirror Claude Code's
Stop/UserPromptSubmit), and the devcoach **agent skill**. Requires **Node.js ≥ 24** and Gemini CLI
with hooks support.

:::info Beta
The Gemini CLI integration is **beta**: the coaching engine is the same battle-tested core used with
Claude Code, but the Gemini hook wiring is newer. Please report anything odd on
[GitHub issues](https://github.com/UltimaPhoenix/dev-coach/issues).
:::

## Option A — one command (recommended)

```bash
npx -y devcoach install --gemini
```

This registers everything devcoach needs:

- **MCP server** — via `gemini mcp add` when the `gemini` CLI is on your PATH (falls back to writing
  `~/.gemini/settings.json`)
- **Hooks** — `AfterAgent` (lesson cue after each task) + `BeforeAgent` (priming) in
  `~/.gemini/settings.json`
- **Skill** — the devcoach coaching skill into `~/.agents/skills/devcoach/` (the cross-tool
  [Agent Skills](https://geminicli.com/docs/cli/skills/) directory Gemini reads natively)

Check the wiring anytime with `npx -y devcoach doctor`, and re-run the install after upgrading
devcoach to refresh the skill.

## Option B — the Gemini extension

The devcoach extension bundles the MCP server, hooks, and skill in one package. Grab
`devcoach-gemini-extension-<version>.zip` from the
[latest release](https://github.com/UltimaPhoenix/dev-coach/releases/latest), unzip it, and:

```bash
gemini extensions install <path-to-unzipped-folder>
```

:::warning Pick ONE option
Install the extension **or** run `devcoach install --gemini` — not both. Both register the same
hooks, and a double registration would double-count your interactions (devcoach detects the
extension and skips the duplicate hooks, but keep it to one on purpose). `devcoach doctor` warns
if both are active.
:::

## How pacing works

Identical to Claude Code: lessons are rate-limited (default max 2/day, 4h gap) and paced every N
interactions per session. A hook-forced retry never re-cues (Gemini sends the same
`stop_hook_active` guard Claude does), and plan-style turns are unaffected.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
