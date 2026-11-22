---
title: Configuration
description: Every devcoach setting with its default and allowed range, the exact pacing rules, and the environment variables.
---

# Configuration

import Link from "@docusaurus/Link";
import { Cards, Card } from "@site/src/components/Cards";
import RefTable from "@site/src/components/RefTable";
import Terminal from "@site/src/components/Terminal";
import cli from "@site/src/data/cli-output.json";

export const doctorPacing = (() => {
  const lines = cli.doctor.split("\n");
  const at = lines.findIndex((line) => line.startsWith("Database & pacing"));
  return at > 3 ? [...lines.slice(0, 3), "…", ...lines.slice(at - 1)].join("\n") : cli.doctor;
})();

export const movedSection = { scrollMarginTop: "calc(var(--ifm-navbar-height) + 16rem)" };

Every setting devcoach has, and the rules that decide when a lesson comes.

<Cards columns={2}>
  <Card title="Settings and pacing" label="On this page" to="#settings-and-pacing">
    The seven settings and where to change them, the exact pacing rules, and the environment variables.
  </Card>
  <Card title="Your data" label="Its own page" to="/reference/data">
    What is in `~/.devcoach`, what a backup holds and what a restore does, how to reset, and the database.
  </Card>
</Cards>

## Settings and pacing {/* #settings-and-pacing */}

The pace is yours to set. The numbers below are the defaults.

### The seven settings {/* #settings */}

They live in the `settings` table of the database and travel in every backup.

<RefTable>

| Setting | What it does | Default |
|---|---|---|
| `max_per_day` | The most lessons in any 24 hours.<br/>Allowed: 1 to 20. | default 2 |
| `min_gap_minutes` | The least time between two lessons, in minutes. `0` means no gap.<br/>Allowed: 0 to 1440. | default 240 (4 h) |
| `nudge_every` | How many interactions (replies of your agent) come between two lesson cues. `0` means a cue on every reply, within the two limits above.<br/>Allowed: 0 to 1000. | default 10 |
| `nudge_scope` | Count interactions per chat session, or all your sessions together.<br/>Allowed: `session`, `global`. | default session |
| `share_name` | The name put on lessons you share. Empty: your git `user.name`, else anonymous. Sharing with `devcoach share --by <name>` while it is empty also sets it.<br/>Allowed: up to 80 characters. | default empty |
| `ui_theme` | The dashboard's colours. `system` follows your OS. Dashboard only.<br/>Allowed: `system`, `light`, `dark`. | default system |
| `ui_home` | Where the dashboard opens. `auto`: Lessons once you have one, the knowledge map before. Dashboard only.<br/>Allowed: `auto`, `lessons`, `knowledge`. | default auto |

</RefTable>

### Where to change them

<Cards columns={3}>
  <Card title="Ask your agent" label="Agent">
    Say *set my max lessons per day to 3*. Its `update_settings` tool checks the range. The first five
    settings.
  </Card>
  <Card title="In a terminal" label="CLI">
    `devcoach set max_per_day 3`, and `devcoach settings` to list them. The first five settings.
  </Card>
  <Card title="On the dashboard" label="Web">
    The Settings page of `devcoach ui`. All seven; the gap is a list of 12 presets, from none to 24 hours.
  </Card>
</Cards>

Your agent sends one key and its value as a string: `{ "key": "max_per_day", "value": "3" }`.
`devcoach ui` starts the dashboard on port 7860 of `127.0.0.1` only, so other machines cannot reach
it: <code style={{ whiteSpace: "nowrap" }}>{"--port <n>"}</code> picks another port,
<code style={{ whiteSpace: "nowrap" }}>--open</code> opens your browser,
<code style={{ whiteSpace: "nowrap" }}>--stop</code> stops the dashboard running on that port. More on the [web dashboard](../usage/web-ui.md) page.

:::warning[Three things to know before you change a setting]

- **`0` is not "off".** `devcoach settings` shows `nudge_every` 0 as `0 (off)`, and an error message
  of `devcoach set` says `0 = off`. Both are wrong: 0 cues a lesson on every reply. For fewer lessons,
  raise `nudge_every` or lower `max_per_day`. The quietest setting is 1000 for `nudge_every` with 1
  for `max_per_day`.
