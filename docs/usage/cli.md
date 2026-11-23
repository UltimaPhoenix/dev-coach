---
title: Command line (CLI)
sidebar_label: Command line (CLI)
description: Every devcoach command, with its real output in colour. Look up your lessons and knowledge map, record answers, change settings, back up and restore, share lessons, and check the wiring.
---

import { Cards, Card } from "@site/src/components/Cards";
import RefTable from "@site/src/components/RefTable";
import Terminal from "@site/src/components/Terminal";
import cli from "@site/src/data/cli-output.json";

export const feedbackOutput =
  "Lesson \u001b[36mlesson-git-interactive-rebase-001\u001b[39m → \u001b[32m✓ I knew this\u001b[39m  (\u001b[36mgit_interactive_rebase\u001b[39m confidence: 5 → \u001b[1m6\u001b[22m)";

# Command line (CLI)

Your lessons, knowledge map, settings and backups, from a terminal. Your agent does the coaching; the
CLI is for looking things up, scripting and moving your data.

<Cards columns={3}>
  <Card title="How am I doing?" to="#stats--settings">`devcoach stats`</Card>
  <Card title="What did I learn?" to="#lessons">`devcoach lessons`</Card>
  <Card title="Why no lesson?" to="/troubleshooting#coaching-isnt-firing--no-lessons-appear">`devcoach doctor`</Card>
  <Card title="Open the dashboard" to="/usage/web-ui#launch">`devcoach ui`</Card>
  <Card title="Hand a lesson over" to="#sharing-a-lesson">`devcoach share`<br />`devcoach import`</Card>
  <Card title="Move to another machine" to="#backup-export--import">`devcoach backup`<br />`devcoach restore`</Card>
</Cards>

## Run it

Every command is `devcoach <command>`; `devcoach --help` lists them, `devcoach <command> --help` shows
one command's options and `devcoach --version` prints the version.

<RefTable>

