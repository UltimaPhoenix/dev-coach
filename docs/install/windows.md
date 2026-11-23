---
title: Windows
sidebar_label: Windows
description: Install devcoach on Windows with one PowerShell line or with Scoop. Both bring Node.js and the devcoach command; devcoach install connects Claude Code and Claude Desktop.
keywords: [devcoach windows, install devcoach powershell, scoop devcoach, claude code windows mcp server, claude code hooks windows]
---

import { Card, Cards } from "@site/src/components/Cards";
import FileTree from "@site/src/components/FileTree";
import { OnNext, OnStable } from "@site/src/components/ReleaseChannel";

# Windows

## What you get here

One PowerShell line, or Scoop: both bring their own Node.js and put the `devcoach` command on your
PATH, as Homebrew does on macOS. The line also connects your agents; with Scoop you run
`devcoach install` yourself. Windows support is in beta.

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

`devcoach install --gemini` or `--codex` adds [Gemini CLI](./gemini-cli.md) or
[Codex CLI](./codex.md) *(beta)*; their hooks are untested on Windows. Another agent? See
[what each agent gets](./index.md#what-each-agent-gets).

## You need

- **Windows 10 or 11, 64-bit** (x64 or ARM64), with Windows PowerShell 5.1 or PowerShell 7.
- **No administrator rights, Git for Windows or Node.js.** The line installs a private Node, Scoop its
  `nodejs-lts`. The line runs in memory, so no execution policy applies.
- **The network:** github.com for devcoach, nodejs.org for Node.js.

## Install

### One line (PowerShell)

<OnStable>

```powershell
irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex
```

</OnStable>
<OnNext>

This is the unreleased documentation: this line installs the canary built from `develop`, which may
break.

```powershell
$env:DEVCOACH_CHANNEL = "next"
irm https://ultimaphoenix.github.io/dev-coach/next/install.ps1 | iex
```

</OnNext>

**Using the [Claude Code plugin](./claude-code-plugin.md)?** The line ends with `devcoach install`,
which next to the plugin adds a second devcoach server and a second copy of the skill. Skip it: run
this first, in the same PowerShell window, then the line.

```powershell
$env:DEVCOACH_SKIP_CONNECT = "1"
```

Claude Desktop is then not connected either: `devcoach install --claude-desktop` afterwards.

In order, the line:

1. Downloads `devcoach-<version>-standalone.zip` from the
   [latest release](https://github.com/UltimaPhoenix/dev-coach/releases/latest) (the canary: the
   [`next` prerelease](https://github.com/UltimaPhoenix/dev-coach/releases/tag/next)) and checks its
   SHA-256 against the release's `SHASUMS256.txt`.
2. Downloads the current Node.js LTS from nodejs.org, checks it against Node's own `SHASUMS256.txt`
   and checks `node.exe`'s Authenticode signature (OpenJS Foundation). This Node is **private to
   devcoach**: your own Node, nvm-windows, fnm or Volta is neither needed nor touched.
3. Puts both under `%LOCALAPPDATA%\devcoach` and adds its `bin\` folder, with the `devcoach`
   command, to your **user** PATH.
4. Runs `devcoach install`: the MCP server, two hooks and the devcoach skill in Claude Code, the MCP
   server in Claude Desktop.

### Options

Set a variable before the line, as above, or save the script and pass parameters:

<OnStable>

```powershell
irm https://ultimaphoenix.github.io/dev-coach/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -InstallDir D:\tools\devcoach
```

</OnStable>
<OnNext>

```powershell
irm https://ultimaphoenix.github.io/dev-coach/next/install.ps1 -OutFile install.ps1
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Channel next
```

</OnNext>

<details>
<summary>All options</summary>

Each as a parameter, or as a variable:

- `-Version <x.y.z>`, `DEVCOACH_VERSION`: a specific release (default: the latest).
- `-Channel next`, `DEVCOACH_CHANNEL`: the canary built from `develop`.
- `-InstallDir D:\tools\devcoach`, `DEVCOACH_INSTALL_DIR`: another place for the runtime.
- `-NodeVersion 26.13.0`, `DEVCOACH_NODE_VERSION`: a specific private Node (default: the newest LTS).
- `-UseSystemNode`, `DEVCOACH_USE_SYSTEM_NODE=1`: no private Node; the `node` on your PATH, 24 or
  newer.
- `-NoModifyPath`, `DEVCOACH_NO_MODIFY_PATH=1`: leave your user PATH alone.
- `-SkipConnect`, `DEVCOACH_SKIP_CONNECT=1`: don't run `devcoach install` at the end.
- `-SkipSignatureCheck`, `DEVCOACH_SKIP_SIGNATURE_CHECK=1`: accept a `node.exe` whose Authenticode
  check fails (refused by default).

Parameters only:

- `-ConnectArgs --gemini`: arguments for `devcoach install`; they replace the default (here: Gemini
  CLI only).
- `-Archive path\to\devcoach-<version>-standalone.zip`: devcoach from a downloaded zip instead of
  GitHub. Node still comes from nodejs.org, unless you use the system Node.
- `-Uninstall`: runs the uninstaller described in [Remove](#uninstall).

An agent flag connects only that agent. For Claude Code, Claude Desktop and Gemini CLI, skip the
connect step, then run this in the same window (after the saved script: in a new window):

```powershell
devcoach install --claude-code --claude-desktop --gemini
```

</details>

### Scoop

```powershell
scoop bucket add ultimaphoenix https://github.com/UltimaPhoenix/scoop-bucket
scoop install devcoach
devcoach install
```

- **Node:** Scoop installs its `nodejs-lts` with devcoach and shims the `devcoach` command. If you
  manage Node yourself (nvm-windows, fnm), the one line keeps its Node private instead.
- **With the Claude Code plugin:** skip `devcoach install`. Claude Desktop is then not connected
  either: `devcoach install --claude-desktop` afterwards.
- **Update and remove:** see [Update](#updating) and [Remove](#uninstall). CI updates the bucket at
  every release.

## What it set up

<FileTree
  root="%LOCALAPPDATA%\devcoach\"
  items={[
    { name: "app\\", note: "devcoach itself, the standalone bundle from the release", children: [
      { name: "dist\\bin.js", note: "the script every agent starts" },
    ] },
    { name: "node\\", note: <>the private Node.js; not there with <code>-UseSystemNode</code></>, children: [
      { name: "node.exe", note: "signed by the OpenJS Foundation" },
    ] },
    { name: "bin\\", note: <>added to your user PATH (<code>HKCU\Environment</code>)</>, children: [
      { name: "devcoach.cmd", note: "the command, for PowerShell and cmd" },
      { name: "devcoach", note: "the same, for Git Bash" },
    ] },
    { name: "uninstall.ps1", note: <>what <strong>Apps &amp; Features → devcoach</strong> runs; registered under <code>HKCU\…\Uninstall\devcoach</code></> },
  ]}
  caption={<>The runtime, from <code>install.ps1</code>. Your data lives apart, in <code>~\.devcoach\</code>: the installer never touches it, not even to uninstall.</>}
/>

`devcoach install` writes into your agents' settings: the hooks in `~\.claude\settings.json`, the
skill in `~\.claude\skills\devcoach\`, Claude Code's server entry, and
`%APPDATA%\Claude\claude_desktop_config.json`. Scoop keeps devcoach in its `apps\devcoach\current\`,
and agents start it through `current`, so `scoop update` keeps them working.

<details id="how-claude-code-is-wired-on-windows">
<summary>How is Claude Code wired on Windows?</summary>

Each hook, and the MCP server, starts the private `node.exe` with devcoach's script, in the exec form
(`command` plus `args`). The Stop hook in `~\.claude\settings.json`, for user `x`:

```json
{
  "type": "command",
  "command": "C:\\Users\\x\\AppData\\Local\\devcoach\\node\\node.exe",
  "args": ["C:\\Users\\x\\AppData\\Local\\devcoach\\app\\dist\\bin.js", "stop-hook"],
  "timeout": 60
}
```

Claude Code runs it without a shell, so it works with or without Git Bash, and PowerShell's
execution policy never sees it. On macOS and Linux a hook is one string (`…/bin/devcoach stop-hook`);
on Windows that string would reach Git Bash, which drops unquoted backslashes, or PowerShell, where
`npx` becomes `npx.ps1` and the execution policy refuses it. `UserPromptSubmit` is the same, with
`prompt-hook`.

For every change, CI runs this installer on a Windows runner from a freshly built zip: it checks the
private Node, the user PATH and this hook, runs the hook and `devcoach doctor`, then uninstalls. It
does not run the `irm | iex` line or Scoop.

</details>

## Check it worked

The line ends with `devcoach <version> is installed.` Its window has `devcoach` already; in a
terminal opened before, reopen it first:

```powershell
devcoach --version
devcoach doctor
```

`doctor` checks each part of the wiring. Look for `this devcoach: windows-installer` and
`Node … via bundled` (`scoop` and `via scoop` with Scoop) under **Environment**, then `✓ Stop hook wired` and
`✓ UserPromptSubmit priming hook wired` under **Claude Code wiring**. A `shell-form hook on Windows`
line means hooks written the old way: run `devcoach install` again, as it says.

## First run

Start a new Claude Code session and restart Claude Desktop. After your first task devcoach offers to
set up your profile and asks how: **Automatic** (recommended), **Automatic (Deep)**, **Guided** or
**Import backup**. In Claude Desktop, say *set up devcoach* once, then ask for a lesson when you want
one (*teach me something from what we just did*).

From then on, when your agent finishes a task and a lesson is due, devcoach teaches one short lesson
on something that task touched. The pace is yours to set:
[Coaching in your agent](../usage/coaching.md).

## Update {/* #updating */}

**One line:** run it again (with the plugin, set `DEVCOACH_SKIP_CONNECT` again first). It replaces
devcoach, keeps the private Node while it is on the same LTS line (a new line, 26 → 28, is
downloaded; `-NodeVersion` pins one), and runs `devcoach install` so the hooks and the skill match.
If it says a folder is in use, close Claude Code and Claude Desktop: they hold `node.exe`.

**Scoop:**

```powershell
scoop update devcoach
# refresh the hooks and the devcoach skill (skip this with the plugin)
devcoach install
```

## Remove {/* #uninstall */}

**One line:** open **Settings → Apps → Installed apps** (Windows 10: **Apps & Features**), find
**devcoach** and uninstall it. From PowerShell, the same command that entry runs:

```powershell
$u = "$env:LOCALAPPDATA\devcoach\uninstall.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $u
```

It runs `devcoach uninstall --all` (devcoach out of every agent), then removes the runtime, the PATH
entry and the Apps & Features entry. With `-InstallDir`, use that folder.

**Scoop:** Scoop cannot undo what devcoach wrote into your agents, so remove that first:

```powershell
devcoach uninstall --all
scoop uninstall devcoach
```

Your lessons, profile, notebook and courses stay in `~\.devcoach\`. To delete them too, run
`devcoach uninstall --data` **before** removing devcoach (back up first with `devcoach backup` if you
might come back).

## If it doesn't work {/* #troubleshooting */}

| What you see | What to do |
|---|---|
| `… is in use - close Claude Code / Claude Desktop (they run devcoach) and re-run.` | An agent is running devcoach and holds `node.exe`. Close them, run the line again |
| `the release at … has no standalone zip …` | That release predates Windows support. The message names the first release that has it: ask for that one or a newer one with the version option ([Options](#options)), or leave the option out for the latest |
| `node.exe's Authenticode signature is …` | The downloaded Node is not signed as expected, so the install stops. The signature option in [Options](#options) overrides it |
| `devcoach install exited with …` | Open a new terminal and run `devcoach install` |
| `devcoach` not found in a terminal you had open | Open a new one: the PATH change reaches new processes only |
| A policy blocks `irm … \| iex` | Save the script and run it with `-ExecutionPolicy Bypass`, as in [Options](#options) |
| No lesson ever arrives | `devcoach doctor` checks the hooks, the MCP entry, the skill and the pacing |
| Windows Defender SmartScreen | Nothing to confirm: the only executable is `node.exe`, signed by the OpenJS Foundation; devcoach itself is JavaScript |

Anything else: [Troubleshooting](../troubleshooting.md).

## npm instead

`npm install -g devcoach`, then `devcoach install`: it registers `node.exe` and devcoach's script,
never the `.cmd` shim, which cannot start without a shell. With nvm-windows or fnm, read
[Node version managers](./npx.md#node-version-managers) first.

The [Claude Code plugin](./claude-code-plugin.md) needs Node 24 or newer on the PATH Claude Code uses
(`winget install OpenJS.NodeJS.LTS`); the [Claude Desktop extension](./claude-desktop.md) runs on
Claude Desktop's own Node. Neither adds the `devcoach` command.

<Cards>
  <Card label="Next" title="Coaching in your agent" to="/usage/coaching">
    Onboarding and your first lesson.
  </Card>
</Cards>
