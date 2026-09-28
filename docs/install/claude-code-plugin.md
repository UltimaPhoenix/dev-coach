---
title: Claude Code plugin
sidebar_label: Claude Code plugin
description: Install devcoach in Claude Code as a plugin — MCP server, Stop/UserPromptSubmit coaching hooks, and the coaching skill in one click from the marketplace.
keywords: [devcoach claude code plugin, claude code marketplace, claude code mcp server, claude code hooks, claude code skills]
---

# Claude Code plugin

:::tip[Recommended if you'd rather not use a terminal]
This is the simplest way to add devcoach to Claude Code — one click, nothing to configure. (Prefer the
terminal and want the `devcoach` CLI too? Use [Homebrew](./homebrew.md) instead.)
:::

devcoach ships as a **Claude Code plugin** that bundles everything in one install:

- the **MCP server** (25 tools, 11 resources, the `devcoach_instructions` prompt),
- the two automatic-coaching **hooks** (`stop-hook` on Stop, `prompt-hook` on UserPromptSubmit), and
- the coaching **skill** (`SKILL.md` + its reference files).

With the plugin you do **not** need to run `devcoach install` — registering the hooks twice would
double-count interactions. `devcoach install` detects an enabled plugin and skips the hooks
automatically, and `devcoach doctor` flags a double registration.

## Install

Add the UltimaPhoenix marketplace once, then install devcoach from it:

```bash
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

The marketplace is pinned to each devcoach release by CI and carries every UltimaPhoenix plugin, so a
new one is a single `/plugin install` away. The MCP server, hooks and skill activate on install — no
restart needed.

### Updating

```bash
/plugin marketplace update ultimaphoenix
```

This refreshes your local copy of the marketplace so it points at the latest releases; Claude Code then
offers the update for the plugins you have installed. **Install fails with "invalid manifest …
repository: expected string"?** Plugin releases up to 1.0.1 shipped a manifest that current Claude Code
rejects — run the update above, then `/plugin install devcoach@ultimaphoenix` again.

### Installed it straight from the repo earlier?

Older docs also showed `/plugin marketplace add UltimaPhoenix/dev-coach`. That path still works, but it
tracks the repository's `main` branch rather than a pinned release and only ever contains devcoach.
Move over once:

```bash
/plugin uninstall devcoach@devcoach
/plugin marketplace remove devcoach
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

### Beta channel

Every green push to `develop` builds a canary (`npx -y devcoach@next`, the `next` prerelease on
GitHub) and pins it in a **separate beta marketplace**, so you can run what is coming next as a
plugin without touching the release:

```bash
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace-beta
/plugin install devcoach@ultimaphoenix-beta
```

The beta keeps the plugin name, so its tools, commands and skill are exactly the release's. Two
copies of the hooks would count every interaction twice, so **enable one at a time**: turn
`devcoach@ultimaphoenix` off while the beta is on (`/plugin`, or `enabledPlugins` in your settings),
and `devcoach doctor` warns if both are enabled. `/plugin marketplace update ultimaphoenix-beta`
picks up the newest canary; the [`next` prerelease](https://github.com/UltimaPhoenix/dev-coach/releases/tag/next)
notes say which commit it is (the beta pulls the prerelease's `devcoach-plugin-archive-<version>.zip`,
a plugin-root layout; nothing to do on your side). Canaries are unreleased and may break.

### Offline install

Download `devcoach-plugin-<version>.zip` from the [GitHub Releases](https://github.com/UltimaPhoenix/dev-coach/releases),
unzip it, then point Claude Code at the unzipped folder (the zip carries its own marketplace, named
`devcoach`):

```bash
/plugin marketplace add /path/to/unzipped-folder
/plugin install devcoach@devcoach
```

## How it works

When you enable the plugin, Claude Code wires in its component files. The plugin ships only config plus a
small bootstrap (`scripts/launch.mjs`) — **no bundled binary and no per-call `npx`**. On first use the
launcher installs the *pinned* `devcoach` version (from `plugin/package.json`) **once** into the plugin's
persistent data dir, then runs it directly with `node`; later calls (every hook fire, every server start)
skip straight to `node` — and it only re-installs when a plugin update bumps the pinned version.

1. **`.mcp.json`** → Claude Code launches the MCP server as a local stdio process
   (`node ${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs mcp`). It opens `~/.devcoach/coaching.db` (SQLite),
   derived from your home directory.
2. **`hooks/hooks.json`** → Claude Code runs the `Stop` hook after every turn and the
   `UserPromptSubmit` hook on every prompt, both through the same launcher. They read the same
   database and either stay silent or nudge the agent to run onboarding / deliver a lesson. This is
   what makes coaching automatic — and with no `npx` per fire, it's snappy.
3. **`skills/devcoach/SKILL.md`** → the coaching playbook, auto-loaded so the agent knows *how* to
   teach when a hook fires.

## The CLI next to the plugin

The plugin does the coaching on its own and keeps devcoach inside its own data dir — it does **not**
put the `devcoach` **CLI** on your `PATH`. The CLI stays a useful companion whenever you want the
dashboard or your data *without going through Claude*:

```bash
devcoach ui                    # the web dashboard, from a terminal — no Claude session needed
devcoach stats                 # counts, weakest and strongest topics
devcoach lessons --period week # browse the log; devcoach lesson <id> shows one in full
devcoach share --last          # hand a lesson to a teammate; devcoach import adds theirs
devcoach backup ~/dc.zip       # profile + lessons + notebook in one file (devcoach restore to load it)
devcoach doctor                # check the wiring and why the next stop would (not) cue a lesson
```

Three ways to reach it, from zero-install to a bare command:

1. **From inside Claude Code — nothing to install.** Type `/devcoach:ui` (optionally with a port,
   e.g. `/devcoach:ui 8080`), or just ask — *"open the devcoach dashboard"*. The plugin also ships
   `/devcoach:share [last | <id> | about <topic>] [as link|file]` and `/devcoach:import <code or link>`
   for [sharing lessons](../usage/sharing.md), and `/devcoach:course [last | a few words of the lesson's
   title | a concept] [continue]` for a [step-by-step course](../usage/courses.md). Either way Claude calls the `open_ui` / sharing tools
   from the plugin's own copy and reports the URL (default http://localhost:7860).
2. **From a terminal, without installing** — prefix any [CLI command](../usage/cli.md) with `npx -y`:
   `npx -y devcoach ui`, `npx -y devcoach stats`, …
3. **A bare `devcoach` command** — install the npm package globally (`npm install -g devcoach`) or via
   [Homebrew](./homebrew.md). Running it alongside the plugin is fine — recommended, even: both read the
   same `~/.devcoach/coaching.db`, the plugin keeps the hooks and the skill current with every release
   (a Homebrew-only install needs a manual `devcoach install` after each `brew upgrade` for that), and
   Homebrew gives you the CLI.

One rule: with the plugin, **never run `devcoach install`** — the plugin already owns the coaching hooks
and the skill, and a second registration would double-count interactions (`install` detects an enabled
plugin and skips the hooks; `devcoach doctor` flags a double registration). Likewise there is nothing
for `devcoach uninstall` to undo: removing the plugin is `/plugin uninstall devcoach@ultimaphoenix`.

## Runs locally only

devcoach is a single-user, local-first tool. All three pieces are local processes that share one
machine's home directory:

- ✅ **Claude Code** (local, or running on a remote box where the CLI process itself runs) and
  **Claude Desktop** (bundled Node). The database lives on whatever machine the agent runs on.
- ❌ **claude.ai web / hosted "remote MCP" connectors** — those require an HTTP/OAuth multi-tenant
  server. devcoach writes to a local home directory, so it cannot be a remote connector.
- ⚠️ **Ephemeral / cloud sandboxes** — coaching works while the session runs, but `~/.devcoach` is not
  persisted across runs. Use [`devcoach backup`](../usage/cli.md#backup-export--import) / `restore` to
  carry your profile between machines.

It needs **Node.js ≥ 24** (for Node's embedded `node:sqlite`) and a one-time network connection on first
use (to install the pinned `devcoach` package into the plugin's data dir); after that it runs offline.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
