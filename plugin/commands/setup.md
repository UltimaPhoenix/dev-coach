---
description: Check that devcoach is running and set up (or redo) your coaching profile
argument-hint: "[redo]"
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs *), Bash(devcoach *)
---

Set up devcoach, in this order, stopping at the first step that fails:

1. **Runtime.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" doctor` with the Bash tool and
   read its output (if that path does not exist because the variable was left unexpanded, use the
   newest `~/.claude/plugins/cache/*/devcoach/*/scripts/launch.mjs` instead).
   If it reports that the devcoach runtime is not available (Node older than 24,
   `npm` not found, the install failed), show the user the reason line and the fix it names,
   verbatim, and stop — nothing else can work until that is fixed.
2. **Command.** Run `devcoach api get_onboarding` with the Bash tool — the plugin puts `devcoach`
   on the shell's PATH, and this is how the coaching skill talks to devcoach. If the shell cannot
   find `devcoach`, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" api get_onboarding`
   instead and use that form for every devcoach command below. If that fails too, show the user
   the error and stop.
3. **Profile.** Read the `result` of that call.
   - `knowledge_ready` or `notebook_ready` is false, or $ARGUMENTS is `redo`: follow the devcoach
     skill's `references/onboarding.md` exactly (the choice of mode is the user's — ask, lead
     with Automatic), save with `devcoach api complete_onboarding -` (the JSON on stdin), write
     the notebook, show the summary.
   - both true and no `redo`: say devcoach is set up (topic count from `devcoach api get_profile`),
     that lessons arrive on their own as the user works, and that `/devcoach:setup redo` rebuilds
     the profile from scratch. Do not start onboarding again.

Do not deliver a lesson in this turn. Do nothing else.
