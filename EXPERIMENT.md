# Experiment: `feat/no-cli` — MCP only, hooks as `mcp_tool` calls

One of three installable variants built to compare designs:

| Branch         | Server | CLI | Hooks                                                      |
| -------------- | ------ | --- | ---------------------------------------------------------- |
| `develop`      | MCP    | yes | `command` hooks spawn `devcoach stop-hook` / `prompt-hook` |
| `feat/no-mcp`  | none   | yes | `command` hooks call the CLI; no MCP server                |
| `feat/no-cli`  | MCP    | no  | `mcp_tool` hooks call the server's own tools; no process   |

This branch is the mirror image of `feat/no-mcp`: devcoach is **only** an MCP server. Claude
Code's Stop and UserPromptSubmit hooks are `mcp_tool` entries that call two tools on the
already-connected server (`hook_stop`, `hook_prompt`), so a stop never spawns a process. The
decision logic is the same code as before (`evaluateCue`, `explainCue`, the onboarding cue, the
plan-mode and `stop_hook_active` suppression, `DEVCOACH_HOOK_DEBUG` logging) and the cue/prime
texts are byte-identical; only the delivery changed.

## What changed

**Hook tools** (`src/mcp/server.ts`, decisions in `src/core/hook-decision.ts`). `hook_stop` and
`hook_prompt` are registered by `createServer()` only when `DEVCOACH_HOOK_TOOLS=1` is set — the
plugin's `.mcp.json` sets it; a Claude Desktop install or a hand-written MCP entry without it never
lists them. Input: `{ session_id?, stop_hook_active?, permission_mode? }`, every value accepted
as the string an `mcp_tool` entry substitutes (`"true"`/`"false"`); an empty value or a literal
unfilled `${…}` placeholder reads as absent. Output: ONE text block holding the JSON Claude Code
expects from a hook — for Stop `{"decision":"block","reason":"…","systemMessage":"…"}` or `{}`,
for UserPromptSubmit `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"…"}}`
or `{}`. Never `isError`, never a throw: any failure (broken database, database newer than this
build) is the silent `{}`, exactly as the command hooks exited 0. Titles "Internal: Stop hook" /
"Internal: prompt hook"; the description tells the model never to call them.

**The plugin** (`plugin/`). `hooks/hooks.json` is two `mcp_tool` entries (below). `.mcp.json`
starts the server through the launcher as before and adds `"env": {"DEVCOACH_HOOK_TOOLS": "1"}`.
The launcher (`assets/launcher/launch.mjs`, mirrored into `plugin/scripts/`) lost its hook modes:
the only thing it ever starts is the server (`mcp`, also the default), `doctor` installs what is
missing and prints the diagnosis (what `/devcoach:setup` step 1 reads), `--install` installs only.
The atomic install (npm in a temp dir renamed into place), the wait on a concurrent install, the
diagnosis on stderr + exit 1 are unchanged. Gone with the hook modes: the background install, the
once-a-day `systemMessage` notice (`install-failed.json`, `notice.stamp`), `hookNotice`/`setupHint`
in `launch.config.json`.

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "mcp_tool",
            "server": "plugin:devcoach:devcoach",
            "tool": "hook_stop",
            "input": {
              "session_id": "${session_id}",
              "stop_hook_active": "${stop_hook_active}",
              "permission_mode": "${permission_mode}"
            },
            "timeout": 60
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "mcp_tool",
            "server": "plugin:devcoach:devcoach",
            "tool": "hook_prompt",
            "input": {
              "session_id": "${session_id}",
              "stop_hook_active": "${stop_hook_active}",
              "permission_mode": "${permission_mode}"
            },
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

**No CLI.** `src/cli/` is deleted (`commands.ts`, `install.ts`, `mcp-command.ts`, `term.ts`,
`open.ts`, `hooks.ts`) and `commander` with it. `src/bin.ts` keeps the Node ≥ 24 guard and then
always starts the MCP server over stdio; the only arguments it honours are `--version` and
`--help` (the `mcp` the `.mcpb` manifest and `server.json` still pass is ignored). `open_ui`
starts the Hono dashboard **in the server's process** (`startUi(port, { handleSignals: false })`)
and answers with the URL once it listens — or with the reason it could not (another process on the
port, a privileged port); `stop_ui` still goes through `POST /shutdown`, so the dashboard's own
Stop button and the tool close the same server. When the host closes the server's stdin, the
server closes every dashboard it started and exits. The dashboard's output goes to stderr (stdout
is the protocol). Backup and restore live on in the dashboard (Settings → Backup & Restore).

