---
title: Windows
sidebar_label: Windows
description: Install devcoach on Windows with one PowerShell line — a private, checksum-verified Node.js and the devcoach bundle, connected to Claude Code and Claude Desktop — or with Scoop.
keywords: [devcoach windows, install devcoach powershell, scoop devcoach, claude code windows mcp server, claude code hooks windows]
---

# Windows

:::tip[Recommended on Windows]
One PowerShell line installs devcoach with its **own Node.js** and connects your agents — what
`brew install` does on macOS. Prefer a package manager? The [Scoop bucket](#scoop) below is the
Windows twin of the Homebrew tap. Both give you the `devcoach` [CLI](../usage/cli.md) and the
[dashboard](../usage/web-ui.md) with a bare `devcoach ui`.
:::

*Available from devcoach 2.8.0. Windows support is **Beta**: every release is installed, connected
and uninstalled on a Windows runner by CI, and real-world reports are welcome.*

## One line (PowerShell)

```powershell
irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex
```

Windows 10 or 11, 64-bit (x64 or ARM64), Windows PowerShell 5.1 or PowerShell 7. No administrator
rights, no execution-policy change (the script runs in memory), no Git for Windows needed. What it
does, in order:

1. Downloads the latest `devcoach-<version>-standalone.zip` from the
   [GitHub release](https://github.com/UltimaPhoenix/dev-coach/releases/latest) and verifies its
   SHA-256 against the release's `SHASUMS256.txt`.
2. Downloads the current Node.js LTS from nodejs.org, verifies it against Node's own
   `SHASUMS256.txt`, and checks `node.exe`'s Authenticode signature (OpenJS Foundation). This Node
   is **private to devcoach**: your own Node, nvm-windows, fnm or Volta setup is neither needed nor
   touched.
3. Puts both under `%LOCALAPPDATA%\devcoach` and writes a `devcoach` command into its `bin\`
   folder, which it adds to your **user** PATH.
4. Runs `devcoach install`: registers the MCP server and the coaching hooks with Claude Code and
   the MCP server with Claude Desktop, and installs the skill into `~\.claude\skills\devcoach\`.

| What | Where |
|---|---|
| devcoach | `%LOCALAPPDATA%\devcoach\app\` |
| its Node.js | `%LOCALAPPDATA%\devcoach\node\` |
| the `devcoach` command | `%LOCALAPPDATA%\devcoach\bin\` (on your user PATH) |
| **your data** — lessons, profile, notebook | `~\.devcoach\` — never touched by install or uninstall |

Open a **new** terminal afterwards: the one you ran the script in does not see the PATH change.
Then head to **[Coaching in your agent](../usage/coaching.md)**.

### Updating

Re-run the same line. It replaces the devcoach bundle, keeps Node unless a newer LTS is out, and
runs `devcoach install` again so the hooks and the skill match the new version. Close Claude Code
and Claude Desktop first if it says a directory is in use — they hold `node.exe` while devcoach runs.

### Options

Set an environment variable before the one-liner, or save the script and pass parameters:

```powershell
$env:DEVCOACH_CHANNEL = "next"; irm https://ultimaphoenix.github.io/dev-coach/install.ps1 | iex

irm https://ultimaphoenix.github.io/dev-coach/install.ps1 -OutFile install.ps1
.\install.ps1 -Version 2.8.0 -ConnectArgs --gemini
```

| Environment variable | Parameter | Effect |
|---|---|---|
| `DEVCOACH_VERSION` | `-Version 2.8.0` | A specific release (default: the latest) |
| `DEVCOACH_CHANNEL` | `-Channel next` | The canary build from `develop` |
| `DEVCOACH_INSTALL_DIR` | `-InstallDir D:\tools\devcoach` | Another runtime location |
| `DEVCOACH_NODE_VERSION` | `-NodeVersion 26.13.0` | A specific private Node (default: newest LTS) |
| `DEVCOACH_USE_SYSTEM_NODE=1` | `-UseSystemNode` | No private Node: the `node` on your PATH (must be ≥ 24) |
| `DEVCOACH_NO_MODIFY_PATH=1` | `-NoModifyPath` | Leave the user PATH alone |
| `DEVCOACH_SKIP_CONNECT=1` | `-SkipConnect` | Do not run `devcoach install` at the end |
| | `-ConnectArgs --gemini` | Extra arguments for `devcoach install` ([Gemini CLI](./gemini-cli.md), [Codex CLI](./codex.md)) |
| | `-Archive path\to\devcoach-2.8.0-standalone.zip` | Install from a downloaded zip (offline) |

### Uninstall

`%LOCALAPPDATA%\devcoach\uninstall.ps1`, or **Apps & Features → devcoach**, or the saved script with
`-Uninstall`. It runs `devcoach uninstall --all` first (MCP registrations, hooks and skill out of
every agent), then removes the runtime, the PATH entry and the Apps & Features entry. Your data in
`~\.devcoach` stays — delete it with `devcoach uninstall --data` *before* uninstalling if you want
it gone too.

## Scoop

```powershell
scoop bucket add ultimaphoenix https://github.com/UltimaPhoenix/scoop-bucket
scoop install devcoach
devcoach install
```

Scoop installs its `nodejs-lts` next to devcoach (the manifest depends on it) and shims the
`devcoach` command, so nothing else is needed. Update with `scoop update devcoach`, then
`devcoach install` again to refresh the hooks and the skill — exactly like `brew upgrade`. Before
`scoop uninstall devcoach`, run `devcoach uninstall`: Scoop cannot undo what devcoach wired into
your agents. CI updates the bucket at every release.

## How Claude Code is wired on Windows

`devcoach install` registers the MCP server as `node.exe` + devcoach's script, and the two hooks
in the same **exec form** (`command` + `args`, no shell). That is the form Claude Code recommends
on Windows: it works with or without Git Bash, and PowerShell's execution policy never sees it.
`devcoach doctor` checks the whole wiring and says why the next stop would — or would not — deliver
a lesson.

The [Claude Code plugin](./claude-code-plugin.md) and the [Claude Desktop extension](./claude-desktop.md)
work on Windows too: the plugin needs a Node ≥ 24 on the PATH Claude Code uses (`winget install
OpenJS.NodeJS.LTS`), the extension runs on Claude Desktop's bundled Node. Neither adds the CLI.

## npm instead

`npm install -g devcoach`, then `devcoach install` — it registers `node.exe` and devcoach's script,
never the `.cmd` shim (a shim cannot be spawned without a shell). With nvm-windows, fnm or Volta the
install lives inside one Node version's directory and goes away with it: run `devcoach install --force`
after switching.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `… is in use — close Claude Code / Claude Desktop` | An agent is running devcoach and holds `node.exe`. Close them, re-run the line. |
| `devcoach` not found in a terminal you had open | Open a new one; the PATH change reaches new processes only. |
| A corporate policy blocks `irm … \| iex` | Save the script (`irm … -OutFile install.ps1`) and run `powershell -ExecutionPolicy Bypass -File .\install.ps1`. |
| No lesson ever arrives | `devcoach doctor` — it checks the hooks, the MCP entry, the skill and the pacing. |
| Windows Defender SmartScreen | Nothing to confirm: the only executable is `node.exe`, signed by the OpenJS Foundation; devcoach itself is JavaScript. |

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
