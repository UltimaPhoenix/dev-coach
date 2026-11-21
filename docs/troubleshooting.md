---
title: Troubleshooting
description: When devcoach does not start, does not coach, or shows an error — what each symptom means and the fix. Plus the known limitations and how to uninstall devcoach cleanly.
keywords: [devcoach troubleshooting, devcoach doctor, MCP server not connecting, Stop hook error, uninstall devcoach, devcoach limitations]
---

# Troubleshooting

import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { Card, Cards } from "@site/src/components/Cards";

Start with **`devcoach doctor`** (or `npx -y devcoach doctor`; with the Claude Code plugin,
**`/devcoach:setup`**). It checks the whole wiring and ends with a verdict on why the next stop would or
wouldn't cue a lesson.

<Tabs>
<TabItem value="wired" label="After devcoach install" default>

Everything is wired. No `devcoach` was on the PATH, so install chose `npx -y devcoach`: the `→` lines
are notes about that.

```text title="$ devcoach doctor"
devcoach doctor v2.7.1

Environment
  ✓ Node 24.22.3 via unknown (≥ 24)
  ✓ this devcoach: source (/home/user/dev-coach)

Claude Code wiring
  ✓ Stop hook wired (1 entry)
  ✓ UserPromptSubmit priming hook wired
  → hook runs via npx — needs the npx cache (or network) on every stop
  → hook runs via npx — needs the npx cache (or network) on every stop
  ✓ Claude Code skill installed (current version)
  ✓ MCP server registered (user scope)
  → starts via `npx -y devcoach` — needs the npx cache (or the network) at every start

Claude Desktop
  ✓ registered: npx -y devcoach mcp
  → starts via `npx -y devcoach` — needs the npx cache (or the network) at every start

Database & pacing
  ✓ database opens (~/.devcoach/coaching.db)
  ✓ schema v6, last upgraded by devcoach 2.7.1
  ✓ onboarding complete
    settings: max_per_day=2 · min_gap_minutes=240 · nudge_every=10 · nudge_scope=session
    pacing: 0 session(s) counted, 0 interaction(s) total
  ✓ rate limit: allowed

Verdict
  → the next eligible stop would NOT cue a lesson:
      · pacing: next stop would be 1/10
      · rate limit: allowed
```

</TabItem>
<TabItem value="not-wired" label="Before devcoach install">

The same machine before `devcoach install`: the hooks, the skill and the MCP entry are missing.

```text title="$ devcoach doctor"
devcoach doctor v2.7.1

Environment
  ✓ Node 24.22.3 via unknown (≥ 24)
  ✓ this devcoach: source (/home/user/dev-coach)

Claude Code wiring
  ✗ no devcoach hooks in ~/.claude/settings.json — run devcoach install
  → Claude Code skill not installed — run devcoach install
  → MCP server not found in ~/.claude.json — it may be registered elsewhere (check with claude mcp get devcoach)

Database & pacing
  ✓ database opens (~/.devcoach/coaching.db)
  ✓ schema v6, last upgraded by devcoach 2.7.1
  ✓ onboarding complete
    settings: max_per_day=2 · min_gap_minutes=240 · nudge_every=10 · nudge_scope=session
    pacing: 0 session(s) counted, 0 interaction(s) total
  ✓ rate limit: allowed

Verdict
  → the next eligible stop would NOT cue a lesson:
      · pacing: next stop would be 1/10
      · rate limit: allowed
```

</TabItem>
</Tabs>

`✓` passed, `→` is a warning, `✗` is broken. Warnings and failures say what is wrong, and most name
the fix.

## Find your symptom {/* #symptoms */}

<Cards columns={3}>
  <Card label="Setup" title="Node version error" to="#node-version-error">
    devcoach needs Node.js 24 or newer.
  </Card>
  <Card label="Plugin install" title="Failed to install plugin … invalid manifest" to="#invalid-manifest">
    An old plugin release that current Claude Code rejects.
  </Card>
  <Card label="Connection" title="MCP server not connecting" to="#mcp-server-not-connecting">
    The agent cannot start devcoach. One fix with the plugin, one without.
  </Card>
  <Card label="Coaching" title="No lessons appear" to="#no-lessons">
    Pacing, the rate limit or the wiring: `doctor` says which.
  </Card>
  <Card label="Claude Code notice" title="Stop hook error occurred" to="#stop-hook-error">
    Harmless: Claude Code's label for a lesson cue.
  </Card>
  <Card label="Database" title="SQLite permission error" to="#sqlite-permission-error">
    devcoach cannot write to `~/.devcoach`.
  </Card>
