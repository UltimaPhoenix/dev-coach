---
description: Open the devcoach web dashboard (or stop it: /devcoach:ui stop)
argument-hint: [port] | stop [port]
allowed-tools: Bash(devcoach *)
---

If $ARGUMENTS starts with `stop`: run `devcoach api stop_ui` with the Bash tool (with
`'{"port":N}'` when a port follows `stop`, otherwise no input → 7860) and relay its one-line
result; if nothing was running (`result.stopped` is false), say so. Otherwise run
`devcoach api open_ui` to start the web dashboard: pass `'{"port":N}'` if the user gave a port
(must be 1024-65535), otherwise no input (default 7860). Then tell the user the dashboard URL in
`result.url` and that `/devcoach:ui stop` shuts it down. If the command answers `ok: false`,
relay the error and suggest `npx -y devcoach ui` as the fallback. Do nothing else.
