---
title: Homebrew
---

# Homebrew (macOS / Linux)

:::tip[Recommended for developers]
If you work in a terminal, this is the best fit: a single `brew install` sets up devcoach **and** the
`devcoach` CLI, so the [command line](../usage/cli.md) and `devcoach ui` work directly (no `npx` prefix).
:::

:::info[Homebrew and the Claude Code plugin go well together]
Using Claude Code? The [plugin](./claude-code-plugin.md) is the better home for the **coaching wiring**
(MCP server, hooks, skill): Claude Code updates all three automatically with each release, while a
Homebrew install refreshes only the binary — after every `brew upgrade devcoach` you must re-run
`devcoach install` yourself to update the hooks and the skill. The nicest setup is therefore **plugin +
Homebrew**: the plugin does the coaching and stays current on its own; Homebrew adds the bare
`devcoach` CLI for the dashboard and your data from a terminal (`devcoach ui`, `stats`, `share`,
`backup`, …). In that setup skip step 4 below — never run `devcoach install` next to the plugin.
:::

devcoach ships from its own tap. Add and trust the repository once, install, then connect:

```bash
# 1. Add the tap — registers github.com/UltimaPhoenix/homebrew-tap with Homebrew
brew tap UltimaPhoenix/tap

# 2. Trust the whole tap — required when Homebrew enforces HOMEBREW_REQUIRE_TAP_TRUST
brew trust --tap UltimaPhoenix/tap

# 3. Install
brew install devcoach

# 4. Connect (Homebrew puts `devcoach` on your PATH — no npx prefix needed)
devcoach install
```

`devcoach install` registers the MCP server, the automatic-coaching hooks (Stop + UserPromptSubmit),
and the coaching **skill** (`~/.claude/skills/devcoach/`) with Claude Code, plus the MCP server with
Claude Desktop.

`brew tap` registers the third-party repository; `brew trust --tap` marks it trusted so Homebrew loads its
formulae when `HOMEBREW_REQUIRE_TAP_TRUST` is set. Both are one-time.

## Updating

```bash
brew upgrade devcoach
devcoach install        # only if you connected with devcoach install (not with the plugin)
```

Homebrew replaces the binary but knows nothing about your agents: the hook entries and the skill copy
that `devcoach install` wrote stay at the old version until you run it again (it refreshes them in
place, no `--force` needed, and `devcoach stats` / `devcoach doctor` remind you when the skill is out of
date). This manual step is exactly what the [Claude Code plugin](./claude-code-plugin.md) does for you
automatically — one more reason to let the plugin own the coaching wiring and keep Homebrew for the CLI.

Prefer a one-liner? `brew install UltimaPhoenix/tap/devcoach` taps and installs in one go — run
`brew trust --tap UltimaPhoenix/tap` first if your Homebrew enforces tap trust.

devcoach requires **Node.js ≥ 24**; the formula depends on Homebrew's `node` (`depends_on "node"`), so
`brew install` pulls in a current Node automatically — no separate Node setup needed.

## Uninstall

Homebrew formulae have no uninstall hook, so `brew uninstall` cannot undo what `devcoach install` wired
into your agents' config files. Run devcoach's own uninstaller first, then remove the package:

```bash
devcoach uninstall                 # MCP server + hooks + skill (Claude Code + Claude Desktop; --all for every agent)
devcoach uninstall --data          # optional: also delete ~/.devcoach (lessons, profile, notebook) — asks first
brew uninstall devcoach
brew untap UltimaPhoenix/tap       # optional: drop the tap too
```

`brew info devcoach` prints the same reminder. If you skipped it and the hooks now error on every turn
(`devcoach: command not found`), reinstall, run `devcoach uninstall`, then uninstall again.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
