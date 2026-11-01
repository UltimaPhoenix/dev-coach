# Architecture comparison — `develop` vs `feat/no-mcp` vs `feat/no-cli`

Measured on 2026-11-01 in a Linux cloud sandbox (4 vCPU), Node **v24.22.2**. The sandbox had
Node 22.23.4, so the official v24.22.2 tarball from nodejs.org was unpacked into `$HOME` and
prepended to `PATH` for every step. Commits: `develop` 14f8bb5, `feat/no-mcp` 28bd946,
`feat/no-cli` 5da46bd, each in its own worktree. Nothing was committed to those branches.

## Verdict

All three variants pass every quality gate, behave the same on the five behaviour checks, and
pass the real `claude -p` sessions once two harness problems are accounted for. The numbers do not
separate them much. **The model-facing cost is about the same** (a lesson costs roughly the same
tokens: about 0.11 USD with Sonnet 5.5 in all three, and no-mcp writes about 25 % more output
tokens because the lesson JSON goes through a Bash heredoc). **The stop hook costs about 0.15–0.2 s
per stop as a spawned process** (develop, no-mcp) against **about 2 ms as an `mcp_tool` call**
(no-cli). That is a real difference, but it is small next to a model turn of 10–30 s. What does
separate them is reach and failure behaviour. `develop` is the only one that covers every surface
(Claude Code, Claude Desktop chat, Gemini, Codex, other MCP clients). `no-mcp` drops Desktop chat
and every MCP-only client in exchange for removing the MCP wiring bugs. `no-cli` drops Gemini,
Codex, every CLI command and every way devcoach can report its own failure, to save a process per
stop. **Recommendation: keep `develop`.** If you want the main benefit of no-cli, take its hook
tools as an optional plugin feature, not a replacement for the CLI. no-mcp's `devcoach api` could
also be added as a fallback channel for the model.

---

## 1. Quality gates

| Gate | develop | no-mcp | no-cli |
|---|---|---|---|
| `npm ci` | pass (16 s) | pass (15 s) | pass (15 s) |
| `npm run lint` (Biome) | pass, 77 files | pass, 71 files | pass, 61 files |
| `npm run typecheck` | pass | pass | pass |
| `npm run test:cov`: test files / tests | pass, 20 / 372 | pass, 18 / 356 | pass, 15 / 280 |
| coverage % lines | 94.77 | 95.71 | 95.64 |
| coverage % functions | 96.79 | 97.39 | 97.05 |
| coverage % statements | 93.58 | 94.53 | 94.41 |
| coverage % branches | 83.97 | 85.90 | 85.82 |
| `test:cov` wall time | 39 s | 46 s | 25 s |
| `npm run build` | pass | pass | pass |

Build output (`dist/*.js`, tsup sizes):

| Chunk | develop | no-mcp | no-cli |
|---|---|---|---|
| `bin.js` | 769 B | 760 B | 839 B |
| hooks entry | 262 B | 283 B | — |
| CLI (`commands-*`) | 52.06 KB | 78.29 KB (incl. `api`) | — |
| MCP server (`server-*`) | 34.80 KB | — | 48.14 KB (incl. hook tools) |
| web UI (`app-*`) | 120.27 KB | 120.17 KB | 119.73 KB |
| shared chunks | 38.35 + 7.19 + 6.89 + 6.43 + 3.21 + 1.99 KB + 75 B | 38.05 + 8.42 + 7.53 + 2.59 KB + 75 B | 44.20 + 3.20 KB + 75 B |
| **files / total** | **12 / 279,026 B** | **9 / 262,519 B** | **6 / 221,577 B** |

## 2. Footprint

