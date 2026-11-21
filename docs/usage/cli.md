---
title: Command line (CLI)
sidebar_label: Command line (CLI)
---

import { Cards, Card } from "@site/src/components/Cards";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

# Command line (CLI)

**What it's for:** querying and managing your coaching data from the terminal — quick lookups, scripting,
backups, and tuning settings without leaving the shell. It's a power-user companion to the automatic
[coaching in your agent](./coaching.md); everything here is also available in the
[web dashboard](./web-ui.md).

<Cards columns={3}>
  <Card title="How am I doing?" to="#stats--settings">`devcoach stats`</Card>
  <Card title="What did I learn?" to="#lessons">`devcoach lessons`</Card>
  <Card title="Why no lesson?" to="#setup--integration">`devcoach doctor`</Card>
  <Card title="Open the dashboard" to="#setup--integration">`devcoach ui`</Card>
  <Card title="Hand a lesson over" to="#sharing-a-lesson">`devcoach share`<br />`devcoach import`</Card>
  <Card title="Move to another machine" to="#backup-export--import">`devcoach backup`<br />`devcoach restore`</Card>
</Cards>

:::tip[Using the Claude Code plugin?]
The plugin does the coaching by itself and does not put `devcoach` on your `PATH`, but the CLI is a
useful companion whenever you want the dashboard or your data without going through Claude —
`devcoach ui`, `stats`, `lessons`, `share` / `import`, `backup`. Run it with `npx -y devcoach …`, or
install [Homebrew](../install/homebrew.md) / `npm i -g devcoach` for a bare command. Two commands are
**not** for plugin users: `devcoach install` and `devcoach uninstall` — the plugin owns the hooks and
the skill (`/plugin uninstall devcoach@ultimaphoenix` removes them).
:::

Built on [Commander](https://github.com/tj/commander.js), so every command supports `--help`.

```bash
devcoach --help              # list all commands
devcoach <command> --help    # usage for one command
devcoach --version
```

> Prefix any command with `npx -y` if you haven't installed globally (`npm i -g devcoach`).
> Mutating commands write to `~/.devcoach/coaching.db`; sandbox them with `DEVCOACH_DIR=$(mktemp -d) devcoach …`.

:::note[Real output]
The output on this page is real: devcoach 2.7.1 run on the documentation's demo data (the lessons and
courses of the screenshots), with colours off and the home directory written as `~`. Wide output
scrolls sideways inside its block.
:::

## Setup & integration

