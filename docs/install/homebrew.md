---
title: Homebrew
---

# Homebrew (macOS / Linux)

:::tip[Recommended for developers]
If you work in a terminal, this is the best fit: a single `brew install` sets up devcoach **and** the
`devcoach` CLI, so the [command line](../usage/cli.md) and `devcoach ui` work directly (no `npx` prefix).
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
formulae when `HOMEBREW_REQUIRE_TAP_TRUST` is set. Both are one-time. Update later with
`brew upgrade devcoach` — then re-run `devcoach install` to refresh the skill (`devcoach stats`
reminds you when it's out of date).

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
