---
title: Gemini CLI
sidebar_label: Gemini CLI (beta)
description: Install devcoach in Gemini CLI (beta) with one command or the extension. Two hooks cue a lesson when one is due; the devcoach skill and the MCP server come with them.
keywords: [devcoach gemini cli, gemini cli mcp server, gemini cli extension, gemini cli hooks, gemini cli skills]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";
import cli from "@site/src/data/cli-output.json";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

export const doctorGemini = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: npm-global, bound to Node v24.22.3 (nvm) (~/.nvm/versions/node/v24.22.3/lib/node_modules/devcoach)\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[31m✗\u001b[39m no devcoach hooks in ~/.claude/settings.json — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m Claude Code skill not installed — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m MCP server not found in ~/.claude.json — it may be registered elsewhere (check with \u001b[1mclaude mcp get devcoach\u001b[22m)\n\u001b[1m\nGemini CLI wiring (beta)\u001b[22m\n  \u001b[32m✓\u001b[39m AfterAgent stop hook wired\n  \u001b[32m✓\u001b[39m BeforeAgent priming hook wired\n  \u001b[32m✓\u001b[39m skill installed (~/.agents/skills, current version)\n  \u001b[32m✓\u001b[39m MCP server registered (settings.json)\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";
export const doctorExtension = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: gemini-extension (~/.devcoach/gemini-ext/runtime/2.7.1/node_modules/devcoach)\n  \u001b[32m✓\u001b[39m Runtime: devcoach extension · devcoach 2.7.1 · ~/.devcoach/gemini-ext/runtime/2.7.1\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[31m✗\u001b[39m no devcoach hooks in ~/.claude/settings.json — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m Claude Code skill not installed — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m MCP server not found in ~/.claude.json — it may be registered elsewhere (check with \u001b[1mclaude mcp get devcoach\u001b[22m)\n\u001b[1m\nGemini CLI wiring (beta)\u001b[22m\n  \u001b[32m✓\u001b[39m hooks provided by the devcoach Gemini extension\n  \u001b[32m✓\u001b[39m skill bundled with the devcoach Gemini extension\n  \u001b[33m→\u001b[39m MCP server not found in settings.json — it may be registered elsewhere (check with \u001b[1mgemini mcp list\u001b[22m)\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";
export const uninstallGemini = "\u001b[1mRemoving devcoach from your agents\u001b[22m\n\n\u001b[1mGemini CLI (beta)\u001b[22m\n  MCP server…  \u001b[32m✓\u001b[39m Removed from ~/.gemini/settings.json\n  Hooks…       \u001b[32m✓\u001b[39m Hooks removed from ~/.gemini/settings.json (AfterAgent + BeforeAgent)\n\n\u001b[1mShared skill (Gemini + Codex)\u001b[22m\n  Skill…       \u001b[32m✓\u001b[39m Removed ~/.agents/skills/devcoach\n\n\u001b[2mYour lessons, profile and notebook are still in ~/.devcoach — keep them for a\nreinstall, or delete them with: devcoach uninstall --data  (devcoach backup first).\u001b[22m\n\u001b[2mThen remove the program itself: brew uninstall devcoach · npm uninstall -g devcoach · scoop uninstall devcoach · %LOCALAPPDATA%\\devcoach\\uninstall.ps1\n(npx: nothing to remove).\u001b[22m";
export const extensionNoNpm = "devcoach extension: the devcoach runtime is not available.\n  reason:   `npm` was not found on the PATH this session uses. Install Node with npm (e.g. `brew install node`), then restart.\n  node:     24.22.3 (needs ≥ 24) — ~/.nvm/versions/node/v24.22.3/bin/node\n  npm:      not found on PATH\n  pinned:   devcoach 2.7.1\n  runtime:  ~/.devcoach/gemini-ext/runtime/2.7.1 (not installed)\n  log:      ~/.devcoach/gemini-ext/install.log\n  last lines of the log:\n    [2026-11-22T02:28:15.572Z] npm install devcoach@2.7.1";

# Gemini CLI (beta)

## What you get here

<Cards columns={4}>
  <Card title="Automatic lessons" to="/how-it-works">

When Gemini finishes a task and a lesson is due, a hook cues one.

  </Card>
  <Card title="The devcoach skill" to="/usage/coaching">

How to teach you. Gemini loads it for each lesson.

  </Card>
  <Card title="MCP server" to="/reference/mcp-server">

Tools Gemini calls to save lessons and read your profile.

  </Card>
  <Card title="Web dashboard" to="/usage/web-ui">

Ask Gemini to *open the devcoach dashboard*, or run `devcoach ui`.

  </Card>
</Cards>

Every agent on this computer shares your profile and lessons in `~/.devcoach/`
([what each agent gets](./index.md#what-each-agent-gets)).

## You need

- **Node.js 24 or newer** on the PATH your agent uses (`node --version`). Homebrew, Scoop and the
  Windows installer install it for you.
- **devcoach installed** ([Homebrew](./homebrew.md), [npm](./npx.md), [Windows](./windows.md)), or npm
  and the network for npx or the extension.
- **A Gemini CLI with hooks and skills.** This page was checked with Gemini CLI 0.70.0, where hooks
  are on by default.
- **macOS or Linux.** This integration is in beta, and on Windows its hooks are untested.

## Install

```bash
devcoach install --gemini
```

Most readers should take this route, with devcoach installed: the hooks call it directly, nothing
downloads on a turn, and you get the `devcoach` command too. Without devcoach installed,
`npx -y devcoach install --gemini` works as well, but its hooks then start npx twice per turn, and npx
asks the npm registry at every start. Offline, each hook waits out npm's network retries (over a
minute in our test), longer than the agent lets a devcoach hook run (60 seconds at most), so no lesson
is cued.

### Or the Gemini extension

| | Install command | Extension |
|---|---|---|
| npm on the first run | Not with devcoach installed; npx needs it | Yes: the first start downloads devcoach |
| Offline afterwards | Yes with devcoach installed; through npx, no lesson is cued ([why](#install)) | Yes |
| Updates | Upgrade devcoach, run the install again | The next release's zip, then `gemini extensions update` |
| The `devcoach` command | Yes, with devcoach installed | No: `npx -y devcoach …` |
| Remove with | `devcoach uninstall --gemini` | `gemini extensions uninstall devcoach` |

Download `devcoach-gemini-extension-<version>.zip` from the
[latest release](https://github.com/UltimaPhoenix/dev-coach/releases/latest). Its files sit at the top
level, so unzip it into a folder of its own, then install from there:

```bash
unzip ~/Downloads/devcoach-gemini-extension-<version>.zip -d ~/devcoach-gemini
gemini extensions install ~/devcoach-gemini
```

Keep that folder: Gemini installs a copy and reads updates from it. Gemini asks you to trust that
folder and the one you run the command from, then lists what the extension brings (the devcoach MCP
server, a warning that it contains hooks, the devcoach skill) and asks you to continue.

:::warning[Pick one route]

Don't run `devcoach install --gemini` next to the extension. It skips the hooks and the skill, but
adds a second devcoach server to `~/.gemini/settings.json`, and Gemini then uses that one instead of
the extension's. To switch routes, [remove](#remove) the first one before you add the other.

:::

## What it set up

<Tabs groupId="gemini-route">
<TabItem value="command" label="Install command" default>

<Terminal
  command="devcoach install --gemini"
  output={cli.installGemini}
  caption="With devcoach from npm on Node from nvm, the install also says its commands are tied to that Node version."
/>

<FileTree
  root="~/"
  items={[
    { name: ".gemini/settings.json", note: <>the server (<code>mcpServers.devcoach</code>) and the hooks <code>AfterAgent</code> and <code>BeforeAgent</code></> },
    { name: ".agents/skills/devcoach/", note: "the devcoach skill, shared with Codex CLI", children: [
      { name: "SKILL.md", note: "how to teach you" },
      { name: "references/", note: "five more files: onboarding, calibration, review, sharing, courses" },
      { name: ".devcoach-version", note: "the version this copy came from" },
    ] },
    { name: ".devcoach/", note: "your lessons, profile, notebook and courses: created at onboarding, shared with every agent" },
  ]}
  caption={<>What the install writes. With <code>gemini</code> on your PATH it registers the server through <code>gemini mcp add</code>, which writes the same file.</>}
/>

</TabItem>
<TabItem value="extension" label="Extension">

<FileTree
  root="~/"
  items={[
    { name: "devcoach-gemini/", note: "the unzipped release: keep it for updates" },
    { name: ".gemini/extensions/devcoach/", note: "Gemini's copy of the extension", children: [
      { name: "gemini-extension.json", note: "starts the MCP server through the launcher" },
      { name: "hooks/hooks.json", note: "the AfterAgent and BeforeAgent hooks, same launcher" },
      { name: "skills/devcoach/", note: "the devcoach skill and its references" },
      { name: "scripts/launch.mjs", note: "the launcher: installs devcoach once, then runs it" },
      { name: "package.json", note: "pins the devcoach version it installs" },
    ] },
    { name: ".devcoach/", note: "your lessons too, once you onboard", children: [
      { name: "gemini-ext/runtime/<version>/", note: "devcoach itself, pinned, downloaded from npm on the first start" },
      { name: "gemini-ext/install.log", note: "npm's output from that download" },
    ] },
  ]}
  caption={<>After <code>gemini extensions install</code> and a first start.</>}
/>

</TabItem>
</Tabs>

How the hooks decide: [How it works](../how-it-works.md). Your data:
[Privacy & security](../reference/privacy.md).

## Check it worked

<Tabs groupId="gemini-route">
<TabItem value="command" label="Install command" default>

<Terminal
  command="devcoach doctor"
  output={doctorGemini}
  caption="Right after the install, on a computer with Gemini CLI and no Claude Code."
/>

Read the **Gemini CLI wiring** section: four ✓, for the two hooks, the skill and the server.
`devcoach doctor` always checks Claude Code first. If you don't use Claude Code, ignore its lines,
the red ✗ included. Through npx, each hook adds a `hook runs via npx` line: the cost described in
[Install](#install).

</TabItem>
<TabItem value="extension" label="Extension">

The extension adds no `devcoach` command; ask its launcher instead (macOS or Linux):

```bash
node ~/.gemini/extensions/devcoach/scripts/launch.mjs doctor
```

<Terminal
  command="node …/scripts/launch.mjs doctor"
  output={doctorExtension}
  caption={<>Runtime names the extension's own copy of devcoach. The server comes from the extension, so the line about <code>settings.json</code> is expected.</>}
/>

Read the **Gemini CLI wiring** section. `devcoach doctor` always checks Claude Code first. If you
don't use Claude Code, ignore its lines, the red ✗ included.

</TabItem>
</Tabs>

Gemini's own checks: `gemini mcp list` (or `/mcp list` in a session) shows devcoach as
**Connected**, `gemini skills list` (`/skills list`) shows the devcoach skill and its folder, and
`/hooks list` in a session shows the two hooks.

## First run

Start a new `gemini` session in a project folder you trust: Gemini loads servers, hooks and skills
when a session starts, and connects no MCP server in a folder it does not trust.

After your first task devcoach offers to set up your profile and asks how: **Automatic**
(recommended), **Automatic (Deep)**, **Guided** or **Import backup**.

:::note[Gemini asks you first]

- **The skill.** When the cue has Gemini load the devcoach skill, Gemini asks you to allow it, with
  the skill's name, purpose and folder. Allow it, or devcoach cannot follow its own rules. Gemini's
  docs say it asks each time a skill is triggered in a session.
- **The tools.** Gemini asks before it runs a tool from an MCP server you have not trusted,
  devcoach's included. You can allow the whole devcoach server instead of each tool.

:::

The pace is yours to set: by default about one cue every 10 interactions in a chat session, at most
2 lessons a day, at least 4 hours apart, and none while a course is in progress
([Coaching in your agent](../usage/coaching.md)). Gemini sends its hooks no plan-mode flag, so every
turn counts, planning included.

## Update

<Tabs groupId="gemini-route">
<TabItem value="command" label="Install command" default>

Upgrade devcoach the way you installed it, then run the install again:

```bash
brew upgrade devcoach        # or: npm install -g devcoach@latest
devcoach install --gemini
```

The hooks and the server already run the new version; the second command refreshes the devcoach
skill, and `devcoach doctor` says when it is out of date. Through npx, npx runs the newest devcoach
whenever it is online; run `npx -y devcoach install --gemini` again to refresh the skill.

</TabItem>
<TabItem value="extension" label="Extension">

Unzip the next release into the same folder, then update from it:

```bash
unzip -o ~/Downloads/devcoach-gemini-extension-<version>.zip -d ~/devcoach-gemini
gemini extensions update devcoach
```

Gemini compares the folder's version with the installed one, shows the same consent as at install,
and reports both versions. The next start downloads the new devcoach from npm once and removes the
old copy.

</TabItem>
</Tabs>

## Remove

<Tabs groupId="gemini-route">
<TabItem value="command" label="Install command" default>

```bash
devcoach uninstall --gemini
```

<Terminal command="devcoach uninstall --gemini" output={uninstallGemini} />

It removes the server and the hooks from `~/.gemini/settings.json`. The devcoach skill in
`~/.agents/skills/devcoach/` goes too, unless Codex CLI still uses it.

</TabItem>
<TabItem value="extension" label="Extension">

```bash
gemini extensions uninstall devcoach
rm -rf ~/.devcoach/gemini-ext        # the extension's downloaded copy of devcoach
```

Gemini removes its copy of the extension. The downloaded devcoach stays in `~/.devcoach/gemini-ext/`
until you delete it; your lessons are not in that folder.

</TabItem>
</Tabs>

Your lessons, profile, notebook and courses stay in `~/.devcoach/`. To delete them too, run
`devcoach uninstall --gemini --data` (`npx -y devcoach …` without devcoach installed); it asks first.
Back up with `devcoach backup` if you might come back.

## If it doesn't work

| What you see | What to do |
|---|---|
| `gemini mcp list`: *MCP servers are configured but disabled because this folder is untrusted.* | Gemini connects no MCP server in a folder it does not trust, user-level ones included. Trust the folder when Gemini asks, or with `/permissions trust` |
| No lessons, and devcoach shows **Disconnected** in `gemini mcp list` in a trusted folder (extension) | The extension's launcher could not start devcoach, and its hooks fail silently. The [launcher's check](#check-it-worked) prints why (below) |
| `/hooks list` shows no devcoach hooks | Check that `hooksConfig.enabled` is not `false` in Gemini's `settings.json`, then restart Gemini |
| `devcoach doctor`: *devcoach hooks are registered TWICE (extension + settings.json)* | Both routes are wired and every turn counts twice. Keep one: `devcoach uninstall --gemini` |
| `devcoach doctor`: *hook runs via npx* | Expected through npx. Install devcoach, then run `devcoach install --gemini` again |

<Terminal
  command="node …/scripts/launch.mjs doctor"
  output={extensionNoNpm}
  caption="The extension's first start with no npm on the PATH. The other reasons it gives: Node older than 24, or no network for the download."
/>

**Beta.** The coaching engine is the one Claude Code uses; the wiring for this agent is newer, and
untested on Windows. Please report anything odd on
[GitHub issues](https://github.com/UltimaPhoenix/dev-coach/issues). Anything else:
[Troubleshooting](../troubleshooting.md).

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding, your first lesson, and how to set the pace.
  </Card>
</Cards>