- **`devcoach set` does not check ranges.** It checks only that `nudge_every` starts with a whole
  number of 0 or more (`1.5` and `12abc` pass), that `nudge_scope` is `session` or `global`, and that
  `share_name` is at most 80 characters. Anything else is stored as typed, and a value outside its
  range, or a word, can stop lessons or remove a limit. Your agent's tool and the dashboard do check.
- **The dashboard's gap is a list of presets.** With another value set elsewhere (say 100 minutes), the
  list shows *No cooldown*, and saving the form stores 0. Pick the gap again before you save.

:::

### How pacing works {/* #rate-limits */}

devcoach wires automatic lessons only into Claude Code, Gemini CLI (beta) and Codex CLI (beta). Their
hooks run each time the agent finishes a reply. In Claude Desktop and other MCP agents nothing is
counted: you ask for a lesson. Short sessions may end with no lesson at all; that is by design.

**Each reply your agent finishes is one interaction.** It adds one to the counter of its chat session
(with `nudge_scope` set to `global`, the counters of all sessions add up). These replies do not count:

<RefTable>

| Reply | Why it is not counted |
|---|---|
| **in plan mode** (Claude Code and Codex CLI) | Planning is not coachable work. |
| **the one your agent writes because devcoach asked for it** | It is the turn that answers devcoach's own cue. |
| **any reply before onboarding** | The hook offers onboarding instead. |
| **any reply while a course is in progress** | Cues pause, so nothing interrupts the course, until you complete or abandon it. |
| **any reply while this devcoach can only read the database** | It cannot save anything ([two versions](data.md#two-versions)). |

</RefTable>

**A cue comes** when the counter reaches `nudge_every` and the rate limit allows a lesson: fewer than
`max_per_day` of your own lessons in the last 24 hours (a rolling window, not a calendar day), and at
least `min_gap_minutes` since your last one. A reply that reaches the threshold while the limit says no
still counts, so the cue comes with the first reply the limit allows. With `nudge_every` at 0 there is
no counter: every reply that counts gets a cue, within the rate limit.

**A cue, a lesson and a skip each restart every counter**, in every session. What comes next:

<RefTable>

| After | The next cue needs |
|---|---|
| **a cue your agent has not answered yet** | `min(3, nudge_every)` replies in one session (in total with `global`) |
| **a lesson** (`log_lesson`) | `nudge_every` replies |
| **a skip** (`skip_lesson`), when the work was not technical | `nudge_every` replies |
| **a lesson someone [shared with you](../usage/sharing.md)** | Nothing changes: it never counts toward `max_per_day`, never starts the gap and never restarts a counter. |

</RefTable>

**A lesson you ask for** ("teach me something") comes even when the rate limit says no: the devcoach
skill tells your agent to go ahead. It then counts like any other lesson. How a cue turns into a lesson
card is on [How it works](../how-it-works.md).

#### Where to see the current state

<Terminal
  command="devcoach doctor"
  output={doctorPacing}
  caption={
    <>
      Its last two blocks; the three before them (your Node, and how Claude Code and Claude Desktop
      start devcoach) are cut here. <em>Database &amp; pacing</em> shows your settings, how many replies
      have been counted and the rate limit. <em>Verdict</em> says whether the next reply would get a
      cue, and why. The verdict does not look at courses yet: while a course is in progress, no cue
      comes, whatever it says.
    </>
  }
/>

For a live trace, set `DEVCOACH_HOOK_DEBUG=1` in the environment your agent starts from: each hook run
adds one line to `~/.devcoach/hook.log` with its decision, such as `paced (3/10)` or `rate limited: …`.

#### Examples

```bash
# Fewer: one lesson in any 24 hours,
# and a cue only after 20 replies
devcoach set max_per_day 1
devcoach set nudge_every 20

# More: a cue every 5 replies,
# up to 5 lessons in 24 hours, an hour apart
devcoach set nudge_every 5
devcoach set max_per_day 5
devcoach set min_gap_minutes 60

# The most the ranges allow: a cue on
# every reply, 20 lessons in 24 hours, no gap
devcoach set nudge_every 0
devcoach set max_per_day 20
devcoach set min_gap_minutes 0

# Back to the defaults
devcoach set max_per_day 2
devcoach set min_gap_minutes 240
devcoach set nudge_every 10
```

### Environment variables {/* #environment-variables */}

Every variable devcoach reads, and who it is for. Five more, used only by tests and by the plugin's and
the extension's launcher, are folded under the table.

<RefTable>

| Variable | What it does | For |
|---|---|---|
| `DEVCOACH_HOOK_DEBUG=1` | Each hook run adds one line with its decision to `hook.log` in the data folder. The file is emptied once it passes 256 KB. | *you* |
| `NO_COLOR` | No colours in CLI output, and no clickable links unless `FORCE_HYPERLINK` is set. | *you* |
| `FORCE_COLOR` | Colours even when the output goes to a pipe or a file. `0` or `false` turn colours off. `NO_COLOR` wins over it. | *you* |
| `FORCE_HYPERLINK=1` | Clickable links on a terminal devcoach does not recognise, even with `NO_COLOR` or a pipe. | *you* |
| `COLUMNS` | When the output is not a terminal: the width of the `── title ──` lines in `devcoach lesson`, `course` and `setup` (otherwise 80, at most 100). Tables always fit their content. | *you* |
| `DEVCOACH_DIR` | Moves the data folder (database, notebook, courses, `hook.log`) away from `~/.devcoach`. `DEVCOACH_DIR=$(mktemp -d) devcoach stats` leaves your real data untouched. | tests, sandboxes |
| `CLAUDE_CONFIG_DIR` | Claude Code's own variable. When it is set, the onboarding scan reads Claude Code's history inside this folder (`~/.claude` and `~/.claude.json` by default). `devcoach install` writes its hooks and skill to `~/.claude` either way. | Claude Code |
| `HOME` | Where `~` is: the data folder and every agent config devcoach reads or writes (`USERPROFILE` on Windows). `HOME=$(mktemp -d) devcoach …` is a full sandbox. | your system |
| `XDG_CONFIG_HOME` | On Linux, where `install`, `uninstall` and `doctor` look for Claude Desktop's config, and `doctor` for its log. `APPDATA` does the same on Windows. | your system |
| `PATH` | How `install` finds the `devcoach` and `node` commands it writes into your agents' config, and how `doctor` checks them (with `PATHEXT` on Windows). | your system |
| `TERM`, `TERM_PROGRAM` | With a few similar variables: whether to use colours (`TERM=dumb` turns them off) and clickable links. | your terminal |

</RefTable>

<details>
<summary>For tests and launchers: five more variables</summary>

<RefTable>

| Variable | What it does | For |
|---|---|---|
| `DEVCOACH_CLAUDE_DIR` | Where the onboarding scan reads Claude Code's history: `~/.claude` and `~/.claude.json` by default, both inside this folder when it is set. Wins over `CLAUDE_CONFIG_DIR`. | tests |
| `DEVCOACH_RUNTIME_DIR` | For the Claude Code plugin and the Gemini CLI extension: where their launcher installs its copy of devcoach. | tests |
| `DEVCOACH_RUNTIME_SPEC` | For the same launcher: which package it installs (by default the version they pin). | tests |
| `CLAUDE_PLUGIN_DATA` | Set by Claude Code for the plugin: its launcher installs devcoach in this folder. | Claude Code |
| `DEVCOACH_LAUNCHER` | Set by the plugin's or the extension's launcher; `doctor` prints it as the runtime in use. | the launcher |

</RefTable>

</details>

## Your data {/* #your-data */}

Everything devcoach keeps on your computer has its own page: [Your data](data.md).

{/* The ids are this page's old section addresses, so a link that still ends in one of them lands on
    the line that leads to the section's new place. `movedSection` leaves room above that line for
    this heading. */}

- <Link id="data-location" to="/reference/data#data-location" style={movedSection}>Where it lives</Link>
- <Link id="backup-strategy" to="/reference/data#backup-strategy" style={movedSection}>Back up and restore</Link>
- <Link id="reset" to="/reference/data#reset" style={movedSection}>Reset</Link>
- <Link id="two-versions" to="/reference/data#two-versions" style={movedSection}>Two devcoach versions, one database</Link>
- <Link id="database-schema-reference" to="/reference/data#database-schema-reference" style={movedSection}>The database</Link>
