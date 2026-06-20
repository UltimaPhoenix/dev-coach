# Claude Code plugin

:::warning Beta
The Claude Code plugin and marketplace are currently in beta. They work well for most users, but report
any issues to [GitHub Issues](https://github.com/UltimaPhoenix/dev-coach/issues). For the most stable
experience, use [Homebrew](./homebrew.md) or [npm/npx](./npx.md).
:::

:::tip Recommended if you'd rather not use a terminal
This is the simplest way to add devcoach to Claude Code — one click, nothing to configure. (Prefer the
terminal and want the `devcoach` CLI too? Use [Homebrew](./homebrew.md) instead.)
:::

devcoach ships as a **Claude Code plugin** that bundles everything in one install:

- the **MCP server** (13 tools, 9 resources, the `devcoach_instructions` prompt),
- the two automatic-coaching **Stop hooks** (`onboard-hook`, `lesson-ready`), and
- the coaching **skill** (`SKILL.md`).

With the plugin you do **not** need to run `devcoach install` — installing both would register the
Stop hooks twice. Pick one.

## Install

### A — straight from this repo

```bash
/plugin marketplace add UltimaPhoenix/dev-coach
/plugin install devcoach@devcoach
```

### B — from the marketplace (add once, install any plugin)

```bash
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

Adding the marketplace once gives you every UltimaPhoenix plugin; update later with
`/plugin marketplace update`.

## About the personal marketplace

The **UltimaPhoenix marketplace** (`UltimaPhoenix/claude-plugins-marketplace`) is a curated collection of plugins maintained by the devcoach author. It includes:

- **devcoach** — the primary tool (what you're installing)
- **Other plugins** — additional utilities and tools (available as they're added)

**Why use it?** If you plan to use multiple plugins from this source, add the marketplace once and you can install any of them without needing to add each repo individually. When a new plugin is released, it's immediately available in your Claude Code plugin menu.

**How to update:** If you've already added the marketplace, get the latest versions of all plugins:

```bash
/plugin marketplace update
```

This updates your local plugin registry without reinstalling — only new versions are fetched if they've been updated since you last added the marketplace.

**Switching methods:** If you added devcoach straight from the repo (`UltimaPhoenix/dev-coach`) and later want to switch to the marketplace, remove the old one and add the marketplace:

```bash
/plugin marketplace remove UltimaPhoenix/dev-coach
/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace
/plugin install devcoach@ultimaphoenix
```

### C — offline (download from a release)

Download `devcoach-plugin-<version>.zip` from the [GitHub Releases](https://github.com/UltimaPhoenix/dev-coach/releases),
unzip it, then point Claude Code at the unzipped folder:

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
2. **`hooks/hooks.json`** → after every turn, Claude Code runs the two `Stop` hooks through the same
   launcher. They read the same database and either stay silent or nudge the agent to run onboarding /
   deliver a lesson. This is what makes coaching automatic — and with no `npx` per fire, it's snappy.
3. **`skills/devcoach/SKILL.md`** → the coaching playbook, auto-loaded so the agent knows *how* to
   teach when a hook fires.

## Running the CLI & web dashboard

The plugin gives Claude Code everything it needs to coach you, but it keeps devcoach inside its own data
dir — it does **not** put the `devcoach` **CLI** on your `PATH`. So to open the
[web dashboard](../usage/web-ui.md) or use any [CLI command](../usage/cli.md), prefix it with `npx -y`:

```bash
npx -y devcoach ui        # open the web dashboard
npx -y devcoach stats     # any other command works the same way
```

Prefer a bare `devcoach` command? Install the npm package globally (`npm install -g devcoach`) or via
[Homebrew](./homebrew.md) — running it alongside the plugin is fine. The plugin owns the coaching hooks;
the global binary just adds the CLI.

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
