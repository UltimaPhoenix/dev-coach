---
title: Codex CLI
sidebar_label: Codex CLI (beta)
description: Install devcoach in Codex CLI (beta) with one command. Once you trust its two hooks, they cue a lesson when one is due; the devcoach skill and the MCP server come with them.
keywords: [devcoach codex, codex cli mcp server, codex hooks, codex hooks trust, codex skills, codex config.toml]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";
import cli from "@site/src/data/cli-output.json";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

export const doctorCodex = "\n\u001b[1mdevcoach doctor\u001b[22m \u001b[2mv2.7.1\u001b[22m\n\n\u001b[1mEnvironment\u001b[22m\n  \u001b[32m✓\u001b[39m Node 24.22.3 via nvm (≥ 24)\n  \u001b[32m✓\u001b[39m this devcoach: npm-global, bound to Node v24.22.3 (nvm) (~/.nvm/versions/node/v24.22.3/lib/node_modules/devcoach)\n\u001b[1m\nClaude Code wiring\u001b[22m\n  \u001b[31m✗\u001b[39m no devcoach hooks in ~/.claude/settings.json — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m Claude Code skill not installed — run \u001b[1mdevcoach install\u001b[22m\n  \u001b[33m→\u001b[39m MCP server not found in ~/.claude.json — it may be registered elsewhere (check with \u001b[1mclaude mcp get devcoach\u001b[22m)\n\u001b[1m\nCodex CLI wiring (beta)\u001b[22m\n  \u001b[32m✓\u001b[39m Stop hook wired\n  \u001b[32m✓\u001b[39m UserPromptSubmit priming hook wired\n  \u001b[33m→\u001b[39m Codex runs hooks only after you trust them once — check the prompt on the next run\n  \u001b[32m✓\u001b[39m skill installed (~/.agents/skills, current version)\n  \u001b[32m✓\u001b[39m MCP server registered (config.toml)\n\u001b[1m\nDatabase & pacing\u001b[22m\n  \u001b[33m→\u001b[39m no database yet (~/.devcoach/coaching.db) — onboarding runs on the first technical task";
export const trustScreen = "\u001b[0m  \u001b[0;1mHooks need review\u001b[0m\u001b[0m\n\u001b[0m  \u001b[0;33m2 hooks are new or changed.\u001b[0m\u001b[0m\n\u001b[0m  Hooks can run outside the sandbox after you trust them.\u001b[0m\n\u001b[0m\u001b[0m\n\u001b[0m\u001b[0m\n\u001b[0;1m› 1. Review hooks\u001b[0m\n\u001b[0m  2. Trust all and continue\u001b[0m\n\u001b[0m  3. Continue without trusting (hooks won't run)\u001b[0m\n\u001b[0m\u001b[0m\n\u001b[0m  \u001b[0;1menter\u001b[0m confirm · \u001b[0;1mesc\u001b[0m skip\u001b[0m";
export const uninstallCodex = "\u001b[1mRemoving devcoach from your agents\u001b[22m\n\n\u001b[1mCodex CLI (beta)\u001b[22m\n  MCP server…  \u001b[33mManual step\u001b[39m — codex CLI not found. Delete the [mcp_servers.devcoach] table from ~/.codex/config.toml\n  Hooks…       \u001b[32m✓\u001b[39m Hooks removed from ~/.codex/hooks.json (Stop + UserPromptSubmit)\n\n\u001b[1mShared skill (Gemini + Codex)\u001b[22m\n  Skill…       \u001b[32m✓\u001b[39m Removed ~/.agents/skills/devcoach\n\n\u001b[2mYour lessons, profile and notebook are still in ~/.devcoach — keep them for a\nreinstall, or delete them with: devcoach uninstall --data  (devcoach backup first).\u001b[22m\n\u001b[2mThen remove the program itself: brew uninstall devcoach · npm uninstall -g devcoach · scoop uninstall devcoach · %LOCALAPPDATA%\\devcoach\\uninstall.ps1\n(npx: nothing to remove).\u001b[22m";

# Codex CLI (beta)

## What you get here

<Cards columns={4}>
  <Card title="Automatic lessons" to="/how-it-works">

When Codex finishes a task and a lesson is due, a hook cues one, once you trust the hooks.

  </Card>
  <Card title="The devcoach skill" to="/usage/coaching">

