---
description: Open the devcoach web dashboard
argument-hint: [port]
allowed-tools: mcp__plugin_devcoach_devcoach__open_ui, mcp__devcoach__open_ui
---

Call the devcoach `open_ui` tool to start the web dashboard: pass `port` $ARGUMENTS if the
user gave one (must be 1024-65535), otherwise call it with no arguments (default 7860).
Then tell the user the dashboard URL it reports. If the tool returns an error, relay it
and suggest `npx -y devcoach ui` as the fallback. Do nothing else.
