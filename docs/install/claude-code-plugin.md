# Claude Code plugin

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

### C — offline (download from a release)

Download `devcoach-plugin-<version>.zip` from the [GitHub Releases](https://github.com/UltimaPhoenix/dev-coach/releases),
unzip it, then point Claude Code at the unzipped folder:

```bash
/plugin marketplace add /path/to/unzipped-folder
/plugin install devcoach@devcoach
```

## How it works

When you enable the plugin, Claude Code wires in its three component files:

1. **`.mcp.json`** → Claude Code launches the MCP server locally as a stdio process
   (`npx -y devcoach mcp`). It opens `~/.devcoach/coaching.db` (SQLite), derived from your home
   directory.
2. **`hooks/hooks.json`** → after every turn, Claude Code runs the two `Stop` hooks (also local
   `npx -y devcoach` processes). They read the same database and either stay silent or nudge the agent
   to run onboarding / deliver a lesson. This is what makes coaching automatic.
3. **`skills/devcoach/SKILL.md`** → the coaching playbook, auto-loaded so the agent knows *how* to
   teach when a hook fires.

## Running the CLI & web dashboard

The plugin gives Claude Code everything it needs to coach you, but it does **not** put the `devcoach`
**CLI** on your `PATH` — it runs the MCP server internally via `npx`. So to open the
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

It needs **Node.js ≥ 24** (for Node's embedded `node:sqlite`), since the plugin runs the published
`devcoach` npm package via `npx`.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