| Metric | develop | no-mcp | no-cli |
|---|---|---|---|
| `npm pack` tarball | 381.7 kB | 377.5 kB | 362.0 kB |
| `npm pack` unpacked / files | 1.2 MB / 47 | 1.2 MB / 44 | 1.2 MB / 41 |
| runtime packages (`npm ls --omit=dev --all`) | 7 | 5 | 6 |
| which | hono, @hono/node-server, zod, fflate, commander, @modelcontextprotocol/server + core | hono, @hono/node-server, zod, fflate, commander | hono, @hono/node-server, zod, fflate, @modelcontextprotocol/server + core |
| `src/**/*.ts` | 24 files, 11,280 lines | 26 files, 10,476 lines | 19 files, 8,461 lines |
| `tests/**/*.ts` | 21 files, 7,195 lines | 19 files, 6,838 lines | 16 files, 5,302 lines |
| tracked files (`git ls-files`) | 243 | 234 | 219 |
| `du -sh plugin` / files | 196K / 19 | 200K / 19 | 192K / 19 |
| plugin entry points | `.mcp.json`, `hooks/hooks.json` (command hooks), `scripts/launch.mjs` | `bin/devcoach` (sh shim), `hooks/hooks.json` (command hooks), `scripts/launch.mjs`; no `.mcp.json` | `.mcp.json` (+ `DEVCOACH_HOOK_TOOLS=1`), `hooks/hooks.json` (`mcp_tool` hooks), `scripts/launch.mjs` |
| other distributables | `gemini-extension/`, `mcpb/`, `server.json` | `gemini-extension/` | `mcpb/`, `server.json` |

All three plugins share the same files: `plugin.json`, LICENSE, README, `package.json`, five
commands (`course`, `import`, `setup`, `share`, `ui`), `launch.config.json`, `launch.mjs`, and a
6-file skill mirror.

## 3. What the model carries in context

| Item | develop | no-mcp | no-cli |
|---|---|---|---|
| tools over stdio (`tools/list`) | 25 tools, **34,999 B** JSON | — (no server) | 25 tools, 35,084 B. With `DEVCOACH_HOOK_TOOLS=1` (the plugin): **27 tools, 36,790 B** (+1,707 B for `hook_stop`/`hook_prompt`) |
| of which tool descriptions | 5,739 B | — | 5,827 B / 6,105 B |
| resources / prompts | 10 + 1 template / 1 | — | 10 + 1 template / 1 |
| `assets/SKILL.md` | 14,484 B | 16,188 B | 14,462 B |
| `assets/references/*.md` | 42,873 B | 44,138 B | 42,759 B |
| on-demand catalogue | `tools/list` schemas via ToolSearch | `devcoach api --json`: 20,273 B (`devcoach api` names only: 1,365 B) | as develop |

**Per-turn cost and on-demand cost.** Claude Code defers MCP tool schemas by default, so a turn
carries only the deferred tool *names*: 25 or 27 `mcp__…` names. The schemas (about 35 KB) are
loaded only when the model calls ToolSearch. Every develop and no-cli session in §6 that used
devcoach made exactly one ToolSearch call, and no no-mcp session made one. The skill's
frontmatter `description` (about 1.4 KB, byte-identical in all three) is the per-turn cost common
to all variants. `SKILL.md` and the references are on-demand (they load when the skill is
invoked). That on-demand load is about 1.7 KB larger in no-mcp, because the skill spells out the
shell commands. no-mcp's 20 KB JSON catalogue is never fetched in practice: the skill names the
operations and their inputs itself. On a client without tool search (Claude Desktop, Cursor, …),
develop and no-cli carry the full ~35 KB in every turn.

## 4. Latency and memory

5 runs each, median. RSS for spawned processes is `ru_maxrss` from `wait4` (there is no
`/usr/bin/time` in the sandbox, so a small Python `os.wait4` wrapper measured all spawned
commands the same way). For the server it is `/proc/<pid>/status` VmRSS/VmHWM. `DEVCOACH_DIR`
and `HOME` were empty temp dirs, and the cwd was a non-git temp dir. Baseline: `node -e 0` takes
54.8 ms and 43.6 MB.

**Stop-hook decision**

| | develop (`stop-hook`, spawned) | no-mcp (`stop-hook`, spawned) | no-cli (`tools/call hook_stop`) |
|---|---|---|---|
| empty `DEVCOACH_DIR` (first run creates nothing; onboarding cue) | 212.6 ms, max RSS 67.9 MB | 191.4 ms, 67.6 MB | **2.1 ms** round-trip (first call 10.3 ms) |
| warm DB, same cue | 154.7 ms, 67.7 MB | 167.8 ms, 68.4 MB | — |
| server start → `initialize` done | — | — | 333 ms (5 starts: 319–358) |
| server RSS idle / after the benchmark | — | — | 93.9 MB / 96.6 MB |

