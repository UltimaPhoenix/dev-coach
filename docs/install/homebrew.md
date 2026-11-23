---
title: Homebrew
sidebar_label: Homebrew
description: Install devcoach with Homebrew on macOS or Linux. Homebrew brings Node.js and the devcoach command; devcoach install then connects Claude Code and Claude Desktop.
keywords: [devcoach homebrew, brew install devcoach, homebrew tap, devcoach macOS, devcoach linux, claude code mcp server, claude desktop mcp server]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";

export const brewInstall = "\u001b[1mSetting up devcoach\u001b[22m\u001b[2m  (~/.linuxbrew/bin/devcoach mcp)\u001b[22m\n\n\u001b[1mClaude Code\u001b[22m\n  MCP server…  \u001b[32m✓\u001b[39m Registered via `claude mcp add` (scope: user)\n  Hooks…       \u001b[32m✓\u001b[39m Hooks installed into ~/.claude/settings.json (Stop + UserPromptSubmit)\n  Skill…       \u001b[32m✓\u001b[39m Installed into ~/.claude/skills/devcoach\n\n\u001b[1mClaude Desktop\u001b[22m\n  MCP server…  \u001b[32m✓\u001b[39m Installed into ~/.config/Claude/claude_desktop_config.json\n\n\u001b[33m→\u001b[39m Restart Claude Desktop to pick up the new server.\n\n\u001b[2mTip: run devcoach backup to export your profile, lessons and settings.\n     run devcoach restore <file> to import a backup on a new machine.\n     After upgrading devcoach (npm, Homebrew), re-run devcoach install to refresh the skill.\u001b[22m";
export const brewDoctor = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via homebrew (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: homebrew (~/.linuxbrew/Cellar/devcoach/2.7.1/libexec/lib/node_modules/devcoach)\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[32m✓\u001b[39m Stop hook wired (1 entry)\n  \u001b[32m✓\u001b[39m UserPromptSubmit priming hook wired\n  \u001b[32m✓\u001b[39m Claude Code skill installed (current version)\n  \u001b[32m✓\u001b[39m MCP server registered (user scope)\n  \u001b[32m✓\u001b[39m command resolves to ~/.linuxbrew/bin/devcoach\n  \u001b[32m✓\u001b[39m runs on Node 24.22.3 (~/.linuxbrew/bin/node)\n  \u001b[32m✓\u001b[39m it runs devcoach 2.7.1\n\u001b[1m\nClaude Desktop\u001b[22m\n  \u001b[32m✓\u001b[39m registered: ~/.linuxbrew/bin/devcoach mcp\n  \u001b[32m✓\u001b[39m command resolves to ~/.linuxbrew/bin/devcoach\n  \u001b[32m✓\u001b[39m runs on Node 24.22.3 (~/.linuxbrew/bin/node)\n  \u001b[32m✓\u001b[39m it runs devcoach 2.7.1\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";

# Homebrew

## What you get here

Homebrew installs devcoach and the `devcoach` command. `devcoach install` then connects it to Claude
Code and Claude Desktop:

<Cards columns={3}>
  <Card label="Automatic lessons" title="Claude Code">
    Two hooks bring a lesson when one is due after a task, with the devcoach skill and all 25 tools.
  </Card>
  <Card label="Lessons on request" title="Claude Desktop">
    All 25 tools. Say *set up devcoach* once, then ask for a lesson when you want one.
  </Card>
  <Card label="In your terminal" title="The devcoach command">
    The command line, and `devcoach ui` for the web dashboard. No `npx` prefix.
  </Card>
</Cards>

`devcoach install --gemini` or `--codex` adds [Gemini CLI](./gemini-cli.md) or [Codex CLI](./codex.md)
*(beta)*. Another agent? See [what each agent gets](./index.md).

## You need

- **macOS or Linux with [Homebrew](https://brew.sh).**
- **Nothing else for Node.js.** devcoach needs Node.js 24 or newer, and the formula depends on
  Homebrew's `node`, so `brew install` installs it for you.
- **Claude Code, Claude Desktop, or both** on this computer.

## Install

```bash
# 1. Add the tap (github.com/UltimaPhoenix/homebrew-tap)
brew tap UltimaPhoenix/tap

# 2. Trust the devcoach formula: Homebrew 6 and later load nothing untrusted from a tap
brew trust --formula UltimaPhoenix/tap/devcoach

# 3. Install devcoach, and Homebrew's Node with it
brew install devcoach

# 4. Connect Claude Code and Claude Desktop
devcoach install
```

Then restart Claude Desktop and start a new Claude Code session: both load devcoach when they start.

Using Claude Code? The [plugin](./claude-code-plugin.md) can do the coaching while Homebrew only adds
the `devcoach` command: then skip step 4 ([why](#with-the-claude-code-plugin)). Claude Desktop is then
not connected either: `devcoach install --claude-desktop` afterwards.

`brew tap` and `brew trust` are one-time. Since Homebrew 6.0.0, a tap outside Homebrew's own needs
that trust by default. Homebrew advises trusting only the formula you install;
`brew trust --tap UltimaPhoenix/tap` would also let it load every future formula of that tap. In one
command instead, `brew install UltimaPhoenix/tap/devcoach` taps, trusts this formula only and
installs it; then run `devcoach install`.

## What it set up

`devcoach install` says what it wrote:

<Terminal
  command="devcoach install"
  output={brewInstall}
  caption="Captured on Linux in a test home (home shown as ~), with devcoach laid out as the formula installs it (Homebrew under ~/.linuxbrew). On a Mac the path is /opt/homebrew/bin/devcoach."
/>

Agents start it as `/opt/homebrew/bin/devcoach mcp` (`/usr/local/bin` on Intel Macs,
`/home/linuxbrew/.linuxbrew/bin` on Linux): an absolute path that `brew upgrade` keeps valid, and that
does not depend on the PATH an agent sees. The hooks call the same path. Here is every file it
touched:

<FileTree
  root="~/"
  items={[
    { name: ".claude.json", note: <>Claude Code's server entry <code>devcoach</code>, for all your projects</> },
    { name: ".claude/", children: [
      { name: "settings.json", note: <>the two hooks: <code>…/bin/devcoach stop-hook</code> and <code>prompt-hook</code></> },
      { name: "skills/devcoach/", note: <>the devcoach skill: <code>SKILL.md</code>, five <code>references/</code>, a version stamp</> },
    ] },
    { name: "Library/Application Support/Claude/", children: [
      { name: "claude_desktop_config.json", note: <>Claude Desktop's server entry (Linux: <code>~/.config/Claude/</code>)</> },
    ] },
    { name: ".devcoach/", note: "your lessons, profile, notebook and courses, created when devcoach first runs" },
  ]}
  caption="What devcoach install writes. devcoach uninstall removes all of it except ~/.devcoach/."
/>

## Check it worked

Run `devcoach doctor`. It checks each part of the wiring:

<Terminal
  command="devcoach doctor"
  output={brewDoctor}
  caption="Right after install, same test home. Your Node line shows the version Homebrew installed. Every line is a check; a ✗ line says what to run."
/>

What to look for: a ✓ on the two hooks, the skill and the server, and under each agent **command
resolves to** your Homebrew `bin/devcoach`. **no database yet** is normal before your first lesson.

## First run

After your first task devcoach offers to set up your profile and asks how: **Automatic**
(recommended), **Automatic (Deep)**, **Guided** or **Import backup**. In Claude Desktop, say *set up
devcoach* once, then ask for a lesson when you want one (*teach me something from what we just did*).

From then on, when your agent finishes a task and a lesson is due, devcoach teaches one short lesson
on something that task touched. The pace is yours to set:
[Coaching in your agent](../usage/coaching.md).

## Update

```bash
brew upgrade devcoach
# refresh the devcoach skill (skip this with the plugin)
devcoach install
```

The server entries and the hooks call `/opt/homebrew/bin/devcoach`, so their next start runs the new
version. The devcoach skill is a copy that Homebrew knows nothing about: `devcoach install` refreshes it
in place (no `--force` needed), and the hooks too if a release changes them. `devcoach stats` and
`devcoach doctor` say when the copy is out of date.

## Remove

Homebrew formulae have no uninstall hook, so `brew uninstall` cannot undo what `devcoach install`
wrote. Run devcoach's own uninstaller first, then remove the package (`brew info devcoach` prints the
same reminder):

```bash
# remove the server, hooks and skill from Claude Code and Claude Desktop
devcoach uninstall
brew uninstall devcoach
# optional: drop the tap too
brew untap UltimaPhoenix/tap
```

Then restart Claude Desktop to drop the server. Your lessons, profile, notebook and courses stay in `~/.devcoach/`. Two options of `devcoach uninstall`:

- `--data` deletes them too, after asking. Back up first with `devcoach backup` if you might come back.
- `--all` also removes devcoach from Gemini CLI and Codex CLI.

## If it doesn't work

**`brew install devcoach` fails on an untrusted tap.** Homebrew 6 and later load no formula from a tap
you have not trusted: run step 2, or install with the full name `UltimaPhoenix/tap/devcoach`.

<details>
<summary>A hook error on every turn, after <code>brew uninstall devcoach</code>?</summary>

The hooks still call the removed program: Claude Code shows `Failed with non-blocking status code:`
and your shell's message, such as `/bin/sh: 1: …/bin/devcoach: not found` on Linux. Put devcoach back
and remove it in the right order:

```bash
brew install UltimaPhoenix/tap/devcoach
devcoach uninstall
brew uninstall devcoach
```

(`brew uninstall` also removes Homebrew's `node` when nothing else needs it. With another Node.js 24
or newer, `npx -y devcoach uninstall` alone removes the leftover entries.)

</details>

**`devcoach doctor` shows a ✗.** Run the command it names. Anything else:
[Troubleshooting](../troubleshooting.md).

## With the Claude Code plugin

The [plugin](./claude-code-plugin.md) can bring the coaching to Claude Code while Homebrew brings only
the `devcoach` command. Both read the same `~/.devcoach/`. Skip step 4 then: next to the plugin,
`devcoach install` skips the hooks but registers a second devcoach server and a second copy of the
skill ([more](./claude-code-plugin.md#the-cli-next-to-the-plugin)). Claude Desktop is then not
connected either: `devcoach install --claude-desktop` afterwards.

`brew upgrade devcoach` updates the command. Claude Code leaves auto-update off for the plugin's
marketplace: turn it on in `/plugin` → **Marketplaces** → `ultimaphoenix`, or update the plugin
yourself.

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding and your first lesson.
  </Card>
</Cards>