**Dropped**: the whole CLI (`profile`, `lessons`, `lesson`, `courses`, `course`, `star`,
`unstar`, `delete`, `feedback`, `share`, `import`, `settings`, `stats`, `set`, `knowledge-*`,
`group-*`, `backup`, `restore`, `install`, `uninstall`, `doctor`, `ui`, `setup`, the eight hidden
hook subcommands); the Gemini CLI extension (`gemini-extension/`, `scripts/build-gemini-extension.mjs`,
the `gemini:zip` script, its CI zip and its tests) and the Codex hook variants — both are
command-hook integrations and this variant has no command to run; `devcoach doctor`'s Claude
Desktop log analysis (`cli/mcp-command.ts`, `tests/fixtures/claude-desktop-mcp-devcoach.log`);
the skill's install stamp hints (there is no `devcoach install` to re-run).

**Kept as they are**: the 25 model-facing tools, 11 resources and the prompt; the `.mcpb`
(Claude Desktop — no hooks there, as before); `server.json`; the Homebrew formula generator (its
caveats now describe the manual wiring); the plugin commands (`/devcoach:setup` still runs
`launch.mjs doctor` through Bash first; `/devcoach:ui` no longer suggests `npx -y devcoach ui`);
the skill — two passages changed: `stop_ui` no longer mentions a terminal-started dashboard, and
onboarding's *Import backup* goes through the dashboard's restore form instead of `restore` (CLI);
the "how to change it later" list lost its CLI bullet.

**Scripts and CI**: `scripts/sync-plugin.mjs` syncs the plugin only; `scripts/e2e-claude.mjs`
keeps the `plugin-tree` and `plugin-market` methods (the `mcp-entry` and `homebrew` methods wired
command hooks) and seeds through MCP tool calls over a short stdio session instead of CLI
commands — ported, `node --check`ed, **not run** (needs a real `claude` login and spends tokens);
`scripts/screenshots.mjs` opens the dashboard through `open_ui` and restores the fixture through
the dashboard's form (that POST path was exercised in the sandbox smoke; the Playwright run was
not). `ci.yml` drops the Gemini zip steps and assets; everything else is as it was.

## How to install it

**Claude Code plugin** — the install path. From this branch's checkout:
`claude --plugin-dir plugin`, or the self-marketplace (`/plugin marketplace add <repo dir>` then
`/plugin install devcoach@devcoach`). The plugin's `.mcp.json` sets `DEVCOACH_HOOK_TOOLS=1` and
its `hooks.json` targets `plugin:devcoach:devcoach`. On a plain Claude Code session nothing else
is needed; `/devcoach:setup` runs the runtime check and onboarding.

**Homebrew / npm** — manual wiring (there is no `devcoach install`):

1. Register the server with the hook tools on:
   `claude mcp add --scope user -e DEVCOACH_HOOK_TOOLS=1 devcoach -- devcoach`
   (`-- npx -y devcoach` for an npx install).
2. Add the two hook entries above to `~/.claude/settings.json`, with `"server": "devcoach"`
   instead of `"plugin:devcoach:devcoach"`.
3. Copy the skill: `assets/SKILL.md` + `assets/references/` from the installed package
   (`$(brew --prefix)/lib/node_modules/devcoach/assets/`, or `npm root -g`) to
   `~/.claude/skills/devcoach/`.

Undo by hand: `claude mcp remove devcoach`, delete the two hook entries and
`~/.claude/skills/devcoach`, and `~/.devcoach` if the data should go too.

**Claude Desktop** — the `.mcpb`, unchanged (`npm run mcpb`). No hooks, so no hook tools.

## What to watch in the comparison

- **No process per stop.** A command hook paid a Node start plus the launcher's import on every
  stop and every prompt; here the hook is one tool call on a server that is already up. Compare
  the stop latency and the CPU of an idle session between the three branches.