These numbers are `node dist/bin.js` straight. Under the plugin, every develop and no-mcp hook
also goes through `node plugin/scripts/launch.mjs`, which adds one Node start plus an import. That
path was not timed (see "What I could not measure").

**One model operation (`get_briefing`)**

| | develop (MCP, connected) | no-mcp (`api`, fresh process) | no-cli (MCP, connected) |
|---|---|---|---|
| round-trip | **3.2 ms** (first call 67.7 ms) | **276.2 ms**, max RSS 83.6 MB | **4.1 ms** (first 78.2 ms) |
| server start → initialize | 358 ms (326–394) | — | 333 ms |
| server RSS idle / after | 94.5 MB / 96.8 MB | — | 93.9 MB / 96.6 MB |

**A lesson save (`log_lesson`, 150-word body)**

| | develop (tools/call) | no-mcp (`api log_lesson -`, stdin) | no-cli (tools/call) |
|---|---|---|---|
| median | 25.8 ms | 294.4 ms, max RSS 84.0 MB | 28.1 ms |

The 25 ms in the MCP variants is mostly git auto-detection (spawns `git` in a non-repo cwd).
Seen from the user's side, every one of these is under 0.3 s against model turns of 10–30 s (§6).

## 5. Behaviour checks

Sandboxed `HOME` and `DEVCOACH_DIR`. Each variant was driven through its own path: develop = CLI
`stop-hook` + MCP tools; no-mcp = CLI `stop-hook` + `devcoach api`; no-cli = `hook_stop` +
MCP tools, all over one stdio server.

| Check | develop | no-mcp | no-cli |
|---|---|---|---|
| 1. no profile → stop | `block`, onboarding cue | `block`, onboarding cue | `block`, onboarding cue |
| 2. `complete_onboarding {topics:{python:4}}` + `update_settings nudge_every=0` → stop | `block`, lesson cue | `block`, lesson cue | `block`, lesson cue |
| 3a. `skip_lesson` → next stop (with `nudge_every=0`) | `block` again ⚠ | `block` again ⚠ | `block` again ⚠ |
| 3b. same with `nudge_every=2`: stop, stop, skip, stop, stop | silent, block, *skip*, **silent**, block | silent, block, *skip*, **silent**, block | silent, block, *skip*, **silent**, block |
| 4. `stop_hook_active: true` / `permission_mode: plan` | silent / silent (empty stdout) | silent / silent (empty stdout) | silent / silent (`{}`) |
| 5. `PRAGMA user_version = 99` → `log_lesson` | `isError`: "…upgraded by devcoach 2.7.1 (schema v99); this is devcoach 2.7.1 (schema v6). Reads work; writes need devcoach ≥ 2.6.0…" | `{"ok":false,…}` same text, **exit 3** | `isError`, same text |
| 5. … → stop hook / briefing `compat` | silent / `{readOnly:true, dbSchema:99, appSchema:6, …}` | silent / same | silent (`{}`) / same |

⚠ Check 3 as written ("after skip the next stop is silent") cannot hold with `nudge_every=0`.
`0` means "every turn", so the stop right after a skip reaches the threshold again and cues. That
is the documented meaning, and all three variants agree. 3b shows the skip does re-arm the
pacing. **The five behaviours are identical across variants.** The cue texts are the same apart
from the no-mcp wording about commands.

## 6. Real sessions (`claude -p`, `E2E_MODEL=claude-sonnet-5-5`)

`claude --version` gave 2.1.316, and `claude -p 'reply with the single word ok'` worked (the
sandbox is authenticated). I patched `scripts/e2e-claude.mjs` in each worktree, locally and
uncommitted, to append each `result` event's `usage`, `duration_ms`, cost and tool-call list to a
JSONL file. Times below are the `claude` session's `duration_ms`. The full script run (packing +
first install + sessions) was: smoke 88 s (develop), 119 s (no-mcp), 87 s (no-cli). Smoke ids:
develop `plugin-tree:fresh-cue, plugin-tree:lesson, mcp-entry:fresh-explicit`; no-mcp
`…, cli-entry:fresh-explicit`; no-cli `…, plugin-tree:fresh-explicit` (no-cli only has
`plugin-tree` and `plugin-market`, 12 scenarios; the other two have 24).