</Cards>

## "Node version error"

Check your version, and upgrade if it is below 24:

```bash
node --version      # below 24? upgrade:
brew upgrade node   # Homebrew
nvm install 24      # if using nvm
```

devcoach requires Node.js ≥ 24: it uses the SQLite built into Node (`node:sqlite`).

## "Failed to install plugin devcoach@ultimaphoenix: … invalid manifest … repository: expected string" {/* #invalid-manifest */}

Refresh the marketplace so it points at the latest release, then install again:

```bash
/plugin marketplace update ultimaphoenix
/plugin install devcoach@ultimaphoenix
```

Plugin releases up to 1.0.1 shipped a manifest that current Claude Code rejects, so the install stopped
before copying anything.

## "MCP server not connecting"

<Tabs>
<TabItem value="plugin" label="With the plugin" default>

Claude Code shows `plugin:devcoach:devcoach failed to connect`.

1. Run **`/devcoach:setup`**. Its first step prints the reason and the fix:
   - Node older than 24
   - `npm` not on the PATH
   - no network on the first run
2. Apply the fix, then reconnect from `/mcp`.

Do **not** run `devcoach install` for a plugin. Details:
[plugin troubleshooting](./install/claude-code-plugin.md#troubleshooting).

</TabItem>
<TabItem value="no-plugin" label="Without the plugin">

For npm and Homebrew installs, and Claude Desktop.

1. Run **`devcoach doctor`**. It checks the command each agent starts (Claude Desktop's from
   `claude_desktop_config.json`, Claude Code's from `~/.claude.json`):
   - that it exists on the PATH that agent uses
   - that the Node it names exists and is ≥ 24
   - which devcoach version it runs
2. Run `devcoach install --force`: it re-registers devcoach with an absolute command.
3. Restart the agent.

In Claude Desktop's log (`~/Library/Logs/Claude/mcp-server-devcoach.log`):

- `Failed to spawn process: No such file or directory` means devcoach never ran: the command, or the
  Node behind it, is missing. See
  [When devcoach does not start](./install/claude-desktop.md#when-devcoach-does-not-start).
- Every devcoach start writes one line to that log with its version, Node and install location.

</TabItem>
</Tabs>

## "Coaching isn't firing / no lessons appear" {/* #no-lessons */}

1. Run **`devcoach doctor`** and read the **Verdict** at the end: it explains exactly why the next stop
   would or wouldn't cue a lesson.
2. Fix any `✗` or `→` line above it.
3. If the verdict names the pacing or the rate limit, that is by design.

:::note[Quiet on purpose]
Pacing is intentionally quiet: with the defaults a lesson is cued only after `nudge_every` interactions
in a session, and within the rate limits. To change the pace, see
[Staying unobtrusive](./usage/coaching.md#staying-unobtrusive).
:::

### What `doctor` checks

| Section | What it checks |
|---|---|
| **Environment** | The Node version |
| **Claude Code wiring** | The skill, the MCP registration and the hook entries in `~/.claude/settings.json` |
| **Claude Desktop** | The command Claude Desktop starts ([more](#mcp-server-not-connecting)) |
| **Gemini CLI wiring**, **Codex CLI wiring** | When present: the hook entries in `~/.gemini/settings.json` and `~/.codex/hooks.json` |
| **Database & pacing** | The database, the pacing counters, the rate limit |
| **Verdict** | Why the next stop would or wouldn't cue a lesson |

### Trace every hook run {/* #hook-trace */}

For a live trace, set `DEVCOACH_HOOK_DEBUG=1` and watch `~/.devcoach/hook.log`: every hook run appends
one line with its decision. One session on the demo data:

```text title="~/.devcoach/hook.log"
2026-11-21T23:32:47.045Z prompt-hook 0bfef42a no prime
2026-11-21T23:32:47.206Z stop-hook 0bfef42a course in progress — cues paused
2026-11-21T23:32:47.951Z prompt-hook 0bfef42a no prime
2026-11-21T23:32:48.076Z stop-hook 0bfef42a paced (1/10)
…
2026-11-21T23:32:48.513Z stop-hook 0bfef42a paced (3/10)
…
2026-11-21T23:32:49.894Z prompt-hook 0bfef42a priming
2026-11-21T23:32:50.023Z stop-hook 0bfef42a cue (10/10)
2026-11-21T23:32:50.472Z stop-hook 0bfef42a hook-forced continuation
…
2026-11-21T23:32:52.658Z prompt-hook 0bfef42a no prime
2026-11-21T23:32:52.785Z stop-hook 0bfef42a rate limited: Too soon: last lesson 0m ago, minimum interval is 4h 0m (3h 59m remaining)
```

| Decision | What it means |
|---|---|
| `course in progress — cues paused` | A [course](./usage/courses.md#what-happens-next) is active. Cues pause, without counting, until it is completed or abandoned |
| `paced (3/10)` | This stop counted: 3 of the `nudge_every` interactions before the next cue |
| `priming` · `no prime` | Checked when you send a prompt: would this turn's stop cue a lesson? If so, the agent is told up front, so the lesson can land inside the reply |
| `cue (10/10)` | The Stop hook asks for the lesson. With priming in place this is the fallback, for a turn that ended without one (see [below](#stop-hook-error)) |
| `hook-forced continuation` | The extra turn a cue starts. It is never counted |
| `rate limited: …` | The threshold is reached, but `max_per_day` or `min_gap_minutes` says not yet. Stops keep counting, so the lesson comes at the first allowed stop |

:::note[Other agents]
Hooks exist for Claude Code, Gemini CLI *(beta)*, and Codex CLI *(beta)*. Other agents (Cursor,
Windsurf, Cline) don't support them: there, coaching is available on demand via MCP tools or manual
prompting.
:::

## "Stop hook error occurred" next to a lesson {/* #stop-hook-error */}

**Nothing to fix: it's harmless.** That notice is Claude Code's current labeling of *any* Stop hook
that blocks, including devcoach's lesson cue. The line that comes with it,
`🎓 devcoach: checking whether a lesson is due…`, tells you it's coaching, not a failure.

By design it's also rare: the UserPromptSubmit priming hook delivers most lessons within the turn, so
the blocking fallback only fires when that didn't happen. In a [hook trace](#hook-trace) it is the
`cue (…)` line.

## "SQLite permission error"

```bash
ls -ld ~/.devcoach    # does it exist, and do you have write access?
devcoach install      # if it's missing: initializes it (or: devcoach setup)
```

devcoach writes to `~/.devcoach/coaching.db`, so the directory must exist and be writable by you.

---

## Known limitations

| Where | What happens | What you can do |
|---|---|---|
| **claude.ai web** | MCP servers are not supported | Use the [skill copy](./install/claude-ai.md) (coaching behaviour only, no data storage) |
| **Ephemeral sandboxes** | If your agent runs in a fresh sandbox on each restart (like GitHub Codespaces), devcoach cannot persist data across sessions: lessons won't carry over | It works fine for the current session |
| **Windows** | Supported since 2.8.0 (Beta); every release is installed, connected and uninstalled on a Windows runner by CI. Gemini CLI and Codex CLI hooks on Windows are untested | Install through the [one-line installer or Scoop](./install/windows.md) |
| **Multi-user machines** | devcoach writes to `~/.devcoach/`, so each user gets their own coaching database. Profiles are not shared | Nothing to set up |

---

## Uninstalling

One command undoes everything `devcoach install` wired up: the MCP registration, the hook entries and
the skill, for Claude Code and Claude Desktop (add `--gemini`, `--codex` or `--all` for the beta
agents). Your coaching data stays unless you ask for it to go.

:::warning[Run `devcoach uninstall` first]
Run `devcoach uninstall` **before** `brew uninstall` / `npm uninstall`: Homebrew formulae have no
uninstall hook, and once the binary is gone the hooks left in `~/.claude/settings.json` would error on
every turn.
:::

```bash
devcoach uninstall                 # remove MCP server + hooks + skill (Claude Code + Claude Desktop)
devcoach uninstall --all --data    # every agent, and delete ~/.devcoach (asks first; devcoach backup before)
npm uninstall -g devcoach          # then remove the program (npx: nothing to remove)
brew uninstall devcoach            # or, via Homebrew (brew untap UltimaPhoenix/tap to drop the tap)
```

Using the Claude Code plugin instead? `/plugin uninstall devcoach` removes its hooks, skill and server
in one go.
