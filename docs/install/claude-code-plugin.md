---
title: Claude Code plugin
sidebar_label: Claude Code plugin
description: Install devcoach in Claude Code with two commands. The plugin brings the MCP server, two coaching hooks, the devcoach skill and five slash commands.
keywords: [devcoach claude code plugin, claude code marketplace, claude code mcp server, claude code hooks, claude code skills]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

export const doctorPlugin = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: claude-plugin (~/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.1/node_modules/devcoach)\n  \u001b[32m✓\u001b[39m Runtime: devcoach plugin · devcoach 2.7.1 · ~/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.1\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[32m✓\u001b[39m hooks provided by the devcoach plugin\n  \u001b[32m✓\u001b[39m Claude Code skill bundled with the plugin\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task\n";
export const oldNode = "devcoach plugin: the devcoach runtime is not available.\n  reason:   Node 22.22.0 is too old: devcoach needs Node 24 or newer (it uses the built-in node:sqlite). Upgrade Node (e.g. `brew upgrade node`), then restart.\n  node:     22.22.0 (needs ≥ 24) — ~/.nvm/versions/node/v22.22.0/bin/node\n  npm:      10.9.4\n  pinned:   devcoach 2.7.1\n  runtime:  ~/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.1 (not installed)\n  log:      ~/.claude/plugins/data/devcoach-ultimaphoenix/install.log\n";
export const noNpm = "devcoach plugin: the devcoach runtime is not available.\n  reason:   `npm` was not found on the PATH this session uses. Install Node with npm (e.g. `brew install node`), then restart.\n  node:     24.22.3 (needs ≥ 24) — ~/.nvm/versions/node/v24.22.3/bin/node\n  npm:      not found on PATH\n  pinned:   devcoach 2.7.1\n  runtime:  ~/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.1 (not installed)\n  log:      ~/.claude/plugins/data/devcoach-ultimaphoenix/install.log\n  last lines of the log:\n    [2026-11-22T01:39:59.174Z] npm install devcoach@2.7.1\n";
export const offline = "devcoach plugin: the devcoach runtime is not available.\n  reason:   could not install devcoach 2.7.1 from npm (network needed on first use). Log: ~/.claude/plugins/data/devcoach-ultimaphoenix/install.log\n  node:     24.22.3 (needs ≥ 24) — ~/.nvm/versions/node/v24.22.3/bin/node\n  npm:      10.9.4\n  pinned:   devcoach 2.7.1\n  runtime:  ~/.claude/plugins/data/devcoach-ultimaphoenix/runtime/2.7.1 (not installed)\n  log:      ~/.claude/plugins/data/devcoach-ultimaphoenix/install.log\n  last lines of the log:\n    [2026-11-22T01:39:59.254Z] npm install devcoach@2.7.1\n    npm error code EAI_AGAIN\n    npm error syscall getaddrinfo\n    npm error errno EAI_AGAIN\n    npm error request to https://registry.npmjs.org/devcoach failed, reason: getaddrinfo EAI_AGAIN registry.npmjs.org\n    npm error A complete log of this run can be found in: ~/.npm/_logs/2026-11-22T01_39_59_321Z-debug-0.log\n";

# Claude Code plugin

## What you get here

<Cards columns={4}>
  <Card title="MCP server" to="/reference/mcp-server">

Tools the agent calls to save lessons and read your profile.

  </Card>
  <Card title="Two hooks" to="/how-it-works">

Around each turn they check whether a lesson is due.

  </Card>
  <Card title="The skill" to="/usage/coaching">

The devcoach skill: how to teach you. The hook's cue loads it.

  </Card>
  <Card title="Five commands" to="#the-cli-next-to-the-plugin">

`/devcoach:setup`, `:ui`, `:share`, `:import`, `:course`.

  </Card>
</Cards>

The plugin adds no `devcoach` terminal command ([see below](#the-cli-next-to-the-plugin)). Other
agents: [what each agent gets](./index.md#what-each-agent-gets).

## You need

- **Node.js 24 or newer** with npm, on the PATH Claude Code uses (`node --version`).
- **The network on the first start** and once after each update, to download devcoach from npm.
- **Claude Code on this computer.** Cloud sessions (claude.ai/code) do not load your plugins.

## Install

```text title="Type in Claude Code"
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

The second command opens Claude Code's plugin panel on devcoach. **Choose "Install for you (user
scope)"**: the plugin then works in every project, in the terminal, the desktop app and VS Code.
devcoach's own checks look for it only in your user settings (`~/.claude/settings.json`). At project
or local scope, `devcoach doctor` reports no hooks and tells you to run `devcoach install`, which
would wire the hooks a second time.

No restart is needed. If Claude Code leaves devcoach pending, run `/reload-plugins --force` or start
a new session.

:::warning[Don't also run `devcoach install`]

With the plugin enabled, `devcoach install` skips the hooks but registers a second devcoach server
and a second copy of the skill. Ran it already? This removes those two and leaves the plugin alone:

```bash
npx -y devcoach uninstall --claude-code
```

:::

<details id="beta-channel">
<summary>Want the beta channel?</summary>

Every green push to `develop` builds a canary (the `next` prerelease on GitHub, also
`npx -y devcoach@next`) and pins it in a separate beta marketplace:

```text title="Type in Claude Code"
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace-beta
/plugin install devcoach@ultimaphoenix-beta
```

The beta keeps the plugin's name, so its tools, commands and skill have the same names as the
release's. Update it as in [Update](#updating), from the `ultimaphoenix-beta` marketplace; the
[`next` prerelease](https://github.com/UltimaPhoenix/dev-coach/releases/tag/next) notes say which
commit it is. Canaries are unreleased and may break.

**Enable one channel at a time.** Both carry the same server, hooks and commands: turn
`devcoach@ultimaphoenix` off while the beta is on (`/plugin`, or `enabledPlugins` in your settings).
`devcoach doctor` warns when both are enabled.

**A canary may upgrade the shared database.** An older devcoach (the release plugin, a Homebrew or npm
CLI behind the canary) then opens it read-only: `stats`, `lessons` and the dashboard keep working,
writes are refused with a message naming both versions, and `devcoach doctor` says so. Keep the CLI
you write with on the same channel as the plugin.

</details>

<details>
<summary>Installing from a downloaded zip?</summary>

Download `devcoach-plugin-<version>.zip` from the
[GitHub Releases](https://github.com/UltimaPhoenix/dev-coach/releases), unzip it, then point Claude
Code at the folder (the zip carries its own marketplace, named `devcoach`):

```text title="Type in Claude Code"
/plugin marketplace add /path/to/unzipped-folder
/plugin install devcoach@devcoach
```

The zip stands in for the marketplace only. It holds the plugin's files and launcher, so on its first
start the plugin still downloads devcoach from npm once: there is no offline install for the plugin.
Claude Code runs the plugin from that folder, so keep it. To update, unzip the next release into the
same folder and run `/reload-plugins`. Its data folder is `~/.claude/plugins/data/devcoach-devcoach`.

</details>

## What it set up

Claude Code keeps the plugin in two folders of its own. Your lessons live apart from both:

<FileTree
  root="~/"
  items={[
    { name: ".claude/plugins/", children: [
      { name: "cache/ultimaphoenix/devcoach/", children: [
        { name: "2.7.1/", note: "the plugin, one folder per version", children: [
          { name: ".mcp.json", note: "starts the MCP server through the launcher" },
          { name: "hooks/hooks.json", note: "the Stop and UserPromptSubmit hooks, same launcher" },
          { name: "commands/", note: "the five slash commands" },
          { name: "skills/devcoach/", note: "the devcoach skill and its references" },
          { name: "scripts/launch.mjs", note: "the launcher: installs devcoach once, then runs it" },
          { name: "package.json", note: "pins the devcoach version it installs" },
        ] },
      ] },
      { name: "data/devcoach-ultimaphoenix/", note: "the plugin's data folder, kept across updates", children: [
        { name: "runtime/2.7.1/", note: "devcoach itself, downloaded from npm on the first start" },
        { name: "install.log", note: "npm's output from that download" },
      ] },
    ] },
    { name: ".devcoach/", note: "your lessons: coaching.db, the notebook, courses/. Kept when you update, clean up or remove the plugin" },
  ]}
  caption="Where the plugin and your data live. Deleting the data folder only removes the downloaded copy of devcoach."
/>

The plugin is configuration plus a small launcher. Every hook run and server start goes through the
launcher, which runs the pinned devcoach with `node`, with no `npx` start each time. How the hooks
decide: [How it works](../how-it-works.md). Your data: [Privacy & security](../reference/privacy.md).

## Check it worked

Type **`/devcoach:setup`** in Claude Code. It checks that devcoach can run on this machine and that
its server is connected, then sets up your profile ([First run](#first-run)). Run it again any time:
it tells you what is already in place.

From a terminal (macOS or Linux), you can ask the plugin's launcher directly:

```bash
plugin=$(ls -d ~/.claude/plugins/cache/ultimaphoenix/devcoach/*/ | sort -V | tail -1)
CLAUDE_PLUGIN_DATA=~/.claude/plugins/data/devcoach-ultimaphoenix \
  node "${plugin}scripts/launch.mjs" doctor
```

<Terminal
  command="node …/scripts/launch.mjs doctor"
  output={doctorPlugin}
  caption="Right after install, home shown as ~. Runtime names the plugin's own copy of devcoach; the hooks and the skill come from the plugin."
/>

The first line picks the newest version (Claude Code keeps the previous one for a while after an
update). `CLAUDE_PLUGIN_DATA` names the plugin's data folder: without it, a launcher started from a
terminal installs a second copy of devcoach inside the plugin folder. Beta channel: use
`ultimaphoenix-beta` in place of `ultimaphoenix` in both paths. Zip install: run the
`scripts/launch.mjs` in your unzipped `plugin/` folder, with `devcoach-devcoach` as the data folder.

## First run

After your first task devcoach offers to set up your profile and asks how: **Automatic**
(recommended), **Automatic (Deep)**, **Guided** or **Import backup**. `/devcoach:setup` starts the same
setup right away, and `/devcoach:setup redo` rebuilds the profile from scratch.

From then on, when your agent finishes a task and a lesson is due, devcoach teaches one short lesson
on something that task touched. The pace is yours to set:
[Coaching in your agent](../usage/coaching.md).

## Update {/* #updating */}

Claude Code updates a plugin on its own only when its marketplace has auto-update on, and that is
**off by default** for third-party marketplaces like `ultimaphoenix` (pinned to each devcoach
release). Two ways to stay current:

- **Turn auto-update on, once:** `/plugin` → **Marketplaces** → `ultimaphoenix` → turn auto-update
  on. Claude Code then updates devcoach in the background after a session starts. When it says
  `Plugin updated: … · Run /reload-plugins to apply`, run `/reload-plugins` or wait for your next
  launch.
- **Update now:** `/plugin` → **Installed** → devcoach → **Update now**, then `/reload-plugins`.
  From a shell:

```bash
claude plugin update devcoach@ultimaphoenix
```

After an update, the plugin's next start downloads the new devcoach version from npm once.
Refreshing the marketplace listing alone does not update the plugin: from a shell,
`claude plugin marketplace update` with no name leaves installed plugins at their current versions.

<details>
<summary>Installed it from <code>UltimaPhoenix/dev-coach</code> earlier?</summary>

Older docs showed `/plugin marketplace add UltimaPhoenix/dev-coach`. That path still works, but it
tracks the repository's `main` branch instead of a pinned release and only ever contains devcoach.
Move over once:

```text title="Type in Claude Code"
/plugin uninstall devcoach@devcoach
/plugin marketplace remove devcoach
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

</details>

## Remove

```text title="Type in Claude Code"
/plugin uninstall devcoach@ultimaphoenix
```

(From a shell: `claude plugin uninstall devcoach@ultimaphoenix`.) Claude Code removes the server,
hooks, commands and skill, and, once devcoach is installed nowhere else, deletes the plugin's data
folder (the shell command's `--keep-data` keeps it). The cache folder goes in a clean-up 14 days later.

Your lessons, profile, notebook and courses stay in `~/.devcoach/`. To delete them too (back up first
with `npx -y devcoach backup` if you might come back), run this; it asks before deleting:

```bash
npx -y devcoach uninstall --claude-code --data
```

## If it doesn't work {/* #troubleshooting */}

### `plugin:devcoach:devcoach` failed to connect to MCP server

Claude Code could not start devcoach's server. The same causes make the hooks show a notice,
*devcoach is not running*, at most once a day and without interrupting your work. Run
**`/devcoach:setup`**: its first step prints the reason.

| The reason | Fix |
|---|---|
| `Node 22.x is too old` | Install Node 24 or newer, then restart Claude Code. With a version manager, make 24 the **default**: Claude Code uses the `node` on its own PATH, not your shell's current pick |
| `` `npm` was not found `` | Install Node with npm (`brew install node`), then restart |
| `could not install devcoach … from npm`, or `… took longer than 180 s` | The first start needs the network; `install.log` shows why (a proxy, no connection). Restart once online |
| `devcoach … could not start` | An incomplete copy is removed and reinstalled on the next start. If the reason comes back, start over (below) |

<details>
<summary>What does the launcher's whole diagnosis look like?</summary>

The [terminal check](#check-it-worked) prints it, for example:

<Tabs>
<TabItem value="node" label="Node too old" default>

<Terminal command="node …/scripts/launch.mjs doctor" output={oldNode} />

</TabItem>
<TabItem value="npm" label="npm missing">

<Terminal command="node …/scripts/launch.mjs doctor" output={noNpm} />

</TabItem>
<TabItem value="network" label="No network">

<Terminal command="node …/scripts/launch.mjs doctor" output={offline} />

</TabItem>
</Tabs>

</details>

After a fix, reconnect without restarting: `/mcp` → `plugin:devcoach:devcoach` → *Reconnect*. For
the full story of one failed start, run `claude --debug` and read `~/.claude/debug/<session-id>.txt`:
the server's own error line is in there.

Still stuck? Start over from a clean copy; `~/.devcoach/` is not touched
([What it set up](#what-it-set-up)):

```bash
# delete the plugin's downloaded copy of devcoach; the next start downloads it again
rm -rf ~/.claude/plugins/data/devcoach-ultimaphoenix
```

(Beta channel: `devcoach-ultimaphoenix-beta`; zip install: `devcoach-devcoach`.) Then `/mcp` →
*Reconnect*.

### Coaching never starts

Run `/devcoach:setup` first. When all is in place, the pace is quiet on purpose: by default a lesson
is cued after about ten interactions in a chat session, at most two a day and at least four hours
apart (each a [setting](../reference/configuration.md)), and cues pause while a course is in
progress. The [terminal check](#check-it-worked) ends with a verdict on the next stop. Anything else:
[Troubleshooting](../troubleshooting.md).

## The CLI next to the plugin

The [command line (CLI)](../usage/cli.md) gives you the dashboard, stats, lessons, sharing, backups
and `doctor` without a Claude session. The plugin does not add it to your PATH. Three ways to reach it:

<Tabs>
<TabItem value="claude-code" label="In Claude Code" default>

**Nothing to install.** Type `/devcoach:ui` (a port is optional, as in `/devcoach:ui 8080`;
`/devcoach:ui stop` stops it), or ask *"open the devcoach dashboard"*. Claude reports the URL
(default http://localhost:7860). The other commands:

- `/devcoach:share [last | <id> | about <topic>] [as link|file]` and `/devcoach:import <code or link>`
  for [sharing lessons](../usage/sharing.md),
- `/devcoach:course [last | a few words of the lesson's title | a concept] [continue]` for a
  [step-by-step course](../usage/courses.md).

Claude runs them with the plugin's own copy of devcoach.

</TabItem>
<TabItem value="npx" label="npx, no install">

**From a terminal, without installing:** prefix any [CLI command](../usage/cli.md) with `npx -y`.

```bash
npx -y devcoach ui
npx -y devcoach stats
```

</TabItem>
<TabItem value="global" label="Bare command">

**A bare `devcoach` command:** install the npm package globally (`npm install -g devcoach`) or with
[Homebrew](./homebrew.md), and skip its `devcoach install` step ([why](#install)). Claude Desktop is
then not connected either: `devcoach install --claude-desktop` afterwards. Running both is fine:

- both read the same `~/.devcoach/`,
- the plugin brings the hooks and the skill, current with each release once auto-update is on
  ([Update](#updating)); a Homebrew-only install needs `devcoach install` again after each
  `brew upgrade` for that,
- and Homebrew gives you the CLI.

</TabItem>
</Tabs>

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding and your first lesson.
  </Card>
</Cards>