| Scenario | develop | no-mcp | no-cli |
|---|---|---|---|
| **fresh-cue** (plugin-tree, 2 calls) | **6/7 ❌** "server connected in the very first session": status `pending` at init, **2 of 2 runs**; onboarding still completed | 7/7 ✅ | 7/7 ✅ (`connected` at init) |
|  tokens in / out / cache-read / cache-create | 18 / 2,192 / 312,731 / 23,495 (rerun: 18 / 2,623 / 322,780 / 15,008) | 22 / 2,413 / 388,446 / 22,323 | 20 / 2,417 / 364,659 / 14,465 |
|  time, cost, tool calls | 23.8 s, $0.235, 6 (ToolSearch, get_onboarding, complete_onboarding, Bash, Read, Write) | 36.3 s, $0.240, 7 (Bash ×4, Write ×2, Read) | 31.6 s, $0.171, 6 (ToolSearch, get_onboarding, complete_onboarding, Write ×2, Read) |
| **fresh-explicit** (1 call) | mcp-entry ✅ 4/4: 18 / 2,125 / 318,409 / 13,177; 23.9 s, $0.106, 7 calls | cli-entry ✅ 4/4: 22 / 3,941 / 478,602 / 24,592; 36.8 s, $0.186, **11 calls** (Bash ×6, the model retried `complete_onboarding` from a temp file) | plugin-tree ✅ 4/4: 22 / 2,709 / 407,155 / 15,847; 31.7 s, $0.131, 9 calls |
| **lesson** (plugin-tree, 1 call), run 1 | ✅ 3/3, card landed once (1 band), 1 lesson row; 12 / 2,191 / 205,123 / 17,312; 19.9 s, $0.112; Skill, get_briefing, log_lesson ×2 | ✅ 3/3, card once; 14 / 2,792 / 251,090 / 17,869; 27.4 s, $0.125; Skill, Bash ×3, Write | ❌ harness: seeding failed before claude ran (`update_settings max_per_day 99` > the tool's cap of 20; the CLI `set` that develop's script uses accepts 99). Patched to 20 → ✅ 3/3, card once; 14 / 1,938 / 207,306 / 18,383; 22.9 s, $0.114; Skill, ToolSearch, get_briefing, log_lesson |
| **lesson**, run 2 | ✅ 3/3; 14 / 1,900 / 207,260 / 18,304; 27.2 s, $0.113; 4 calls | ✅ 3/3; 12 / 2,545 / 204,224 / 17,759; 28.4 s, $0.117; 5 calls | ✅ 3/3; 14 / 1,648 / 205,455 / 17,651; 26.7 s, $0.108; 4 calls |
| **skip** (plugin-tree) | ✅ 3/3; 12 / 463 / 191,189 / 12,386; 10.1 s, $0.073; ToolSearch, skip_lesson ×2 | ✅ 3/3; 14 / 743 / 188,500 / 22,520; 17.1 s, $0.117; Skill, Bash | ✅ 3/3; 18 / 692 / 275,509 / 11,929; 22.6 s, $0.082; ToolSearch, skip_lesson ×2, Bash |
| **plan-mode** (plugin-tree) | ✅ 3/3; 4 / 954 / 69,850 / 12,705; 11.8 s, $0.067 | ✅ 3/3; 4 / 786 / 70,270 / 11,020; 9.2 s, $0.059 | ✅ 3/3; 4 / 925 / 70,414 / 12,165; 14.0 s, $0.065 |
| totals (all checks run) | 13/14 smoke + 6/7 rerun + 9/9 extra | 13/13 smoke + 9/9 extra | 11/12 smoke (harness) + 3/3 rerun + 9/9 extra |

What this shows, with one or two samples per cell (model variance is larger than most of the
differences):

- **The lesson card landed exactly once in all six lesson sessions.** No variant lost a card or
  printed it twice.
- **develop, first session on a fresh plugin install: the MCP server is still `pending` when the
  session starts**, reproduced 2/2. The likely cause is the race the launcher's comments describe:
  the first prompt's command hook starts a detached `--install`, and the MCP start then waits on
  it. no-cli was `connected` at init. Its hooks *are* the server, and Claude Code waits for a
  connecting server within the hook timeout. Onboarding still succeeded on develop (the tools were
  there by the second turn), so the effect was visible only in the first turn's server status.
