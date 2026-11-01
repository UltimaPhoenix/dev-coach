---
title: Troubleshooting
description: When devcoach does not start, does not coach, or shows an error — what each symptom means and the fix. Plus the known limitations and how to uninstall devcoach cleanly.
keywords: [devcoach troubleshooting, devcoach doctor, devcoach command not found, Stop hook error, uninstall devcoach, devcoach limitations]
---

# Troubleshooting

Start with **`devcoach doctor`** (or `npx -y devcoach doctor`; with the Claude Code plugin,
**`/devcoach:setup`**). It checks the whole wiring and ends with a verdict on why the next stop would or
wouldn't cue a lesson.

## "Node version error"

devcoach requires Node.js ≥ 24. Check your version: `node --version`. If you're below 24, upgrade: `brew upgrade node` (Homebrew) or `nvm install 24` (if using nvm).

## "Failed to install plugin devcoach@ultimaphoenix: … invalid manifest … repository: expected string"

Plugin releases up to 1.0.1 shipped a manifest that current Claude Code rejects, so the install stopped before copying anything. Refresh the marketplace so it points at the latest release, then install again:

```bash
/plugin marketplace update ultimaphoenix
/plugin install devcoach@ultimaphoenix
```

## "devcoach: command not found" — the skill cannot run devcoach

*With the Claude Code plugin*: run **`/devcoach:setup`** — its first step prints the reason (Node older than 24, `npm` not on the PATH, no network on the first run) and the fix. Do **not** run `devcoach install` for a plugin. Details: [plugin troubleshooting](./install/claude-code-plugin.md#troubleshooting).

*Without the plugin* (npm / Homebrew): run **`devcoach doctor`**: it checks that the `devcoach` command resolves in your shell (the skill runs `devcoach api …` in the agent's shell, and falls back to `npx -y devcoach` when it cannot find it) and that the hook entries in `~/.claude/settings.json` point at a devcoach that exists. Then `devcoach install` repairs the hooks and the skill. Upgraded from 2.x and your agent's log still shows an MCP server failing to start? devcoach no longer runs as one: `devcoach install` removes the old registration (`devcoach doctor` points at it).

## "Coaching isn't firing / no lessons appear"

Run **`devcoach doctor`** — it checks the whole wiring (Node version, hook entries in `~/.claude/settings.json` — plus `~/.gemini/settings.json` and `~/.codex/hooks.json` when present — skill, the `devcoach` command, database, pacing counters, rate limit) and ends with a verdict explaining exactly why the next stop would or wouldn't cue a lesson. Remember that pacing is intentionally quiet: with the defaults a lesson is cued only after `nudge_every` interactions in a session and within the rate limits — that's by design, not a bug. For a live trace, set `DEVCOACH_HOOK_DEBUG=1` and watch `~/.devcoach/hook.log`: every hook run appends one line with its decision (`paced (3/10)`, `rate limited: …`, `cue`). Hooks exist for Claude Code, Gemini CLI *(beta)*, and Codex CLI *(beta)* — the agents devcoach supports.

## "Stop hook error occurred" next to a lesson

That notice is Claude Code's current labeling of *any* Stop hook that blocks — including devcoach's lesson cue (the accompanying "🎓 devcoach…" line tells you it's coaching, not a failure). It's harmless, and by design it's also rare: the UserPromptSubmit priming hook delivers most lessons within the turn, so the blocking fallback only fires when that didn't happen.

## "SQLite permission error"

devcoach writes to `~/.devcoach/coaching.db`. If you get a permission error, check the directory exists and you have write access: `ls -ld ~/.devcoach`. If missing, run `devcoach install` or `devcoach setup` to initialize it.

---

## Known limitations

- **claude.ai web:** nothing there can run devcoach. You can use the [skill copy](./install/claude-ai.md) (coaching behaviour only, no data storage).
- **Ephemeral sandboxes:** If your agent runs in a fresh sandbox on each restart (like GitHub Codespaces), devcoach cannot persist data across sessions. It works fine for the current session, but lessons won't carry over.
- **Windows:** devcoach is tested on macOS and Linux. Windows support depends on Node.js ≥ 24 and `node:sqlite` availability (generally solid, but report issues).
- **Multi-user machines:** devcoach writes to `~/.devcoach/`, so each user gets their own coaching database. Profiles are not shared.

---

## Uninstalling

One command undoes everything `devcoach install` wired up — the hook entries, the skill, and any MCP registration a 2.x devcoach wrote — for Claude Code (add `--gemini`, `--codex` or `--all` for the beta agents). Your coaching data stays unless you ask for it to go:

```bash
devcoach uninstall                 # remove hooks + skill (Claude Code)
devcoach uninstall --all --data    # every agent, and delete ~/.devcoach (asks first; devcoach backup before)
npm uninstall -g devcoach          # then remove the program (npx: nothing to remove)
brew uninstall devcoach            # or, via Homebrew (brew untap UltimaPhoenix/tap to drop the tap)
```

Run `devcoach uninstall` **before** `brew uninstall` / `npm uninstall`: Homebrew formulae have no uninstall hook, and once the binary is gone the hooks left in `~/.claude/settings.json` would error on every turn. Using the Claude Code plugin instead? `/plugin uninstall devcoach` removes its hooks, skill and command in one go.
