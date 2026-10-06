---
description: Check that devcoach is running and set up (or redo) your coaching profile
argument-hint: "[redo]"
allowed-tools: Bash(node:*), mcp__plugin_devcoach_devcoach__get_onboarding, mcp__devcoach__get_onboarding, mcp__plugin_devcoach_devcoach__complete_onboarding, mcp__devcoach__complete_onboarding, mcp__plugin_devcoach_devcoach__preview_deep_scan, mcp__devcoach__preview_deep_scan, mcp__plugin_devcoach_devcoach__get_profile, mcp__devcoach__get_profile
---

Set up devcoach, in this order, stopping at the first step that fails:

1. **Runtime.** Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs" doctor` with the Bash tool and
   read its output (if that path does not exist because the variable was left unexpanded, use the
   newest `~/.claude/plugins/cache/*/devcoach/*/scripts/launch.mjs` instead).
   If it reports that the devcoach runtime is not available (Node older than 24,
   `npm` not found, the install failed), show the user the reason line and the fix it names,
   verbatim, and stop — nothing else can work until that is fixed.
2. **Server.** If no devcoach tool (`get_onboarding`, …) is available in this session, the
   runtime is fine but the MCP server is not connected: tell the user to run `/mcp`, reconnect
   `plugin:devcoach:devcoach` (or restart Claude Code), then run `/devcoach:setup` again. Stop.
3. **Profile.** Call `get_onboarding`.
   - `knowledge_ready` or `notebook_ready` is false, or $ARGUMENTS is `redo`: follow the devcoach
     skill's `references/onboarding.md` exactly (the choice of mode is the user's — ask, lead
     with Automatic), save with `complete_onboarding`, write the notebook, show the summary.
   - both true and no `redo`: say devcoach is set up (topic count from `get_profile`), that
     lessons arrive on their own as the user works, and that `/devcoach:setup redo` rebuilds the
     profile from scratch. Do not start onboarding again.

Do not deliver a lesson in this turn. Do nothing else.
