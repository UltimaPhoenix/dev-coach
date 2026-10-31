---
title: Command line (CLI)
sidebar_label: Command line (CLI)
---

# Command line (CLI)

**What it's for:** querying and managing your coaching data from the terminal — quick lookups, scripting,
backups, and tuning settings without leaving the shell. It's a power-user companion to the automatic
[coaching in your agent](./coaching.md); everything here is also available in the
[web dashboard](./web-ui.md).

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

## Setup & integration

| Command | Description |
|---|---|
| `devcoach mcp` | Start the MCP server (stdio) — used by your agent's MCP config |
| `devcoach install [--claude-code] [--claude-desktop] [--gemini] [--codex] [--force] [--skip-hook]` | Register the MCP server (user scope) + hooks + skill for the chosen agents; repairs stale hook layouts |
| `devcoach uninstall [--claude-code] [--claude-desktop] [--gemini] [--codex] [--all] [--data] [--yes]` | The inverse of `install`: removes the MCP registration, the devcoach hook entries and the skill dirs (user hooks untouched); `--data` also deletes `~/.devcoach` after a prompt. Run it before `brew uninstall` / `npm uninstall -g` |
| `devcoach doctor` | Diagnose the wiring and the pacing state: hooks, skill, and the command each agent starts devcoach with (Claude Code; Claude Desktop, resolved on the PATH from Claude Desktop's own log; Gemini and Codex when present) — that it exists, which Node it runs on and which devcoach version — then explains why the next stop would or wouldn't cue a lesson |
| `devcoach setup` | Interactive terminal onboarding wizard in four steps: backup path (or skip) → automatic or manual topics → optional groups → daily limit and minimum gap |
| `devcoach ui [--port <n>] [--open]` | Launch the web dashboard (default port 7860, or `DEVCOACH_UI_PORT`; binds `127.0.0.1` only). The URL is printed as a clickable terminal link; `--open` also launches your default browser. **Ctrl+C stops it gracefully** (in-flight requests finish) |
| `devcoach ui --stop [--port <n>]` | Stop the dashboard listening on that port — yours, or one your agent started with `open_ui` / `/devcoach:ui` (those run detached, so Ctrl+C cannot reach them) |
| `devcoach stop-hook` / `prompt-hook` | Claude Code hooks (hidden from `--help`): Stop (onboarding check + lesson cue) and UserPromptSubmit (priming). Exit 0 always; silent or a JSON directive on stdout. Trace decisions with `DEVCOACH_HOOK_DEBUG=1` |
| `devcoach gemini-stop-hook` / `gemini-prompt-hook` | The same pair for Gemini CLI (beta), registered by `install --gemini` |
| `devcoach codex-stop-hook` / `codex-prompt-hook` | The same pair for Codex (beta), registered by `install --codex` |
| `devcoach onboard-hook` / `lesson-ready` | Legacy two-entry Stop hooks (still supported; `install` migrates to `stop-hook`) |

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
| `devcoach lessons [--period <p>] [--level <l>] [--category <c>] [--project/--repository/--branch/--commit <…>] [--starred] [--imported] [--from <name>] [--feedback <yes\|new\|lost\|none>] [--date-from/--date-to <YYYY-MM-DD>] [--search <text>] [--sort <col>] [--order <asc\|desc>] [-n <n>] [--json]` | Your lessons, newest first, grouped by day on a terminal; one tab-separated row per lesson on a pipe — see [Reading your lessons](#reading-your-lessons) |
| `devcoach lesson <id> \| --last [--short \| --md \| --json] [--width <n>] [--no-pager]` | Read one lesson: its text, then its id, the dashboard link and the command that answers it. The id may be the start of one |
| `devcoach star <id>` / `unstar <id>` | Star / unstar |
| `devcoach delete <id>` | Permanently delete a lesson |
| `devcoach feedback <id> <yes\|new\|lost\|clear>` | Answer “Already knew it?” under a lesson (`yes` adds a point of confidence; an untracked topic is added at 6/10) |
| `devcoach courses` | List your step-by-step [courses](./courses.md) with progress |
| `devcoach course <id>` | Show a course: chain, steps, progress, where its document lives |
| `devcoach share [id] [--last] [--link] [--file [path]] [--with-context] [--by <name> \| --anonymous]` | Hand a lesson to a teammate — see [Sharing a lesson](#sharing-a-lesson) |
| `devcoach import [source]` | Add a shared lesson — code, card text, link, URL, `.devcoach.md`, JSON export, `-` for stdin; no argument reads the **clipboard** |

## Reading your lessons

`devcoach lesson <id>` prints the lesson the way your agent showed it, laid out for the terminal:

```text
── 🎓 devcoach ─────────────────────────────────────────────────────────────────
busy_timeout: SQLite has no lock queue
sqlite · mid · 2026-10-25

The SQLITE_BUSY you just fixed: the hook and the MCP server wrote to coaching.db
at the same instant. …

── ts ──────────────────────────────────────────────────────────────────────────
│ conn.exec("BEGIN");           // deferred: locks at the first UPDATE
│ conn.exec("BEGIN IMMEDIATE"); // locks now — where the timeout waits

💡 Senior tip: 3 s is a ceiling, not a target — open withTransaction with BEGIN
   IMMEDIATE and keep writes short.
────────────────────────────────────────────────────────────────────────────────
id         busy-timeout-no-lock-queue
dashboard  http://127.0.0.1:7860/lessons/busy-timeout-no-lock-queue
course     SQLite locking, step by step · 2/5
knew it?   devcoach feedback busy-timeout-no-lock-queue yes|new|lost
```

- The line under the title is `topic · level · date`, then `shared by <name>` for a shared lesson, your
  answer once you gave one (`✅ knew it`, `✨ new to me`, `❌ lost me`) and `★` when starred.
- Code sits in a `│` gutter under a `── language ──` rule and is never re-flowed: a line wider than the
  terminal continues under `↳`, cut at a space.
- `dashboard` is a link only when the dashboard is running; otherwise it reads `devcoach ui -o`, the
  command that starts and opens it. `course` appears when a [course](./courses.md) grew from the lesson.
- `knew it?` is the command that answers the question, and disappears once you answered.
- Links written in a lesson print as `text (url)` and are never made clickable: a lesson can come from
  someone else. Every character that could drive your terminal is removed before printing.
- Taller than the terminal → it opens in your pager (`DEVCOACH_PAGER`, then `PAGER`, then `less -FRX`;
  `--no-pager` or `PAGER=cat` to turn it off). A pipe is never paged.

| Flag | What you get |
|---|---|
| `--short` | The previous view: the metadata block (date, categories, project, branch, commit, folder) and the summary |
| `--md` | The chat card as markdown, bands included — the same bytes `share` puts in its text |
| `--json` | The lesson as JSON, for scripts (invisible and control characters written as `\uXXXX`) |
| `--last` | The most recent of your own lessons (shared ones left out) |
| `--width <n>` | Lay out for `n` columns (20–1000); without it the terminal's width, at most 100 |
| `--no-pager` | Print straight to the terminal |

An id that matches no lesson is tried as the start of one: `devcoach lesson busy` opens
`busy-timeout-no-lock-queue` when it is the only match, and lists the candidates when there are several.

`devcoach lessons` on a terminal shows the newest 20, grouped by day, two lines each:

```text
Today 2026-10-25
  busy_timeout: SQLite has no lock queue
    busy-timeout-no-lock-queue · sqlite · mid · ○ no answer yet
Yesterday 2026-10-24
★ Fail closed: an empty allowlist deploys nothing
    fail-closed-allowlist-deploy-staging · ci_cd · senior · ✅ knew it

20 of 23 lessons · devcoach lesson <id> opens one · -n 23 for all
```

`-n <n>` shows more or fewer; `--search <text>` keeps the lessons that contain every word (title, topic,
text, sender) and marks the matches. Any `--sort` other than the date prints the list without day
headers, the date in each second line. On a pipe the same command prints every matching lesson as one
tab-separated row — date, id, answer (`yes`, `new`, `lost` or `-`), title — with no colour and nothing
cut, ready for `cut`, `awk` or `grep`; `--json` gives the full rows.

`devcoach feedback <id> yes|new|lost|clear` confirms in two lines, what was recorded and what it changed:

```text
✅ knew it · busy_timeout: SQLite has no lock queue
   sqlite · confidence 5 → 6
```

`new` says `confidence unchanged · the level was right`; `lost` points at a course
(`ask your agent for a course on it`, or the course already grown from the lesson); `clear` gives the
point of a `yes` back.

Errors go to stderr, so `devcoach lesson <id> --json | jq` and the pipe form of `lessons` only ever see
data.

## Stats & settings

| Command | Description |
|---|---|
| `devcoach stats` | Lesson counts, rate-limit status, how long your lessons are and how many you answered (`lessons: avg 142 words · feedback answered 40 %`), weakest/strongest topics |
| `devcoach settings` | Show current settings — `max_per_day`, `min_gap_minutes`, `nudge_every`, `nudge_scope`, `share_name` |
| `devcoach set max_per_day <n>` | Max lessons per 24h (1–20, default 2) |
| `devcoach set min_gap_minutes <n>` | Minimum minutes between lessons (0–1440, default 240) |
| `devcoach set nudge_every <n>` | Interactions between lesson cues (0–1000, default 10; 0 = every turn) |
| `devcoach set nudge_scope <session\|global>` | Count interactions per chat session (default) or globally |
| `devcoach set share_name <name>` | The sender name proposed by `share` (max 80 chars; empty clears → git `user.name`) |

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

## Sharing a lesson

One lesson, three transports — the receiver never has to tell them apart:

```bash
devcoach share --last                 # the card + one devcoach:lesson:1:… line → paste anywhere
devcoach share <id> --link            # https://ultimaphoenix.github.io/dev-coach/lesson#devcoach:lesson:1:…
devcoach share <id> --file            # writes <id>.devcoach.md (YAML front matter + markdown)
devcoach share <id> --with-context    # also project/branch/commit/task — never a local folder path
devcoach share <id> --by "Ada" | --anonymous   # sender name (default: share_name → git user.name)
```

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
[Sharing lessons](./sharing.md) guide. `--by` is remembered as `share_name` the first time (change it
with `devcoach set share_name`).

## Environment variables

| Variable | Effect |
|---|---|
| `DEVCOACH_DIR` | Relocate the data directory (default `~/.devcoach`) — sandboxing, tests, a second profile |
| `DEVCOACH_HOOK_DEBUG=1` | Trace every hook decision to `~/.devcoach/hook.log` |
| `DEVCOACH_UI_PORT` | The dashboard's port: where `devcoach ui` listens by default and where `devcoach lesson` looks for it (default 7860) |
| `DEVCOACH_PAGER` / `PAGER` | The pager for a lesson taller than the terminal (default `less -FRX`; on Windows only when set). Empty or `cat` turns paging off |
| `NO_COLOR` | Disable coloured terminal output (wins over `FORCE_COLOR`; emoji stay) |
| `FORCE_COLOR` | Colour even on a pipe; `0` or `false` turns colour off. `TERM=dumb` turns it off unless forced |
| `FORCE_HYPERLINK=1` | Make the dashboard URL a clickable OSC 8 link on terminals devcoach does not detect |
| `COLUMNS` | Width when stdout is not a terminal (default 80; the reading views stop at 100 unless `--width` is given) |

## Examples

```bash
devcoach lessons --period week --level senior --starred
devcoach lessons --category docker --sort timestamp --order asc
devcoach lessons --search "cache key" -n 50
devcoach lessons --feedback none | cut -f2      # the ids you have not answered yet
devcoach lesson --last
devcoach lesson busy-timeout --short
devcoach feedback busy-timeout-no-lock-queue yes
devcoach set min_gap_minutes 120
devcoach backup ~/devcoach-$(date +%F).zip
devcoach share --last --link
devcoach import
```
