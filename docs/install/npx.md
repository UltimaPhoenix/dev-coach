---
title: npx / npm
sidebar_label: npx / npm
description: Run devcoach with npx, or install it globally with npm, then connect Claude Code and Claude Desktop with one command. Needs Node.js 24 or newer.
keywords: [devcoach npx, npm install -g devcoach, devcoach node 24, claude code mcp server, claude desktop mcp server, claude mcp add, nvm]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

export const npxDoctor = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: npx, temporary location (~/.npm/_npx/edf3918481d23863/node_modules/devcoach)\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[32m✓\u001b[39m Stop hook wired (1 entry)\n  \u001b[32m✓\u001b[39m UserPromptSubmit priming hook wired\n  \u001b[33m→\u001b[39m hook runs via npx — needs the npx cache (or network) on every stop\n  \u001b[33m→\u001b[39m hook runs via npx — needs the npx cache (or network) on every stop\n  \u001b[32m✓\u001b[39m Claude Code skill installed (current version)\n  \u001b[32m✓\u001b[39m MCP server registered (user scope)\n  \u001b[33m→\u001b[39m starts via `npx -y devcoach` — needs the npx cache (or the network) at every start\n\u001b[1m\nClaude Desktop\u001b[22m\n  \u001b[32m✓\u001b[39m registered: npx -y devcoach mcp\n  \u001b[33m→\u001b[39m starts via `npx -y devcoach` — needs the npx cache (or the network) at every start\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";
export const globalDoctor = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: npm-global, bound to Node v24.22.3 (nvm) (~/.nvm/versions/node/v24.22.3/lib/node_modules/devcoach)\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[32m✓\u001b[39m Stop hook wired (1 entry)\n  \u001b[32m✓\u001b[39m UserPromptSubmit priming hook wired\n  \u001b[32m✓\u001b[39m Claude Code skill installed (current version)\n  \u001b[32m✓\u001b[39m MCP server registered (user scope)\n  \u001b[32m✓\u001b[39m command resolves to ~/.nvm/versions/node/v24.22.3/bin/devcoach\n  \u001b[33m→\u001b[39m bound to Node v24.22.3 (nvm) — removing or switching that version breaks it with `Failed to spawn process: No such file or directory`; run `devcoach install --force` after\n  \u001b[32m✓\u001b[39m runs on Node 24.22.3 (~/.nvm/versions/node/v24.22.3/bin/node)\n  \u001b[32m✓\u001b[39m it runs devcoach 2.7.1\n\u001b[1m\nClaude Desktop\u001b[22m\n  \u001b[32m✓\u001b[39m registered: ~/.nvm/versions/node/v24.22.3/bin/devcoach mcp\n  \u001b[32m✓\u001b[39m command resolves to ~/.nvm/versions/node/v24.22.3/bin/devcoach\n  \u001b[33m→\u001b[39m bound to Node v24.22.3 (nvm) — removing or switching that version breaks it with `Failed to spawn process: No such file or directory`; run `devcoach install --force` after\n  \u001b[32m✓\u001b[39m runs on Node 24.22.3 (~/.nvm/versions/node/v24.22.3/bin/node)\n  \u001b[32m✓\u001b[39m it runs devcoach 2.7.1\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";

# npx / npm

## What you get here

npx runs devcoach without installing it, and npm can install it with the `devcoach` command.
`devcoach install` then connects it to Claude Code and Claude Desktop:

<Cards columns={3}>
  <Card label="Automatic lessons" title="Claude Code">
    Two hooks bring a lesson when one is due after a task, with the devcoach skill and all 25 tools.
  </Card>
  <Card label="Lessons on request" title="Claude Desktop">
    All 25 tools. Say *set up devcoach* once, then ask for a lesson when you want one.
  </Card>
  <Card label="Installed globally" title="The devcoach command">
    The command line, and `devcoach ui` for the web dashboard. Through npx, type `npx -y devcoach …`.
  </Card>
</Cards>

`devcoach install --gemini` or `--codex` adds [Gemini CLI](./gemini-cli.md) or [Codex CLI](./codex.md)
*(beta)*. Another agent? See [what each agent gets](./index.md), and
[Other MCP agents](./other-agents.md) for Cursor, Windsurf and the rest.

## You need

- **Node.js 24 or newer** with npm (`node --version`). devcoach uses Node's built-in SQLite; Node 20
  and 22 cannot run it.
- **macOS, Linux or Windows.** On Windows, prefer a global install or the
  [Windows installer](./windows.md): through npx, Claude Code's hooks need Git Bash.
- **Claude Code, Claude Desktop, or both** on this computer.

## Install

```bash
npx -y devcoach install
```

Or install devcoach globally first, for the `devcoach` command and starts that skip npm:

```bash
npm install -g devcoach
devcoach install
```

Then restart Claude Desktop and start a new Claude Code session: both load devcoach when they start.

Using Claude Code? The [plugin](./claude-code-plugin.md) can do the coaching while a global install
only adds the `devcoach` command: then skip `devcoach install` ([why](./claude-code-plugin.md#install)).
Claude Desktop is then not connected either: `devcoach install --claude-desktop` afterwards.

<details id="through-npx-or-installed-globally">
<summary>Through npx or installed globally?</summary>

| | Through npx | Installed globally |
|---|---|---|
| Agents run | `npx -y devcoach mcp` | devcoach's full path (see [below](#check-it-worked)) |
| Each start | asks the npm registry first | runs devcoach directly |
| Offline | slow: over a minute of npm retries in our test | works |
| Command | no `devcoach`: type `npx -y devcoach …` | `devcoach` |
| Update | refresh the skill ([how](#update)) | `npm install -g devcoach`, then `devcoach install` |

The full path means an agent with a shorter PATH than your shell (Claude Desktop) still finds devcoach.
On Windows a global install registers `node.exe` and devcoach's script instead.

</details>

## What it set up

`devcoach install` writes these files:

<FileTree
  root="~/"
  items={[
    { name: ".claude.json", note: <>Claude Code's server entry <code>devcoach</code>, for all your projects</> },
    { name: ".claude/", children: [
      { name: "settings.json", note: <>the two hooks: <code>npx -y devcoach stop-hook</code> and <code>prompt-hook</code></> },
      { name: "skills/devcoach/", note: <>the devcoach skill: <code>SKILL.md</code>, five <code>references/</code>, a version stamp</> },
    ] },
    { name: "Library/Application Support/Claude/", children: [
      { name: "claude_desktop_config.json", note: <>Claude Desktop's server entry (Linux: <code>~/.config/Claude/</code>; Windows: <code>%APPDATA%\Claude\</code>)</> },
    ] },
    { name: ".npm/_npx/", note: "npx's own copy of devcoach: temporary, npm manages it" },
    { name: ".devcoach/", note: "your lessons, profile, notebook and courses, created when devcoach first runs" },
  ]}
  caption="What npx -y devcoach install writes. devcoach uninstall removes all of it except ~/.devcoach/ (and npx's copy)."
/>

## Check it worked

Run `devcoach doctor` (through npx: `npx -y devcoach doctor`). It checks each part of the wiring:

<Tabs groupId="npx-or-global">
<TabItem value="npx" label="Through npx" default>

<Terminal
  command="npx -y devcoach doctor"
  output={npxDoctor}
  caption="Right after npx -y devcoach install, captured on Linux in a test home (home shown as ~), Node 24 from nvm. Every line is a check; a ✗ line says what to run."
/>

</TabItem>
<TabItem value="global" label="Installed globally">

<Terminal
  command="devcoach doctor"
  output={globalDoctor}
  caption="Right after npm install -g devcoach and devcoach install, Node 24 from nvm, same kind of test home. Every line is a check; a ✗ line says what to run."
/>

</TabItem>
</Tabs>

What to look for: a ✓ on the two hooks, the skill and the server. Through npx, the yellow **runs via
npx** lines are the trade-off [above](#through-npx-or-installed-globally), not errors. Installed
globally, **bound to Node** appears only with a Node version manager ([below](#node-version-managers)).
**no database yet** is normal before your first lesson.

## First run

After your first task devcoach offers to set up your profile and asks how: **Automatic**
(recommended), **Automatic (Deep)**, **Guided** or **Import backup**. In Claude Desktop, say *set up
devcoach* once, then ask for a lesson when you want one (*teach me something from what we just did*).

From then on, when your agent finishes a task and a lesson is due, devcoach teaches one short lesson
on something that task touched. The pace is yours to set:
[Coaching in your agent](../usage/coaching.md).

## Update

<Tabs groupId="npx-or-global">
<TabItem value="npx" label="Through npx" default>

npx fetches each new release by itself. Refresh the devcoach skill after a release (skip this with the
plugin):

```bash
npx -y devcoach install
```

</TabItem>
<TabItem value="global" label="Installed globally">

```bash
npm install -g devcoach
# refresh the devcoach skill (skip this with the plugin)
devcoach install
```

</TabItem>
</Tabs>

The devcoach skill is a copy: `install` refreshes it in place (no `--force` needed), and the hooks too
if a release changes them. `devcoach stats` and `devcoach doctor` say when the copy is out of date.

**From npx to a global install**, run `npm install -g devcoach`, then `devcoach install --force`: without
that flag your agents keep starting `npx -y devcoach mcp`, and only the hooks move.

<details>
<summary>Want the unreleased version?</summary>

Every change merged into the `develop` branch is published to npm under the `next` tag, documented at
[ultimaphoenix.github.io/dev-coach/next](https://ultimaphoenix.github.io/dev-coach/next/). `latest`
stays the last release. `npx -y devcoach@next` runs it from a terminal. For your agents, install it
globally:

```bash
npm install -g devcoach@next
devcoach install --force
```

`npx -y devcoach@next install` is not enough: it registers `npx -y devcoach mcp`, which starts the
release.

</details>

## Remove

<Tabs groupId="npx-or-global">
<TabItem value="npx" label="Through npx" default>

```bash
# remove the server, hooks and skill from Claude Code and Claude Desktop
npx -y devcoach uninstall
```

</TabItem>
<TabItem value="global" label="Installed globally">

```bash
# remove the server, hooks and skill from Claude Code and Claude Desktop
devcoach uninstall
npm uninstall -g devcoach
```

</TabItem>
</Tabs>

Then restart Claude Desktop to drop the server. Your lessons, profile, notebook and courses stay in `~/.devcoach/`. Two options of `devcoach uninstall`:

- `--data` deletes them too, after asking. Back up first with `devcoach backup` if you might come back.
- `--all` also removes devcoach from Gemini CLI and Codex CLI.

## If it doesn't work

**`devcoach 2.7.1 needs Node 24 or newer`.** The `node` on your PATH is older. Make Node 24 or newer
the default, then restart your agent. The hooks stay silent on an older Node, so if lessons never
come, check `node --version` in a new terminal.

**Lessons stop when you are offline.** Through npx each hook waits out npm's network retries. Install
devcoach globally.

**`devcoach: command not found` after you changed Node versions.** See
[Node version managers](#node-version-managers).

**`devcoach doctor` shows a ✗.** Run the command it names. Anything else:
[Troubleshooting](../troubleshooting.md).

## Node version managers {/* #node-version-managers */}

With nvm, nvm-windows, fnm, asdf or mise, each Node version keeps its own global packages: `npm install -g`
puts devcoach inside the current version's directory (`~/.nvm/versions/node/v24.22.3/…` with nvm).

- **Another Node version** has no devcoach: `devcoach: command not found`.
- **Your agents** start the path `devcoach install` wrote, so they keep working while that version
  exists. `install` and `doctor` name it: **bound to Node**.
- **Remove that version** and they cannot start devcoach: `doctor` reports `… is not found`, and the
  hooks fail with `/bin/sh: 1: …/bin/devcoach: not found`.

To move to another version for good, run under that version:

```bash
npm install -g devcoach
# point your agents at the new copy
devcoach install --force
```

Through npx none of this applies: npx runs devcoach on whichever Node is current.

## Wire it by hand

To keep your config files under your own control, write the entries `devcoach install` writes
through npx yourself.

<details>
<summary>What to write, and where</summary>

**The server**, for all your projects (user scope, like the hooks below; without `--scope user`
Claude Code registers it for the current project only):

```bash
claude mcp add --scope user devcoach npx -- -y devcoach mcp
```

Or add it to `~/.claude.json` yourself:

```json
{
  "mcpServers": {
    "devcoach": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

**The hooks**, in `~/.claude/settings.json` (skip them with the [plugin](./claude-code-plugin.md): it
already provides them). `stop-hook` decides after each turn whether a lesson is due; `prompt-hook`
primes the model up front when one is:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y devcoach stop-hook",
            "timeout": 60
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y devcoach prompt-hook",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**No skill.** The manual route has no devcoach skill, so the Stop hook falls back to its short
built-in instruction. `devcoach install` is what writes `~/.claude/skills/devcoach/`.

With a global install, use devcoach's full path in place of `npx -y devcoach` (no npx cache or network
needed at hook time). `devcoach install` picks the best command automatically, and repairs older
two-entry layouts. Run `devcoach doctor` to check the wiring.

</details>

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding and your first lesson.
  </Card>
</Cards>