| Command | Description |
|---|---|
| `devcoach mcp` | Start the MCP server (stdio) — used by your agent's MCP config |
| `devcoach install [--claude-code] [--claude-desktop] [--gemini] [--codex] [--force] [--skip-hook]` | Register the MCP server (user scope) + hooks + skill for the chosen agents; repairs stale hook layouts |
| `devcoach uninstall [--claude-code] [--claude-desktop] [--gemini] [--codex] [--all] [--data] [--yes]` | The inverse of `install`: removes the MCP registration, the devcoach hook entries and the skill dirs (user hooks untouched); `--data` also deletes `~/.devcoach` after a prompt. Run it before `brew uninstall` / `npm uninstall -g` |
| `devcoach doctor` | Diagnose the wiring and the pacing state: hooks, skill, and the command each agent starts devcoach with (Claude Code; Claude Desktop, resolved on the PATH from Claude Desktop's own log; Gemini and Codex when present) — that it exists, which Node it runs on and which devcoach version — then explains why the next stop would or wouldn't cue a lesson |
| `devcoach setup` | Interactive terminal onboarding wizard in four steps: backup path (or skip) → automatic or manual topics → optional groups → daily limit and minimum gap |
| `devcoach ui [--port <n>] [--open]` | Launch the web dashboard (default port 7860; binds `127.0.0.1` only). The URL is printed as a clickable terminal link; `--open` also launches your default browser. **Ctrl+C stops it gracefully** (in-flight requests finish) |
| `devcoach ui --stop [--port <n>]` | Stop the dashboard listening on that port — yours, or one your agent started with `open_ui` / `/devcoach:ui` (those run detached, so Ctrl+C cannot reach them) |
| `devcoach stop-hook` / `prompt-hook` | Claude Code hooks (hidden from `--help`): Stop (onboarding check + lesson cue) and UserPromptSubmit (priming). Exit 0 always; silent or a JSON directive on stdout. Trace decisions with `DEVCOACH_HOOK_DEBUG=1` |
| `devcoach gemini-stop-hook` / `gemini-prompt-hook` | The same pair for Gemini CLI (beta), registered by `install --gemini` |
| `devcoach codex-stop-hook` / `codex-prompt-hook` | The same pair for Codex (beta), registered by `install --codex` |
| `devcoach onboard-hook` / `lesson-ready` | Legacy two-entry Stop hooks (still supported; `install` migrates to `stop-hook`) |

What `doctor` says once everything is wired, what it says before `install`, and what a first
`install` prints:

<Tabs>
<TabItem value="doctor-ok" label="doctor, all wired" default>

```text title="$ devcoach doctor"

devcoach doctor v2.7.1

Environment
  ✓ Node 24.22.3 via unknown (≥ 24)
  ✓ this devcoach: source (/home/user/dev-coach)

Claude Code wiring
  ✓ Stop hook wired (1 entry)
  ✓ UserPromptSubmit priming hook wired
  → hook runs via npx — needs the npx cache (or network) on every stop
  → hook runs via npx — needs the npx cache (or network) on every stop
  ✓ Claude Code skill installed (current version)
  ✓ MCP server registered (user scope)
  → starts via `npx -y devcoach` — needs the npx cache (or the network) at every start

Claude Desktop
  ✓ registered: npx -y devcoach mcp
  → starts via `npx -y devcoach` — needs the npx cache (or the network) at every start

Database & pacing
  ✓ database opens (~/.devcoach/coaching.db)
  ✓ schema v6, last upgraded by devcoach 2.7.1
  ✓ onboarding complete
    settings: max_per_day=2 · min_gap_minutes=240 · nudge_every=10 · nudge_scope=session
    pacing: 0 session(s) counted, 0 interaction(s) total
  ✓ rate limit: allowed

Verdict
  → the next eligible stop would NOT cue a lesson:
      · pacing: next stop would be 1/10
      · rate limit: allowed
```

</TabItem>
<TabItem value="doctor-missing" label="doctor, nothing installed">

```text title="$ devcoach doctor"

devcoach doctor v2.7.1

Environment
  ✓ Node 24.22.3 via unknown (≥ 24)
  ✓ this devcoach: source (/home/user/dev-coach)

Claude Code wiring
  ✗ no devcoach hooks in ~/.claude/settings.json — run devcoach install
  → Claude Code skill not installed — run devcoach install
  → MCP server not found in ~/.claude.json — it may be registered elsewhere (check with claude mcp get devcoach)

Database & pacing
  ✓ database opens (~/.devcoach/coaching.db)
  ✓ schema v6, last upgraded by devcoach 2.7.1
  ✓ onboarding complete
    settings: max_per_day=2 · min_gap_minutes=240 · nudge_every=10 · nudge_scope=session
    pacing: 0 session(s) counted, 0 interaction(s) total
  ✓ rate limit: allowed

Verdict
  → the next eligible stop would NOT cue a lesson:
      · pacing: next stop would be 1/10
      · rate limit: allowed
```

</TabItem>
<TabItem value="install" label="install">

```text title="$ devcoach install"
Setting up devcoach  (npx -y devcoach mcp)

Claude Code
  MCP server…  ✓ Installed into ~/.claude.json
  Hooks…       ✓ Hooks installed into ~/.claude/settings.json (Stop + UserPromptSubmit)
  Skill…       ✓ Installed into ~/.claude/skills/devcoach

Claude Desktop
  MCP server…  ✓ Installed into ~/.config/Claude/claude_desktop_config.json

→ Restart Claude Desktop to pick up the new server.

Tip: run devcoach backup to export your profile, lessons and settings.
     run devcoach restore <file> to import a backup on a new machine.
     After upgrading devcoach (npm, Homebrew), re-run devcoach install to refresh the skill.
```

</TabItem>
</Tabs>

These three come from a source checkout wired through `npx`, which is why they say `source`,
`via unknown` and `npx -y devcoach`. Yours name your own install (Homebrew, npm, the plugin), the
Node behind it and your paths.

## Knowledge map

| Command | Description |
|---|---|
| `devcoach profile` | Show the knowledge map with confidence bars |
| `devcoach knowledge-add <topic> [--confidence <0-10>] [--group <name>]` | Add or update a topic |
| `devcoach knowledge-remove <topic>` | Remove a topic |
| `devcoach group-add <name>` / `group-remove <name>` | Create / delete a group |
| `devcoach group-assign <topic> <group>` | Move a topic to a group (`Other` to ungroup) |

```text title="$ devcoach profile"
                                  Knowledge Map                                  
╭──────────────────────────┬──────────────────────────┬────────────┬────────────╮
│ Topic                    │ Group                    │ Confidence │ Bar        │
├──────────────────────────┼──────────────────────────┼────────────┼────────────┤
│ debugging_mindset        │ Engineering Fundamentals │       8/10 │ ████████░░ │
│ docker                   │ Infrastructure & DevOps  │       8/10 │ ████████░░ │
│ docker_compose           │ Infrastructure & DevOps  │       8/10 │ ████████░░ │
│ general_engineering      │ Engineering Fundamentals │       8/10 │ ████████░░ │
│ software_architecture    │ Engineering Fundamentals │       8/10 │ ████████░░ │
│ coolify                  │ Infrastructure & DevOps  │       7/10 │ ███████░░░ │
│ …                        │                          │            │            │
│ security                 │ Networking & Security    │       5/10 │ █████░░░░░ │
│ testing                  │ Quality                  │       5/10 │ █████░░░░░ │
│ redis_cache_stampede     │ Other                    │       4/10 │ ████░░░░░░ │
│ django                   │ Backend                  │       3/10 │ ███░░░░░░░ │
╰──────────────────────────┴──────────────────────────┴────────────┴────────────╯
```

Every topic is listed, strongest first. The demo profile has 29 topics; the `…` row
stands for the 19 in the middle.

## Lessons

| Command | Description |
|---|---|
| `devcoach lessons [--period <p>] [--level <l>] [--category <c>] [--project/--repository/--branch/--commit <…>] [--starred] [--imported] [--from <name>] [--feedback <f>] [--date-from/--date-to <YYYY-MM-DD>] [--sort <col>] [--order <asc\|desc>]` | List lessons with filters |
| `devcoach lesson <id>` | Show one lesson: its details, where it happened and its summary (the full text is on its [page in the dashboard](./web-ui.md#lesson-detail-lessonsid)) |
| `devcoach star <id>` / `unstar <id>` | Star / unstar |
| `devcoach delete <id>` | Permanently delete a lesson |
| `devcoach feedback <id> <know\|understood\|dont_know\|clear>` | Record your answer under a lesson (`know` adjusts confidence) |
| `devcoach courses` | List your step-by-step [courses](./courses.md) with progress |
| `devcoach course <id>` | Show a course: chain, steps, progress, where its document lives |
| `devcoach share [id] [--last] [--link] [--file [path]] [--with-context] [--by <name> \| --anonymous]` | Hand a lesson to a teammate — see [Sharing a lesson](#sharing-a-lesson) |
| `devcoach import [source]` | Add a shared lesson — code, card text, link, URL, `.devcoach.md`, JSON export, `-` for stdin; no argument reads the **clipboard** |

```text title="$ devcoach lessons --imported"
                                                 Lessons                                                 
╭───┬────────────┬────────┬──────────────────────────────────────────┬───────┬──────────────┬───────────╮
│   │ Date       │ Topic  │ Title                                    │ Level │ Categories   │ Shared by │
├───┼────────────┼────────┼──────────────────────────────────────────┼───────┼──────────────┼───────────┤
│ · │ 2026-11-16 │ sqlite │ WAL mode: readers never block writers 💡 │  mid  │ sqlite, node │ Ada       │
╰───┴────────────┴────────┴──────────────────────────────────────────┴───────┴──────────────┴───────────╯
```

`--imported` keeps the lessons shared with you. A lesson that happened in a git repository adds the
`Project`, `Branch` and `Commit` columns, so the list of your own lessons is wider:

<details>
<summary>The whole list: <code>devcoach lessons</code></summary>

```text title="$ devcoach lessons"
                                                                                                                Lessons                                                                                                                 
╭───┬────────────┬───────────────────────────┬────────────────────────────────────────────────────────────────────────────┬────────┬────────────────────────────────────────────────────────┬───────────┬────────┬─────────┬───────────╮
│   │ Date       │ Topic                     │ Title                                                                      │ Level  │ Categories                                             │ Project   │ Branch │ Commit  │ Shared by │
├───┼────────────┼───────────────────────────┼────────────────────────────────────────────────────────────────────────────┼────────┼────────────────────────────────────────────────────────┼───────────┼────────┼─────────┼───────────┤
│ · │ 2026-11-18 │ redis_cache_stampede      │ Cache stampede — when every server hits the DB at the same moment ✗        │ senior │ redis, performance_optimization, software_architecture │ dev-coach │ main   │ d3ae15d │           │
│ · │ 2026-11-16 │ sqlite                    │ WAL mode: readers never block writers 💡                                   │  mid   │ sqlite, node                                           │           │        │         │ Ada       │
│ · │ 2026-11-12 │ ci_cd_pipeline_design     │ CI pipeline stage design — fail fast, cache smart, deploy never on red ✓   │ senior │ ci_cd                                                  │ dev-coach │ main   │ 99f210c │           │
│ ★ │ 2026-11-05 │ git_interactive_rebase    │ Interactive rebase — rewriting history before it becomes permanent         │  mid   │ git                                                    │ dev-coach │ main   │ c9068af │           │
│ · │ 2026-10-18 │ postgresql_query_planning │ EXPLAIN ANALYZE — reading a query plan before your users feel the slowness │  mid   │ postgresql, performance_optimization                   │ dev-coach │ main   │ 4d94afd │           │
│ · │ 2026-09-21 │ docker_layer_caching      │ Docker layer caching — why COPY order decides your build speed             │ junior │ docker, infrastructure                                 │ dev-coach │ main   │ baba85c │           │
╰───┴────────────┴───────────────────────────┴────────────────────────────────────────────────────────────────────────────┴────────┴────────────────────────────────────────────────────────┴───────────┴────────┴─────────┴───────────╯
```

</details>

In the first column `★` is a starred lesson. The mark after a title is your answer: `✓` knew it,
`💡` understood, `✗` couldn't follow; no mark means no answer yet.

```text title="$ devcoach lesson lesson-git-interactive-rebase-001"
── Interactive rebase — rewriting history before it becomes permanent ──────────
ID:         lesson-git-interactive-rebase-001
Date:        2026-11-05 23:06:18
Topic:       git_interactive_rebase
Categories:  git
Level:       mid
Star:        ★ starred   Feedback: no feedback
Context:     Cleaning up a feature branch before opening a pull request
Git:         project=dev-coach · repo=developer/dev-coach · branch=main · commit=c9068af · folder=/home/user/development/claude-projects/dev-coach
────────────────────────────────────────────────────────────────────────────────
git rebase -i lets you squash, reorder, split, and reword commits before pushing; fixup commits keep the log clean without losing granular checkpoints during development.
```

```text title="$ devcoach courses"
                                                           Courses                                                           
╭───────────────────────────────────────────┬───────────────────────────────────────────┬──────────┬───────────┬────────────╮
│ ID                                        │ Title                                     │ Progress │ Status    │ Updated    │
├───────────────────────────────────────────┼───────────────────────────────────────────┼──────────┼───────────┼────────────┤
│ from-a-cache-miss-to-a-stampede           │ From a cache miss to a stampede           │   2/5    │ active    │ 2026-11-20 │
│ retry-with-exponential-backoff-and-jitter │ Retry with exponential backoff and jitter │   4/4    │ completed │ 2026-11-09 │
╰───────────────────────────────────────────┴───────────────────────────────────────────┴──────────┴───────────┴────────────╯
```

```text title="$ devcoach course from-a-cache-miss-to-a-stampede"
── From a cache miss to a stampede ─────────────────────────────────────────────
ID:        from-a-cache-miss-to-a-stampede
Topic:     redis_cache_stampede   Status: active   Progress: 2/5
Goal:      Read a stampede off the origin's load curve and flatten it with jittered TTLs, single-flight rebuilds and stale-while-revalidate.
From:      lesson lesson-redis-cache-stampede-001
Document:  ~/.devcoach/courses/from-a-cache-miss-to-a-stampede/index.html
Chain:     ✓ cache keys with a TTL → ✗ the thundering herd → ✗ single-flight rebuilds

  ● 1. One key, many readers  concept · #step-1 · done
  ● 2. What the origin sees  example · #step-2 · done
  ○ 3. Predict the spike  check · #step-3
  ○ 4. One flight at a time  example · #step-4
  ○ 5. Serve stale, refresh behind  practice · #step-5
```

`Chain` is what the course asked you before it started: `✓` you knew it, `✗` you didn't.

## Stats & settings

| Command | Description |
|---|---|
| `devcoach stats` | Lesson counts, rate-limit status, weakest/strongest topics |
| `devcoach settings` | Show current settings — `max_per_day`, `min_gap_minutes`, `nudge_every`, `nudge_scope`, `share_name` |
| `devcoach set max_per_day <n>` | Max lessons per 24h (1–20, default 2) |
| `devcoach set min_gap_minutes <n>` | Minimum minutes between lessons (0–1440, default 240) |
| `devcoach set nudge_every <n>` | Interactions between lesson cues (0–1000, default 10; 0 = every turn) |
| `devcoach set nudge_scope <session\|global>` | Count interactions per chat session (default) or globally |
| `devcoach set share_name <name>` | The sender name proposed by `share` (max 80 chars; empty clears → git `user.name`) |

```text title="$ devcoach stats"
            Coaching Stats             
╭─────────────────────┬───────────────╮
│ Total lessons       │             6 │
│ Lessons today (24h) │         0 / 2 │
│ Lessons this week   │             1 │
│ Next lesson         │ Available now │
╰─────────────────────┴───────────────╯
╭──────────────────────────┬───────────────────────────╮
│ Weakest topics           │ Strongest topics          │
├──────────────────────────┼───────────────────────────┤
│ django (3)               │ software_architecture (8) │
│ redis_cache_stampede (4) │ general_engineering (8)   │
│ fastapi (5)              │ docker_compose (8)        │
│ html_css (5)             │ docker (8)                │
│ python (5)               │ debugging_mindset (8)     │
╰──────────────────────────┴───────────────────────────╯
```

`Total lessons` counts the lessons shared with you too. `Lessons today (24h)` and
`Lessons this week` (the last 7 days) count only your own, the same lessons `max_per_day` counts. The
topics are the five lowest and the five highest confidences in your knowledge map.

```text title="$ devcoach settings"
                  Settings                   
╭─────────────────┬─────────────────────────╮
│ Key             │                   Value │
├─────────────────┼─────────────────────────┤
│ max_per_day     │                       2 │
│ min_gap_minutes │             240 (4h 0m) │
│ nudge_every     │                      10 │
│ nudge_scope     │                 session │
│ share_name      │ (unset → git user.name) │
╰─────────────────┴─────────────────────────╯
```

## Backup, export & import

Your whole profile lives in one place, so moving it between machines is a single command each way.

```bash
# Export settings, knowledge map, lessons, notebook and courses → a portable zip
devcoach backup ~/devcoach-$(date +%F).zip   # default file: devcoach-backup.zip

# Import on another machine (or restore after a reset)
devcoach restore ~/devcoach-2026-06-19.zip
```

| Command | Description |
|---|---|
| `devcoach backup [file.zip]` | Export settings + knowledge map + lessons + notebook + [courses](./courses.md) (default `devcoach-backup.zip`) |
| `devcoach restore <file.zip>` | Import a backup — settings overwritten, knowledge upserted, duplicate lessons skipped; courses come back too, and an existing one is never overwritten |

A backup of the demo profile, then its restore on a new machine. The courses travel in the zip and
come back with it, though neither command counts them:

```text title="$ devcoach backup ~/devcoach-backup.zip"
Backup saved: ~/devcoach-backup.zip  (6 lessons, 29 topics + notebook)
```

```text title="$ devcoach restore ~/devcoach-backup.zip"
✓ Settings restored
✓ Knowledge map restored (29 topics)
✓ Lessons: 6 imported
✓ Notebook restored
```

On restore, your profile and full lesson history are merged in; you can also point the
[onboarding wizard](./coaching.md#onboarding) at a backup. The same export/import is available in the
[web dashboard's Settings page](./web-ui.md#settings-settings). For the zip's internal format, see
[Configuration & data](../reference/configuration.md#backup-strategy).

## Sharing a lesson

One lesson, three transports — the receiver never has to tell them apart:

```bash
devcoach share --last                 # the card + one devcoach:lesson:1:… line → paste anywhere
devcoach share <id> --link            # https://ultimaphoenix.github.io/dev-coach/lesson#devcoach:lesson:1:…
devcoach share <id> --file            # writes <id>.devcoach.md (YAML front matter + markdown)
devcoach share <id> --with-context    # also project/branch/commit/task — never a local folder path
devcoach share <id> --by "Ada" | --anonymous   # sender name (default: share_name → git user.name)
```

`--by` is remembered as `share_name` the first time (change it with `devcoach set share_name`).

Receiving is one command, whatever you were given:

```bash
devcoach import                       # no argument: reads the clipboard
devcoach import lesson.devcoach.md    # a file
devcoach import "devcoach:lesson:1:…" # the code, or the whole copied card in quotes
devcoach import https://…             # a share link, or any URL whose body is a shared lesson
pbpaste | devcoach import -           # stdin
```

`devcoach lessons --imported` lists the lessons shared with you, `--from <name>` only those from one
sender (the free-text search matches sender names too). What travels, the `.devcoach.md`
format and how an imported lesson behaves (it never counts against `max_per_day`) are in the
[Sharing lessons](./sharing.md) guide.

## Environment variables

| Variable | Effect |
|---|---|
| `DEVCOACH_DIR` | Relocate the data directory (default `~/.devcoach`) — sandboxing, tests, a second profile |
| `DEVCOACH_HOOK_DEBUG=1` | Trace every hook decision to `~/.devcoach/hook.log` |
| `NO_COLOR` | Disable coloured terminal output (wins over `FORCE_COLOR`) |
| `FORCE_COLOR` | Colour even on a pipe; `0` or `false` turns colour off. `TERM=dumb` turns it off unless forced |
| `FORCE_HYPERLINK=1` | Make the dashboard URL a clickable OSC 8 link on terminals devcoach does not detect |
| `COLUMNS` | Width for rules when stdout is not a terminal (default 80, rules stop at 100) |

## Examples

```bash
devcoach lessons --period week --level senior --starred
devcoach lessons --category docker --sort timestamp --order asc
devcoach feedback 9f3a know
devcoach set min_gap_minutes 120
devcoach backup ~/devcoach-$(date +%F).zip
devcoach share --last --link
devcoach import
```
