---
title: npx / npm CLI
sidebar_label: npx / npm CLI
---

# npx / npm CLI

No install required — `npx` runs devcoach on demand. For **Claude Code**, one command wires up
automatic lesson delivery (the Stop and UserPromptSubmit hooks) and installs the coaching **skill**
into `~/.claude/skills/devcoach/`:

```bash
npx -y devcoach install
```

Restart your agent afterward. Prefer a global binary? `npm install -g devcoach`, then run `devcoach install`
(and drop the `npx -y` prefix everywhere). After upgrading devcoach, re-run `devcoach install` to refresh
the skill — `devcoach stats` reminds you when it's out of date.

Run through `npx`, `install` writes the hooks as `npx -y devcoach …` (npx's own copy is temporary), and
the skill falls back to `npx -y devcoach api …` whenever `devcoach` is not on Claude's PATH. With a
global install the hooks get devcoach's **absolute path**, so an agent with a shorter PATH than your
shell still finds it, and the skill runs the bare `devcoach` command.

:::note[nvm, fnm, volta, asdf, mise]
With a Node version manager, `npm install -g` puts devcoach inside the current Node version's directory
(`~/.nvm/versions/node/v26.5.0/…`). It goes away with that version: after switching or removing it, run
`devcoach install --force` again. `install` and `devcoach doctor` both say which Node version it depends on.
:::

**Canary builds:** every change merged into the `develop` branch is published to npm under the `next`
tag — `npx -y devcoach@next` (or `npm install -g devcoach@next`) runs the unreleased version, documented at
[ultimaphoenix.github.io/dev-coach/next](https://ultimaphoenix.github.io/dev-coach/next/). `latest` stays the
last release.

## Manual setup (Claude Code)

If `devcoach install` isn't available, wire it up yourself. Add the hooks to `~/.claude/settings.json`
for automatic lesson delivery (skip this if you used the [plugin](./claude-code-plugin.md) — it
already provides them). `stop-hook` decides after each turn whether a lesson is due; `prompt-hook`
primes the model up front when one is:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach stop-hook", "timeout": 60 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "npx -y devcoach prompt-hook", "timeout": 30 }] }
    ]
  }
}
```

If devcoach is installed globally, prefer its absolute path over `npx -y devcoach` (no npx cache or
network needed at hook time) — `devcoach install` picks the best command automatically, and repairs
older two-entry layouts. Then copy the skill — `assets/SKILL.md` and `assets/references/` from the
npm package — into `~/.claude/skills/devcoach/`. Run `devcoach doctor` to verify the wiring.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