How to teach you. Codex loads it for each lesson.

  </Card>
  <Card title="MCP server" to="/reference/mcp-server">

Tools Codex calls to save lessons and read your profile.

  </Card>
  <Card title="Web dashboard" to="/usage/web-ui">

Ask Codex to *open the devcoach dashboard*, or run `devcoach ui`.

  </Card>
</Cards>

Every agent on this computer shares your profile and lessons in `~/.devcoach/`
([what each agent gets](./index.md#what-each-agent-gets)).

## You need

- **Node.js 24 or newer** on the PATH your agent uses (`node --version`). Homebrew, Scoop and the
  Windows installer install it for you.
- **devcoach installed** ([Homebrew](./homebrew.md), [npm](./npx.md), [Windows](./windows.md)), or npm
  and the network for npx.
- **A Codex CLI with hooks.** This page was checked with Codex CLI 0.171.0, where hooks are on by
  default.
- **macOS or Linux.** This integration is in beta, and on Windows its hooks are untested.

## Install

```bash
devcoach install --codex
```

Most readers should take this route, with devcoach installed: the hooks call it directly, nothing
downloads on a turn, and you get the `devcoach` command too. Without devcoach installed,
`npx -y devcoach install --codex` works as well, but its hooks then start npx twice per turn, and npx
asks the npm registry at every start. Offline, each hook waits out npm's network retries (over a
minute in our test), longer than the agent lets a devcoach hook run (60 seconds at most), so no lesson
is cued.

### Add the server by hand

| When you run the install | The MCP server |
|---|---|
| `codex` is on your PATH | Registered through `codex mcp add`: Codex writes the table into `~/.codex/config.toml` |
| `codex` is not on your PATH | The install says *Manual step — codex CLI not found* and prints the table: add it yourself |

devcoach never edits `~/.codex/config.toml` itself. In the second case, add this table to it, and
create the file if it does not exist:

<Tabs groupId="codex-route">
<TabItem value="installed" label="devcoach installed" default>

```toml title="~/.codex/config.toml"
[mcp_servers.devcoach]
command = "/opt/homebrew/bin/devcoach"
args = ["mcp"]
```

`command` takes the absolute path the install printed; `command -v devcoach` prints it too. Write it
out in full: TOML does not expand `~` or `$HOME`. The example is Homebrew's path on Apple silicon;
with npm on Node from nvm, devcoach sits in `~/.nvm/versions/node/<version>/bin/`, tied to that Node
version.

</TabItem>
<TabItem value="npx" label="Through npx">

```toml title="~/.codex/config.toml"
[mcp_servers.devcoach]
command = "npx"
args = ["-y", "devcoach", "mcp"]
```

</TabItem>
</Tabs>

Without the table Codex still runs the hooks and loads the skill, but has none of the tools a lesson
needs.

## What it set up

<Terminal
  command="devcoach install --codex"
  output={cli.installCodex}
  caption={<>Captured after the Gemini CLI install, so the shared skill was already there. Your home shows as <code>~</code> here; your own output prints the full path, which the TOML table needs.</>}
/>

<FileTree
  root="~/"
  items={[
    { name: ".codex/hooks.json", note: <>the hooks <code>Stop</code> and <code>UserPromptSubmit</code></> },
    { name: ".codex/config.toml", note: <>the <code>[mcp_servers.devcoach]</code> table, written by <code>codex mcp add</code> or by you. Codex keeps its trust records for the hooks here too</> },
    { name: ".agents/skills/devcoach/", note: "the devcoach skill, shared with Gemini CLI", children: [
      { name: "SKILL.md", note: "how to teach you" },
      { name: "references/", note: "five more files: onboarding, calibration, review, sharing, courses" },
      { name: ".devcoach-version", note: "the version this copy came from" },
    ] },
    { name: ".devcoach/", note: "your lessons, profile, notebook and courses: created at onboarding, shared with every agent" },
  ]}
  caption={<>What the install writes: <code>hooks.json</code> and the skill. devcoach never writes <code>config.toml</code>.</>}
/>

How the hooks decide: [How it works](../how-it-works.md). Your data:
[Privacy & security](../reference/privacy.md).

## Check it worked

<Terminal
  command="devcoach doctor"
  output={doctorCodex}
  caption="After the install and the TOML table, on a computer with Codex CLI and no Claude Code. The → line about trust always shows: doctor cannot see whether you trusted the hooks."
/>

Read the **Codex CLI wiring** section: four ✓, for the two hooks, the skill and the server.
`devcoach doctor` always checks Claude Code first. If you don't use Claude Code, ignore its lines,
the red ✗ included. Through npx, each hook adds a `hook runs via npx` line: the cost described in
[Install](#install).

Codex's own checks:

| Run | It shows |
|---|---|
| `codex mcp list` in a terminal | devcoach, `enabled` |
| `/mcp` in a session | devcoach's tools |
| `/hooks` in a session | the two hooks, and whether they need review |
| `/skills` in a session | the devcoach skill |

## First run

Start a new `codex` session. Codex keeps new hooks off until you trust them, and opens on this
screen:

<Terminal
  command="codex"
  output={trustScreen}
  caption={<>Codex CLI 0.171.0 on its first start after <code>devcoach install --codex</code>, redrawn from a recording of the terminal.</>}
/>

| Choice | What happens |
|---|---|
| **Review hooks** | Codex opens its list of hooks, where you can read each command and trust it (`t`) |
| **Trust all and continue** | Both hooks run from now on (Codex asks you to confirm) |
| **Continue without trusting** | The hooks stay off and no lesson arrives on its own; `/hooks` can trust them later |

After your first task devcoach offers to set up your profile and asks how: **Automatic**
(recommended), **Automatic (Deep)**, **Guided** or **Import backup**.

:::note[Codex asks again after a change]

Codex trusts each hook's exact command. When `devcoach install --codex` rewrites the hooks, for
example when you move between npx and an installed devcoach, Codex lists them as changed and shows
this screen again.

:::

The pace is yours to set: by default about one cue every 10 interactions in a chat session, at most
2 lessons a day, at least 4 hours apart, and none while a course is in progress
([Coaching in your agent](../usage/coaching.md)). Codex tells its hooks when you are in plan mode,
and plan-mode turns do not count.

## Update

Upgrade devcoach the way you installed it, then run the install again. Codex keeps its trust while
the hook commands stay the same; when they change, trust them again ([First run](#first-run)).

```bash
brew upgrade devcoach        # or: npm install -g devcoach@latest
devcoach install --codex
```

The hooks and the server already run the new version; the second command refreshes the devcoach
skill, and `devcoach doctor` says when it is out of date. Through npx, npx runs the newest devcoach
whenever it is online; run `npx -y devcoach install --codex` again to refresh the skill.

## Remove

```bash
devcoach uninstall --codex
```

It removes the hooks, and the server too through `codex mcp remove` when `codex` is on your PATH.
Otherwise delete the three-line `[mcp_servers.devcoach]` table from `~/.codex/config.toml` yourself.
Codex's trust records for the two hooks (the `[hooks.state."…"]` tables that name `hooks.json`) run
nothing and can go too.

<Terminal command="devcoach uninstall --codex" output={uninstallCodex} caption={<>Without <code>codex</code> on the PATH: the manual step.</>} />

The devcoach skill in `~/.agents/skills/devcoach/` goes too, unless Gemini CLI still uses it.

Your lessons, profile, notebook and courses stay in `~/.devcoach/`. To delete them too, run
`devcoach uninstall --codex --data` (`npx -y devcoach …` without devcoach installed); it asks first.
Back up with `devcoach backup` if you might come back.

## If it doesn't work

| What you see | What to do |
|---|---|
| No lessons, and `/hooks` says hooks need review | Trust them, as in [First run](#first-run) |
| `/mcp` lists no devcoach tools | Add the server table: [Add the server by hand](#add-the-server-by-hand) |
| `/hooks` lists no devcoach hooks | Run `codex features list`: `hooks` must read `true`. If it does not, add `[features]` with `hooks = true` to `~/.codex/config.toml` |
| `devcoach doctor`: *hook runs via npx* | Expected through npx. Install devcoach, run `devcoach install --codex` again, then trust the changed hooks |

**Beta.** The coaching engine is the one Claude Code uses; the wiring for this agent is newer, and
untested on Windows. Please report anything odd on
[GitHub issues](https://github.com/UltimaPhoenix/dev-coach/issues). Anything else:
[Troubleshooting](../troubleshooting.md).

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding, your first lesson, and how to set the pace.
  </Card>
</Cards>