- **The server must be connected for a hook to work.** Claude Code waits for a connecting server
  within the hook's timeout (60 s on Stop, 30 s on UserPromptSubmit). On a **fresh plugin
  install** the launcher's `npm install` runs synchronously inside the server start (up to 180 s):
  the first prompt's `hook_prompt` call waits up to 30 s and the first stop's `hook_stop` up to
  60 s. If the install is slower than that, that first stop gets no onboarding cue; the next stop
  does, once the server is up. In the `develop` design the hook never waited (it started the
  install detached and let the prompt go). Watch what the user sees during that window.
- **No voice when the server cannot start.** A command hook could print one `systemMessage` a
  day ("devcoach is not running: …"). An `mcp_tool` hook on a server that failed to connect has
  nothing to print: the only signals are the `/mcp` panel and `/devcoach:setup` step 1 (the
  launcher's `doctor`). Node < 24 or a missing `npm` are therefore quieter failures here.
- **The dashboard dies with the session.** `open_ui` runs the dashboard in the session's server
  process; closing Claude Code (stdin EOF) closes it, and the server process exits (verified in
  the sandbox smoke). On `develop` it was a detached child that outlived the session. Two
  concurrent sessions are two servers: the second `open_ui` on the same port reports the first
  dashboard ("already running"), and `stop_ui` from either session stops it (HTTP, as before).
- **Two more tools in the model's list.** `hook_stop` and `hook_prompt` are visible to the model
  (27 tools under the plugin). Their descriptions say never to call them; watch for a model that
  does anyway (a stray `hook_stop` call bumps the pacing counter like a real stop).
- **String arguments.** `${stop_hook_active}` and `${permission_mode}` arrive as strings. Run a
  session with `DEVCOACH_HOOK_DEBUG=1` and read `~/.devcoach/hook.log`: a `hook_stop` line with
  `-` as the session id means `${session_id}` did not substitute as expected.
- **Blocking is unchanged.** The cue still arrives as `decision: "block"`, so the generic
  "Stop hook error occurred" notice Claude Code shows on any blocking Stop hook is still there;
  the prompt-stage priming is still the primary channel.

## Open questions

- How Claude Code substitutes a `${path}` the event does not carry: an empty string, the literal
  placeholder, or the field dropped? `parseHookInput` treats all three as absent, unverified in a
  real session.
- What the user sees when an `mcp_tool` hook times out or its server is not connected (silent?
  a toast? the generic hook error?). Not verifiable without a real session.
- Whether a plugin's `.mcp.json` `env` is honoured for plugin-bundled servers (it is documented
  for MCP server config in general; the tests only lock the file's shape).
- Whether Claude Code also kills its MCP child processes on exit, or only closes the pipes. The
  server handles the EOF case itself (closes dashboards, exits), so either way is fine.
- The `claude mcp add` flag for env (`-e KEY=value`) in the manual wiring was written from the
  CLI's documented syntax, not run.
- `docs/`, `README.md` and the website still describe the `develop` design (CLI commands,
  `devcoach install`, Gemini/Codex). They were left alone on purpose: the branch is for the
  comparison, not for release.

## Verification (2026-11-01)

`npm run format`, `npm run lint`, `npm run typecheck`: clean. `npm run test:cov`: 15 files,
280 tests, coverage 95.64 % lines / 97.05 % functions / 94.37 % statements / 85.72 % branches
(thresholds unchanged: 92 / 95 / 91 / 76). `npm run build`: `bin.js` 839 B, server chunk 48 KB,
dashboard chunk 120 KB, shared core chunk 44 KB. `npm run plugin:sync`: no drift.
`node scripts/build-mcpb.mjs`: self-contained, `--help` + MCP handshake OK, packed.
`npx @anthropic-ai/claude-code@latest plugin validate plugin --strict`: passed (icon warning as
before). Sandbox smoke (`DEVCOACH_DIR=$(mktemp -d) DEVCOACH_HOOK_TOOLS=1 node dist/bin.js` over
stdio): 27 tools; `hook_stop` on an empty database → the onboarding cue JSON (`decision: "block"`),
no database created; `hook_prompt` → `{}`; plan mode → `{}`; `open_ui` → `/ping` ok; the fixture
restored through `POST /settings/import` (303, 6 lessons); `stop_ui` → port free; closing stdin on
a session with an open dashboard → the server exits and the dashboard is gone.
