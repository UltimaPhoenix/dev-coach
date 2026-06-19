---
title: Command line (CLI)
sidebar_label: Command line (CLI)
---

# Command line (CLI)

**What it's for:** querying and managing your coaching data from the terminal — quick lookups, scripting,
backups, and tuning settings without leaving the shell. It's a power-user companion to the automatic
[coaching in your agent](./coaching.md); everything here is also available in the
[web dashboard](./web-ui.md).

Built on [Commander](https://github.com/tj/commander.js), so every command supports `--help`.

```bash
devcoach --help              # list all commands
devcoach <command> --help    # usage for one command
devcoach --version
```

> Prefix any command with `npx -y` if you haven't installed globally (`npm i -g devcoach`).
> Mutating commands write to `~/.devcoach/coaching.db`; sandbox them with `HOME=$(mktemp -d) devcoach …`.

## Setup & integration

| Command | Description |
|---|---|
| `devcoach mcp` | Start the MCP server (stdio) — used by your agent's MCP config |
| `devcoach install [--claude-code] [--claude-desktop] [--force] [--skip-hook]` | Register the MCP server (user scope) + Stop hooks |
| `devcoach setup` | Interactive onboarding wizard (import a backup or build a profile) |
| `devcoach ui [--port <n>]` | Launch the web dashboard (default port 7860) |
| `devcoach onboard-hook` / `lesson-ready` | Claude Code Stop hooks (exit 0 silent / exit 2 acts) |

## Knowledge map

| Command | Description |
|---|---|
| `devcoach profile` | Show the knowledge map with confidence bars |
| `devcoach knowledge-add <topic> [--confidence <0-10>] [--group <name>]` | Add or update a topic |
| `devcoach knowledge-remove <topic>` | Remove a topic |
| `devcoach group-add <name>` / `group-remove <name>` | Create / delete a group |
| `devcoach group-assign <topic> <group>` | Move a topic to a group (`Other` to ungroup) |

## Lessons

| Command | Description |
|---|---|
| `devcoach lessons [--period <p>] [--level <l>] [--category <c>] [--project/--repository/--branch/--commit <…>] [--starred] [--feedback <f>] [--date-from/--date-to <YYYY-MM-DD>] [--sort <col>] [--order <asc\|desc>]` | List lessons with filters |
| `devcoach lesson <id>` | Show a single lesson in full |
| `devcoach star <id>` / `unstar <id>` | Star / unstar |
| `devcoach delete <id>` | Permanently delete a lesson |
| `devcoach feedback <id> <know\|dont_know\|clear>` | Record comprehension (adjusts confidence) |

## Stats & settings

| Command | Description |
|---|---|
| `devcoach stats` | Lesson counts, rate-limit status, weakest/strongest topics |
| `devcoach settings` | Show current settings |
| `devcoach set max_per_day <n>` | Max lessons per 24h (1–20, default 2) |
| `devcoach set min_gap_minutes <n>` | Minimum minutes between lessons (0–1440, default 240) |

## Backup, export & import

Your whole profile lives in one place, so moving it between machines is a single command each way.

```bash
# Export everything → a portable zip (settings + knowledge map + lessons + notebook)
devcoach backup ~/devcoach-$(date +%F).zip   # default file: devcoach-backup.zip

# Import on another machine (or restore after a reset)
devcoach restore ~/devcoach-2026-06-19.zip
```

| Command | Description |
|---|---|
| `devcoach backup [file.zip]` | Export settings + knowledge map + lessons + notebook (default `devcoach-backup.zip`) |
| `devcoach restore <file.zip>` | Import a backup — settings overwritten, knowledge upserted, duplicate lessons skipped |

On restore, your profile and full lesson history are merged in; you can also point the
[onboarding wizard](./coaching.md#onboarding) at a backup. The same export/import is available in the
[web dashboard's Settings page](./web-ui.md#settings-settings). For the zip's internal format, see
[Configuration & data](../reference/configuration.md#backup-strategy).

## Examples

```bash
devcoach lessons --period week --level senior --starred
devcoach lessons --category docker --sort timestamp --order asc
devcoach feedback 9f3a know
devcoach set min_gap_minutes 120
devcoach backup ~/devcoach-$(date +%F).zip
```