- **no-mcp spends more output tokens** per lesson (2,545–2,792 against 1,648–2,191), because the
  model has to write the lesson JSON into a shell heredoc, and the lesson body shows up as a
  shell command in the transcript. It also had the costliest onboarding (11 tool calls, a
  retried `complete_onboarding`). The cost per lesson is still within about 10 % ($0.117–0.125 vs
  $0.108–0.114).
- The develop/no-cli `skip` sessions called `skip_lesson` twice and no-cli also ran a Bash call.
  The check passed, but that is wasted work no-mcp didn't do.
- The two failures were in the sessions or the test harness, not in the products'
  coaching logic. Still, no-cli's e2e port had never run before this experiment (its
  `EXPERIMENT.md` says so), and this is the bug that turned up.

## 7. Qualitative review

**Delivering one lesson**

| | develop | no-mcp | no-cli |
|---|---|---|---|
| cue | command hook `launch.mjs stop-hook` (+ prompt-hook priming) | same command hooks | `mcp_tool` hooks → `hook_stop` / `hook_prompt` on the resident server |
| model's calls | Skill → (ToolSearch once) → `get_briefing` → `log_lesson` → card as final text | Skill → `Bash: devcoach api get_briefing` → `Bash: devcoach api log_lesson - <<'EOF' …` → card | as develop |
| where the lesson text travels | MCP tool arguments (hidden from the user by default; the card is the visible copy) | inside a Bash command, shown in the transcript as a heredoc. The user sees the body twice: in the command and in the card | as develop |
| permission rule | the MCP tools (`mcp__plugin_devcoach_devcoach__*` / `mcp__devcoach__*`) must be allowed or approved | `Bash(devcoach *)`, pre-approved by the skill's `allowed-tools` for the turn that invokes it; the docs advise adding it to settings | as develop. The hooks run outside the permission system |

**Platform coverage**

| Platform | develop | no-mcp | no-cli |
|---|---|---|---|
| Claude Code (plugin / install) | ✅ hooks + MCP | ✅ hooks + `devcoach api` | ✅ plugin; Homebrew/npm need **manual** wiring (no `install`) |
| Claude Desktop chat | ✅ `.mcpb` (tools, no hooks) | ❌ dropped | ✅ `.mcpb` |
| Claude Desktop Code tab | ✅ (is Claude Code) | ✅ | ✅ (plugin) |
| Gemini CLI (beta) | ✅ extension: hooks + MCP | ✅ extension: hooks + `DEVCOACH_COMMAND` | ❌ dropped |
| Codex CLI (beta) | ✅ hooks + MCP | ✅ hooks + shell | ❌ dropped |
| Cursor / Windsurf / other MCP | ✅ tools only | ❌ dropped | ✅ tools only |
| MCP Registry listing | ✅ | ❌ | ✅ |
| human CLI (`lessons`, `doctor`, `install`, `backup`, …) | ✅ | ✅ | ❌ (dashboard only) |

**Failure modes**

| Failure | develop | no-mcp | no-cli |
|---|---|---|---|
| server not connected | tools missing; hooks still cue, the model can't act on the cue; `doctor` explains | n/a (no server); an old 2.x MCP registration gets a hidden `mcp` stub that exits 1 with the reason, and `install` removes the registration | **hooks go quiet as well** (an `mcp_tool` hook on a dead server has nothing to say); only `/mcp` and `/devcoach:setup` step 1 show it |
| `devcoach` not on PATH | `install` writes an absolute path / npx; doctor resolves it like a spawn would | the skill falls back to `npx -y devcoach api …`; the plugin's `bin/` is on the Bash PATH; doctor checks the shell sees it | n/a under the plugin; manual wiring is on the user |
| first install still running | hooks don't wait (detached install, one `systemMessage` a day on failure); MCP start waits, so the server can be `pending` in the first turn (seen 2/2 in §6) | hooks don't wait; the first `api` call installs synchronously or exits 1 with the diagnosis on stderr | the server installs synchronously (up to 180 s); the first prompt's hook waits ≤ 30 s and the first stop's ≤ 60 s; a slower install means **no onboarding cue on that stop** |
| Node < 24 | `bin.ts` prints one sentence (hooks: silent exit 0); the launcher names it first | same | the server can't start, so the only signal is a failed MCP connect (no `systemMessage` channel) |
| DB newer than this build | `isError` + `compat`; CLI writes exit 3; hooks silent | `ok:false` + exit 3 + `compat`; hooks silent | `isError` + `compat`; hooks `{}` |

