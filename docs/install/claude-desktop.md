---
title: Claude Desktop (.mcpb)
sidebar_label: Claude Desktop (.mcpb) (Beta)
---

# Claude Desktop extension (`.mcpb`)

:::warning[Beta]
The `.mcpb` extension format is currently in beta. It works well for most users, but report any issues
to [GitHub Issues](https://github.com/UltimaPhoenix/dev-coach/issues). For the most stable experience,
use [Homebrew](./homebrew.md) or [npm/npx](./npx.md).
:::

:::tip[Recommended for Claude Desktop]
The simplest, no-terminal way to add devcoach to Claude Desktop — one click, runs on Desktop's built-in
runtime.
:::

Every GitHub release ships a prebuilt `devcoach-<version>.mcpb` — a single bundle that runs on Claude
Desktop's built-in Node runtime, so no Node install or terminal is required:

1. Download `devcoach-<version>.mcpb` from the
   [latest release](https://github.com/UltimaPhoenix/dev-coach/releases/latest).
2. In Claude Desktop open **Settings → Extensions → Install Extension…** and pick the downloaded file.

That's it — the `devcoach` tools, resources, and the `devcoach_instructions` prompt are available in
your next conversation, and the database is created at `~/.devcoach/coaching.db` on first use.

## How lessons start in Claude Desktop

Claude Desktop has no hooks, so devcoach cannot interrupt a conversation the way it does in Claude
Code. Instead, its server instructions make Claude the trigger: after a technical task (code, a review,
debugging, configuration, a query), Claude quietly checks devcoach and adds one lesson at the end of
its reply when one is due. You will see that check as a devcoach tool call; most of the time it finds
nothing due and Claude says nothing about it.

- **Pacing** is the rate limit alone: at most `max_per_day` lessons (default 2) in 24 hours, at least
  `min_gap_minutes` (default 240) apart. Change both by asking Claude (*"set devcoach's daily
  limit to 3"*), in the dashboard's Settings, or with `devcoach set`. `nudge_every` counts hook
  turns and does not apply here.
- **"Coach me"** asks for a lesson at any time, whatever the rate limit says.
- **The first time**, Claude offers to set up your profile after a technical task — once per
  conversation.
- While a **course** is in progress, lessons pause, as they do in Claude Code.

The same applies to a devcoach entry in `claude_desktop_config.json` (Homebrew, npm): Claude Desktop
identifies itself to every MCP server the same way.

:::note[Unverified publisher]
The bundle is **self-signed**, so Claude Desktop shows it as coming from an *unverified publisher*. A
verified signature needs a real code-signing certificate, which isn't configured — the label is
expected. Every release also publishes `SHASUMS256.txt` next to the `.mcpb` if you want to verify the
download.
:::

## From source

```bash
npm run mcpb        # → dist-mcpb/devcoach-<version>.mcpb
npm run mcpb:sign   # self-sign it — installs with the same "unverified publisher" label
```

Then install the resulting file through the same **Settings → Extensions → Install Extension…** dialog.

## When devcoach does not start

This applies to every way devcoach reaches Claude Desktop: the extension above, or an entry that
`devcoach install` wrote in `claude_desktop_config.json` (Homebrew, npm).

**Read the log first.** Claude Desktop keeps one log per MCP server:

| OS | Log |
|---|---|
| macOS | `~/Library/Logs/Claude/mcp-server-devcoach.log` |
| Windows | `%APPDATA%\Claude\logs\mcp-server-devcoach.log` |

Each time devcoach starts it writes one line there, then one more once Claude Desktop is connected:

```text
devcoach 2.6.3 mcp · node 26.5.0 via homebrew (/opt/homebrew/Cellar/node/26.5.0/bin/node) · homebrew (/opt/homebrew/Cellar/devcoach/2.6.3/…/dist/bin.js) · data ~/.devcoach (schema 6)
devcoach 2.6.3 mcp · client claude-ai 0.1.0
```

That is which devcoach ran, on which Node, installed how. Your home directory is shown as `~`, so
the log can be shared as is.

**`Failed to spawn process: No such file or directory`** means devcoach never ran: there is no line
of its own after it. The operating system could not execute the command in Claude Desktop's
config, for one of two reasons:

- the command is not there — devcoach was uninstalled, or a bare `devcoach` is not on the PATH
  *Claude Desktop* uses (it prints that PATH in the log, next to `Using MCP server command`);
- the command is there, but the Node it names in its first line is not — e.g. Homebrew's Node was
  removed while Homebrew's devcoach still points at it.

Run **`devcoach doctor`**: its *Claude Desktop* section resolves the command on the PATH from
Claude Desktop's log, checks the Node behind it, and says which case it is. Then
**`devcoach install --claude-desktop --force`** writes an absolute command, which does not depend
on Claude Desktop's PATH. Restart Claude Desktop.

Ignore `Server started and connected successfully` while reading: Claude Desktop writes it before
the process starts, so it also appears right before a failure.

:::note[nvm, fnm, volta, asdf, mise]
A devcoach installed with `npm i -g` under a Node version manager lives inside one Node version's
directory (`~/.nvm/versions/node/v26.5.0/…`). Removing or switching that version removes devcoach
with it, and Claude Desktop starts failing with the message above. `devcoach install` warns when it
writes such a path, and `devcoach doctor` names the version it depends on: run
`devcoach install --force` again after changing Node.
:::

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
