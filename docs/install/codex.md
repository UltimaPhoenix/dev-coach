---
title: Codex CLI
sidebar_label: Codex CLI (Beta)
description: Install devcoach in OpenAI Codex CLI — Stop-hook lesson cues and the coaching skill with one command.
keywords: [devcoach codex, codex cli hooks, codex skills, codex hooks.json]
---

# Codex CLI *(Beta)*

devcoach runs the **full coaching loop** in OpenAI's Codex CLI: automatic lesson cues after each
task (Codex's `Stop`/`UserPromptSubmit` hooks use the same wire protocol as Claude Code's) and the
devcoach **agent skill**, which drives devcoach through `devcoach api …` commands in Codex's shell.
Requires **Node.js ≥ 24** and Codex CLI ≥ 0.114 (hooks).

:::info[Beta]
The Codex CLI integration is **beta**: the coaching engine is the same battle-tested core used with
Claude Code, but the Codex hook wiring is newer. Please report anything odd on
[GitHub issues](https://github.com/UltimaPhoenix/dev-coach/issues).
:::

## One command

```bash
npx -y devcoach install --codex
```

This registers everything devcoach needs:

- **Hooks** — `Stop` (lesson cue after each task) + `UserPromptSubmit` (priming) in
  `~/.codex/hooks.json`
- **Skill** — the devcoach coaching skill into `~/.agents/skills/devcoach/` (Codex's user-level
  [Agent Skills](https://developers.openai.com/codex/skills) directory)

Upgrading from 2.x? The same command removes the `[mcp_servers.devcoach]` table the old version
registered — through `codex mcp remove` when the `codex` CLI is on your PATH; otherwise it asks you to
delete it from `~/.codex/config.toml` yourself (devcoach never edits your TOML).

:::note[Trust the hooks once]
Codex asks you to **trust** newly configured hooks the first time they run — approve the devcoach
hooks on your next `codex` session or they stay inert.
:::

Check the wiring anytime with `npx -y devcoach doctor`, and re-run the install after upgrading
devcoach to refresh the skill.

## How pacing works

Identical to Claude Code: lessons are rate-limited (default max 2/day, 4h gap) and paced every N
interactions per session. Codex sends the same `stop_hook_active` loop guard and `permission_mode`
field Claude Code does, so hook-forced retries never re-cue and plan-mode turns stay quiet.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
