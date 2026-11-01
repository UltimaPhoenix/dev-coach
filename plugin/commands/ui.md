---
description: Open the devcoach web dashboard (or stop it: /devcoach:ui stop)
argument-hint: [port] | stop [port]
allowed-tools: mcp__plugin_devcoach_devcoach__open_ui, mcp__devcoach__open_ui, mcp__plugin_devcoach_devcoach__stop_ui, mcp__devcoach__stop_ui
---

If $ARGUMENTS starts with `stop`: call the devcoach `stop_ui` tool (pass `port` when one follows
`stop`, otherwise no arguments → 7860) and relay its one-line result; if nothing was running, say so.
Otherwise call the devcoach `open_ui` tool to start the web dashboard: pass `port` $ARGUMENTS if the
user gave one (must be 1024-65535), otherwise call it with no arguments (default 7860). Then tell the
user the dashboard URL it reports, that `/devcoach:ui stop` shuts it down and that it also stops
when the session ends. If the tool returns an error, relay it verbatim (a busy port → suggest
`/devcoach:ui <other port>`). Do nothing else.