| You installed devcoach with | Type |
|---|---|
| Homebrew, the installer or Scoop on [Windows (beta)](../install/windows.md), or `npm i -g devcoach` | `devcoach <command>` |
| the Claude Code plugin | `npx -y devcoach <command>`, with Node.js 24 or newer: the plugin coaches without the CLI and puts nothing on your PATH. npx runs the newest release: when a release changes the database format, the plugin can only read your data until you [update it](../install/claude-code-plugin.md#updating), so keep the plugin up to date or run its version (`npx -y devcoach@<version> <command>`). Skip `install` and `uninstall` here: `install` would register a second devcoach server and a second copy of the devcoach skill, and `/plugin uninstall devcoach@ultimaphoenix` removes the plugin's own parts. |
| nothing yet | `npx -y devcoach <command>`, with Node.js 24 or newer. |

</RefTable>

## Lessons

<RefTable>

| Command | What it does |
|---|---|
| `lessons` | List your lessons, newest first, with the [filters](#lesson-filters) below. |
| `lesson <id>` | One lesson: its details, where it happened and its summary. The full text is on its [page in the dashboard](./web-ui.md#lesson-detail-lessonsid). |
| `star <id>` `unstar <id>` | Star a lesson, or remove the star. |
| `feedback <id> <answer>` | Record your answer: `know`, `understood`, `dont_know`, or `clear` to remove it. `know` raises the topic's confidence by one point; changing it to anything else takes the point back. |
| `delete <id>` | Delete a lesson for good. |
| `courses` | Your step-by-step [courses](./courses.md), with their IDs and progress. |
| `course <id>` | One course: its goal, the lesson it grew from, its steps and where its document is. |

</RefTable>

The output on this page is real: devcoach installed with npm, on the documentation's demo data,
in the terminal's colours.

<Terminal
  command="devcoach lessons"
  output={cli.lessons}
  caption="★ starred. After a title, your answer: ✓ knew it, 💡 understood, ✗ couldn't follow. Lessons from a git repository add Project, Branch and Commit; shared ones add Shared by. Scroll sideways for more."
/>

### Where a lesson's ID comes from {/* #lesson-ids */}

`lesson`, `star`, `unstar`, `feedback`, `delete` and `share <id>` need a lesson's whole ID, such as
`lesson-redis-cache-stampede-001`, and `devcoach lessons` does not show it.

<Terminal command="devcoach lesson lesson-redis-cache-stampede-001" output={cli.lesson} />

Get it from one of these:

<Cards columns={3}>
  <Card label="Dashboard" title="On the lesson's page" to="/usage/web-ui#lesson-detail-lessonsid">
    The last line of the page, and the end of its address: `/lessons/<id>`.
  </Card>
  <Card label="Agent" title="Ask for it">
    *"What is the ID of my lesson on rebase?"* Its `get_lessons` tool returns IDs.
  </Card>
  <Card label="CLI" title="Printed along the way">
    `import` prints the ID it adds; `course <id>`, the lesson the course grew from. `share --last` shares
    your newest lesson without one.
  </Card>
</Cards>

<Terminal
  command="devcoach feedback lesson-git-interactive-rebase-001 know"
  output={feedbackOutput}
  caption="With the ID, the other commands work. Here know raises the topic's confidence by one point."
/>

### Filters for `lessons` {/* #lesson-filters */}

They combine: `devcoach lessons --period week --level senior --starred`.

<RefTable>

| Option | Values |
|---|---|
| `--period` | `today`, `week`, `month`, `year`, `all` (default) |
| `--level` | `junior`, `mid`, `senior` |
| `--feedback` | `know`, `understood`, `dont_know`, `none` (no answer yet) |
| `--starred` `--imported` `--from <name>` | Only starred lessons; only lessons shared with you; only those one person shared. |
| `--category` `--project` `--repository` `--branch` `--commit` | One category, such as `docker`; part of a name or of a commit hash. |
| `--date-from` `--date-to` | `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`. Either one replaces `--period`. |
| `--sort` `--order` | `timestamp` (default), `level`, `topic_id`, `title`, `feedback`; then `desc` (default) or `asc`. |

</RefTable>

### Courses

`devcoach courses` lists them with their IDs; `devcoach course <id>` shows one.

<Terminal
  command="devcoach course from-a-cache-miss-to-a-stampede"
  output={cli.course}
  caption="Chain is what the course asked you before it started: ✓ you knew it, ✗ you didn't. ● is a step you have done, ○ one still to do."
/>

## Knowledge map

<RefTable>

| Command | What it does |
|---|---|
| `profile` | Every topic in your knowledge map, strongest first, with its group and confidence. |
| `knowledge-add <topic>` `--confidence <0-10>` `--group <name>` | Add a topic, or set one you have. Without `--confidence` it sets 5, also on a topic you already have; `--confidence 0` is stored as 5 too. |
| `knowledge-remove <topic>` | Remove a topic. |
| `group-add <name>` `group-remove <name>` | Create or delete a group. A deleted group's topics move to Other. |
| `group-assign` `<topic> <group>` | Move a topic to a group; `Other` takes it out of its group. |

</RefTable>

<Terminal
  command="devcoach profile"
  output={cli.profile}
  maxLines={10}
  caption="The demo profile has 29 topics. Green is 7 and up, yellow 4 to 6, red below 4."
/>

## Stats & settings

<RefTable>

| Command | What it does |
|---|---|
| `stats` | Lesson counts, whether a lesson can come now, and your five weakest and five strongest topics. |
| `settings` | Your pacing and sharing settings. |
| `set max_per_day <n>` | 1 to 20; default 2. |
| `set min_gap_minutes <n>` | 0 to 1440; default 240. |
| `set nudge_every <n>` | 0 to 1000; default 10. 0 cues a lesson on every reply, within the two limits above. |
| `set nudge_scope <scope>` | `session` (default) or `global`. |
| `set share_name <name>` | Up to 80 characters. `""` clears it, and your git `user.name` is used again. |

</RefTable>

:::warning[`devcoach set` does not check these ranges]
It checks only that `nudge_scope` is `session` or `global`, that `nudge_every` starts with a whole
number of 0 or more, and the length of `share_name`. Anything else is stored as you type it, and a
value out of range, or a word, can stop lessons or remove a limit. Your agent and the dashboard check the ranges.
`devcoach settings` shows a `nudge_every` of 0 as `0 (off)`: it is not off. What each setting does:
[Configuration](../reference/configuration.md#settings).
:::

<Terminal
  command="devcoach stats"
  output={cli.stats}
  caption="Total lessons counts the lessons shared with you too. Lessons today (24h) and Lessons this week (the last 7 days) count only your own: the same lessons max_per_day counts."
/>

## Backup, export & import

A backup is one zip with your settings, knowledge map, lessons, the notebook and your courses. It is
not encrypted.

<RefTable>

| Command | What it does |
|---|---|
| `backup [file.zip]` | Export everything to a zip; by default `devcoach-backup.zip` in the current folder. |
| `restore <file.zip>` | Import a backup: settings and the notebook are replaced, topics added or updated, lessons you already have skipped. Courses come back too, and an existing one is never overwritten. |

</RefTable>

<Terminal command="devcoach backup devcoach-backup.zip" output={cli.backup} />

<Terminal
  command="devcoach restore ~/Downloads/devcoach-backup.zip"
  output={cli.restore}
  caption="The courses travel in the zip and come back with it, though neither command counts them."
/>

The onboarding your agent offers, `devcoach setup` and the
[dashboard's Settings page](./web-ui.md#settings-settings) can restore a backup too. What is inside the
zip, and a dated daily backup: [Configuration & data](../reference/configuration.md#backup-strategy).

## Sharing a lesson

<RefTable>

| Command | What it does |
|---|---|
| `share [id]` `--last` `--link` `--file [path]` `--with-context` `--by <name>` `--anonymous` | Share a lesson (`--last`: your newest) as text to paste, or as a link, or as a `.devcoach.md` file. Your name goes with it unless you remove it: `--by <name>`, else the `share_name` setting, else your git `user.name`; `--anonymous` drops it. `--by` also saves the name as `share_name` when that is empty. `--with-context` adds the project, branch, commit and task; a local folder path never travels. |
| `import [source]` | Add a lesson someone shared with you: the code, the whole copied text, a link, a URL, a `.devcoach.md` or lessons `.json` file, or `-` for stdin. With no argument it reads the clipboard. |

</RefTable>

Examples, what the receiver sees and how an imported lesson behaves:
[Sharing lessons](./sharing.md#from-the-terminal).

## Setup & integration

These commands exist only in the CLI. Everything above is also in the [web dashboard](./web-ui.md).

<RefTable>

| Command | What it does |
|---|---|
| `install` `--claude-code` `--claude-desktop` `--gemini` `--codex` `--force` `--skip-hook` | Connect devcoach to your agents: the MCP server (user scope: all your projects), the hooks and the devcoach skill. With no flag: Claude Code and Claude Desktop. The agent flags pick agents and combine; Gemini CLI and Codex CLI are beta. Running it again repairs older hook entries; `--force` rewrites an existing entry; `--skip-hook` leaves out the hooks. |
| `uninstall` `--all` `--data` `--yes` | Undo `install`: the MCP server, devcoach's hook entries and the devcoach skill go, your own hooks stay. It takes the same agent flags, or `--all` for every agent. Your data stays unless you add `--data`, which asks first unless you add `--yes`. Run it before `brew uninstall` or `npm uninstall -g`. |
| `doctor` | Check the wiring and the pacing, and say why the next reply would or would not bring a lesson. |
| `setup` | The onboarding in your terminal, in four steps: a backup to restore, your topics (detected or typed), groups, and the two limits. A backup at step 1 is restored and ends the wizard; otherwise the wizard replaces your knowledge map and groups. |
| `ui` `--port <n>` `-o, --open` `--stop` | Start the [web dashboard](./web-ui.md#launch) on `127.0.0.1:7860`, open it in your browser, or stop the one running on that port. |
| `mcp` | Start the MCP server (stdio). Your agent runs it from its MCP config. |

</RefTable>

What `install` prints for each agent is on the install pages, such as [Homebrew](../install/homebrew.md)
and [npx / npm](../install/npx.md). What each line of `doctor` means, and the fix for a `→` or a `✗`, is
on [Troubleshooting](../troubleshooting.md).

<Terminal command="devcoach doctor" output={cli.doctor} maxLines={11} />

Eight more commands are hidden from `--help`: `stop-hook`, `prompt-hook` and their Gemini CLI, Codex CLI
and legacy versions. Your agent's hooks run them on each turn; see
[How it works](../how-it-works.md#coaching-loop).

## Environment variables

<details>
<summary>Which variables change what the CLI does?</summary>

<RefTable>

| Variable | Effect |
|---|---|
| `DEVCOACH_DIR` | Moves the data folder (database, notebook, courses, `hook.log`) away from `~/.devcoach`, where every command reads and writes. `DEVCOACH_DIR=$(mktemp -d) devcoach …` runs one on throwaway data. |
| `DEVCOACH_HOOK_DEBUG=1` | Each hook run adds one line with its decision to `hook.log` in the data folder, emptied once it passes 256 KB. |
| `NO_COLOR` | No colours, and no clickable links unless `FORCE_HYPERLINK` is set. It wins over `FORCE_COLOR`. |
| `FORCE_COLOR` | Colours even when the output goes to a pipe or a file; `0` or `false` turn them off. `TERM=dumb` turns them off unless forced. |
| `FORCE_HYPERLINK=1` | Clickable links on a terminal devcoach does not recognise, even with `NO_COLOR` or a pipe. |
| `COLUMNS` | When the output is not a terminal: the width of the `──` rules in `lesson`, `course` and `setup` (default 80, at most 100). |

</RefTable>

</details>

Every variable devcoach reads is on [Configuration](../reference/configuration.md#environment-variables).