**Maintenance surface**

develop is the largest: 243 tracked files, 11.3k src / 7.2k test lines, 20 test files, two
transports. It also keeps three integration families (plugin, Gemini, `.mcpb`/Registry) plus the
Codex hook variants. no-mcp is a little smaller (234 files) and loses the MCP SDK, the `.mcpb` and
the Registry. It adds an `api` layer, the `bin/devcoach` shim with Unix-mode-preserving zips, and
`DEVCOACH_COMMAND` for Gemini, and it keeps old-registration cleanup code for migration. no-cli is
the smallest (219 files, 8.5k / 5.3k lines, 15 test files). Its docs/README/website still describe
develop. It drops `install`/`uninstall`/`doctor`, which is the tooling develop's CLAUDE.md
describes as the answer to the hosts' mute failures.

**Open questions in the branches' own docs**

- no-cli (`EXPERIMENT.md`):
  - How `${path}` substitution behaves for absent fields.
  - What the user sees when an `mcp_tool` hook times out or its server isn't connected.
  - Whether a plugin `.mcp.json` `env` is honoured. In §6 it evidently was: `hook_stop` cued, and
    it is registered only with `DEVCOACH_HOOK_TOOLS=1`.
  - Whether Claude Code kills MCP children.
  - The unrun `claude mcp add -e` syntax.
  - Docs not updated.
  - The model may call `hook_*` itself and bump the counter. Not seen in the 7 no-cli sessions.
- no-mcp: its `CLAUDE.md` / `CHANGELOG.md` / `agent-api.md` list no open questions. Implicit ones:
  - Long-term reliance on Claude Code putting a plugin's `bin/` on the Bash PATH.
  - Whether users accept `Bash(devcoach *)` prompts outside the skill's turn.
  - The 3.0.0 break for Desktop / MCP-client users.

## What I could not measure, and why

- **Hook latency through the plugin launcher** (`node launch.mjs stop-hook`, which adds a second
  Node start) needs an installed runtime in the launcher's data dir. I timed `dist/bin.js`
  directly, so the develop/no-mcp per-stop cost under the plugin is higher than in §4.
- **Idle CPU of a session** and the **user-visible effect of a hook timeout / dead server**
  (no-cli's open questions) need an interactive Claude Code session. `-p` shows neither.
- **Claude Desktop, Gemini CLI, Codex CLI, Cursor/Windsurf**: none of them is installed in the
  sandbox. Their coverage above comes from the code and docs.
- **The full grids** (`--all`, 24/24/12 scenarios) were not run, to keep the token spend
  reasonable. The smoke set plus `lesson`, `skip` and `plan-mode` ran on all three. Each cell is 1–2
  samples, so the token differences are indicative only.
- `mcp-entry` (develop) / `cli-entry` (no-mcp) has no no-cli counterpart. That variant has no
  `install` and its e2e dropped the method, so `fresh-explicit` compares different install shapes.

## Recommendation

**Keep `develop` as the architecture.** It rests on three facts:

1. **The runtime differences are under 0.3 s on a 10–30 s turn, and the token cost is within
   about 10 %.** Every coaching behaviour checked is identical, and all three delivered the card
   exactly once in every lesson session. Neither alternative buys a measurable improvement in
   what the user experiences per lesson.
2. **Each alternative gives up reach that develop has.** no-mcp loses Claude Desktop chat, every
   MCP-only client and the Registry. no-cli loses Gemini, Codex, the human CLI and
   `install`/`doctor`, and Homebrew/npm users have to wire the hooks by hand.
3. **no-cli's main gain is real but can be added to develop.** `hook_stop` answers in about 2 ms
   against 155–213 ms spawned, and the server is already `connected` in a fresh plugin's first
   session, where develop was `pending` 2/2. But making the hooks depend on the server means a dead
   server is silent everywhere. Ship `hook_stop`/`hook_prompt` behind `DEVCOACH_HOOK_TOOLS` in
   develop's plugin, keep the command hooks as the default and fallback, and consider no-mcp's
   `devcoach api` as the model's fallback channel when the server is not connected. Fix develop's
   first-session `pending` race whichever way you go.
