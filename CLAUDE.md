# devcoach — CLAUDE.md

## What is this project

`devcoach` is a local MCP server (TypeScript/Node) that acts as a progressive technical coach.
It integrates with Claude Code, Claude Desktop, Gemini CLI (beta), Codex CLI (beta), and other
MCP-compatible agents via stdio transport.
Every time the agent completes a technical task, devcoach decides whether to deliver a lesson based on
the user's knowledge map, the rate limit, and what has already been taught. It also ships a CLI and a
local web dashboard. Everything is local — one SQLite file at `~/.devcoach/coaching.db`.

- Repo: https://github.com/UltimaPhoenix/dev-coach
- npm package: `devcoach`
- End-user command: `npx -y devcoach mcp` (MCP server) · `npx -y devcoach <cmd>` (CLI) · `… ui` (dashboard)

---

## Stack

- **Node.js ≥ 24** (required for the embedded `node:sqlite`), ESM, TypeScript
- **`@modelcontextprotocol/sdk`** — official MCP SDK (`McpServer`, `StdioServerTransport`)
- **`node:sqlite`** (`DatabaseSync`) — zero-dependency embedded SQLite at `~/.devcoach/coaching.db`
- **Zod** — schema validation + tool `inputSchema`/`outputSchema`
- **Hono** + `@hono/node-server` — web dashboard (server-rendered `hono/html`, vendored Tailwind/Alpine/HTMX)
- **Commander** — CLI arg parsing (`--help`, friendly errors)
- **fflate** — ZIP backup/restore
- **Biome** (lint/format) · **Vitest** (tests; coverage thresholds 92% lines / 95% functions /
  91% statements / 76% branches) · **tsup** (bundle → `dist/bin.js` + code-split chunks along the
  dynamic-import boundaries in `bin.ts`/`commands.ts`: hooks (~26 KB, every agent stop), CLI
  (~34 KB), MCP server (~20 KB, only `mcp`), web UI (~67 KB, only `ui`))

---

## Project structure

```
dev-coach/
├── package.json            # bin: devcoach → dist/bin.js; engines.node >=24; ESM
├── tsconfig.json  biome.json  vitest.config.ts  tsup.config.ts  .node-version (26)
├── assets/                 # tracked single source of truth
│   ├── SKILL.md            # coaching instructions (slim body; served as the MCP prompt)
│   ├── references/         # skill progressive disclosure: onboarding.md, calibration.md, review.md
│   └── static/             # vendored web bundle (tailwind.js, alpinejs, htmx, flatpickr, …)
├── src/
│   ├── bin.ts              # #!/usr/bin/env node → runCli()
│   ├── version.ts  skill.ts
│   ├── core/               # pure logic, no I/O coupling to mcp/cli/web
│   │   ├── models.ts       # Zod: Lesson, KnowledgeEntry/Group, Profile, Settings, RateLimitResult
│   │   ├── db.ts           # node:sqlite schema + migrations + query helpers + DEFAULT_PROFILE
│   │   ├── coach.ts        # rate limit, cue engine (evaluateCue/explainCue), profile, stats
│   │   ├── git.ts  detect.ts  prompts.ts   # prompts.ts renders the lesson card (formatLessonForDisplay)
│   │   ├── claude-history.ts   # cross-project stack scan of ~/.claude (projects map, manifests, activity, memories)
│   ├── mcp/server.ts       # McpServer: 15 tools + 11 resources + devcoach_instructions prompt
│   ├── cli/commands.ts     # Commander dispatcher (30 subcommands: 22 visible + 8 hidden hooks) + term.ts
│   └── web/app.ts          # Hono app (20 routes) + views.ts (hono/html pages)
├── tests/                  # Vitest (13 files: core, db-extra, coach/git/claude-history, mcp, web, cli,
│                           #   setup-wizard, hooks, hooks-spawn, plugin, gemini-extension, mcp-registry)
├── scripts/e2e-claude.mjs  # local-only e2e: real `claude -p` sessions (npm run test:e2e)
├── scripts/sync-plugin.mjs # pins plugin/, gemini-extension/, server.json to package.json + copies the skill
├── scripts/screenshots.mjs # Playwright capture of docs/screenshots from scripts/screenshots/fixture.zip
├── mcpb/                   # Claude Desktop Extension: manifest.json (v0.4, server.type node) + icon.png/svg
├── scripts/build-mcpb.mjs  # stage → validate → pack the .mcpb via @anthropic-ai/mcpb (--sign to self-sign)
├── plugin/                 # Claude Code plugin (pinned npm launcher + hooks + skill mirror) — synced, never hand-edited
├── gemini-extension/       # Gemini CLI extension (same launcher pattern, AfterAgent/BeforeAgent hooks) — synced
├── server.json             # MCP Registry manifest (io.github.UltimaPhoenix/devcoach) — version pinned by sync
└── docs/  website/  .github/workflows/{ci,docs,update-screenshots,cla}.yml
```

---

## Exposed MCP tools (15)

`log_lesson`, `skip_lesson`, `update_knowledge`, `get_lessons`, `star_lesson`, `delete_lesson`,
`submit_feedback`, `add_topic`, `remove_topic`, `add_group`, `remove_group`, `update_settings`,
`open_ui`, `complete_onboarding`, `preview_deep_scan`.

Every tool registers a `title` + read-only/destructive annotations, a tight Zod `inputSchema` with
`.describe()` on each param, `outputSchema`/`structuredContent` for model-shaped returns
(`Lesson`/`Profile`/`Settings`), and returns `{ isError: true, … }` with a recovery hint on failure.
`log_lesson` is a **pure save** — it never elicits — and resets the pacing counters. Inline
elicitation was removed: in the card-last flow the tool runs before the card is visible, so the
"Did that land?" dialog asked about an unseen lesson (observed live in Claude Code, which DOES
declare the elicitation capability) and the `null` fallback then printed the text prompt too,
asking twice. Feedback is the text line under the card, recorded next turn via `submit_feedback`. **Ordering is log_lesson-first, card-last**: the skill has the
model call the tool silently and write the card as the FINAL message of the turn. Card-first was
tried and empirically fails — every Claude harness teaches "text between tool calls may not be
shown; the deliverable is the final message", so models refuse the mid-turn card, bury the lesson
in the tool args, and end the turn with nothing visible (saved-but-never-shown). The result
deliberately does **not** echo the rendered card (the echo made the model re-print it after the
tool-approval pause → double card); instead the `structuredContent` carries a `reply_check`
self-check ("tool ARGUMENTS are invisible to the user … write the card as the final text") — it
must live there because Claude Code surfaces structured output to the model and drops the
plain-text content blocks. `skip_lesson` is the explicit no-op: it records
why no lesson was warranted and re-arms the pacing (clears `cue_state.pending`).
`log_lesson`'s `timestamp` is not an argument — always server-stamped with the real current time
(a model has no clock; `min_gap_minutes` depends on this being accurate). `complete_onboarding`
no longer accepts `notebook` either — it only guarantees `learning-state.md` is non-empty (a
placeholder) the instant it saves the profile; the skill writes the real notebook directly to the
path exposed by `devcoach://onboarding`/`devcoach://briefing`'s `notebook_path` field, same as
`references/calibration.md` and `references/review.md` do at their own notebook touchpoints —
there is no `update_notebook` tool. `preview_deep_scan` is a cheap, metadata-only pre-check (a
real rolling date window, not `scanClaudeHistory`'s top-N-by-recency cap) used before "Automatic
(Deep)" onboarding spawns a subagent to read real local conversation history — see `assets/
references/onboarding.md` for the full flow and its privacy tradeoff.

## MCP resources (11)

`devcoach://briefing` (**the pre-lesson read** — one call returns onboarding status, rate limit,
taught topics, profile, and the notebook; SKILL.md prescribes this single read instead of five),
`profile`, `notebook` (text/markdown — the coaching notebook),
`settings`, `lessons/recent`, `stats`, `taught-topics`, `rate-limit`, `context`,
`onboarding`, and the templated `lessons/{lesson_id}`. Each returns JSON (except `notebook`)
and never throws (returns
`{ error }` on failure). `onboarding` carries the **history-wide** `detected_stack`
(`scanClaudeHistory()` over the `~/.claude.json` projects map + depth-limited manifest walks +
`history.jsonl` activity + per-project auto-memory excerpts, merged with the cwd's
`detectStack`) plus `detected_projects` provenance (name, topics, prompt_count, last_activity,
memory) and `scanned_projects` — only the `MAX_RECENT_PROJECTS` most recently active projects
are scanned, prompt text is never read, and any failure degrades to an empty scan. Both
`onboarding` and `briefing` also carry `notebook_path` (`db.LEARNING_STATE_PATH`, resolved) so
the model can Read/Write/Edit the notebook file directly instead of passing its markdown through
a tool call.

## MCP prompt

`devcoach_instructions` returns the bundled `assets/SKILL.md` + inlined `assets/references/*.md`
(single source of truth; read at runtime by `src/skill.ts`). MCP prompts are surfaced as
user-invocable slash commands, **not** auto-injected — so coaching is driven by the hooks:

- **`stop-hook`** (Stop, one spawn per stop): onboarding check + cue engine. When a lesson is due
  it emits `{decision:"block", reason, systemMessage}` — the reason is a pure-delegation directive
  that **invokes the devcoach skill via the Skill tool** and repeats NONE of its rules (a duplicated
  copy once drifted to a flat "output NOTHING else" with no recovery clause — the card got saved but
  never printed; a test locks the cue rule-free). It carries only the notebook-checkpoint count, the
  5-line fallback for missing skills (the sole place allowed to instruct), and `skip_lesson` as the
  explicit no-op. The `systemMessage` toast is neutral ("checking whether a lesson is due…") so a
  silent skip doesn't read as a failed lesson.
- **`prompt-hook`** (UserPromptSubmit): read-only peek (`explainCue`, never bumps); when this turn's
  stop would reach the threshold it primes the model via `hookSpecificOutput.additionalContext`.
- `onboard-hook` / `lesson-ready` remain as the legacy two-entry layout; `devcoach install`
  repairs/normalizes hook entries without `--force` and skips them when the devcoach plugin is
  enabled (double registration would double-count).

The Claude Code **skill**: `devcoach install` copies `assets/SKILL.md` + `references/` to
`~/.claude/skills/devcoach/` with a `.devcoach-version` stamp; the welcome screen and `stats` hint
to re-run `install` when the installed skill is missing/outdated (e.g. after `brew upgrade`).
`devcoach doctor` diagnoses the whole wiring and explains why the next stop would(n't) cue;
`DEVCOACH_HOOK_DEBUG=1` traces every hook decision to `~/.devcoach/hook.log`.

---

## DB schema (shared `~/.devcoach/coaching.db`)

`lessons` (17 cols incl. `categories` JSON, `feedback`, `starred`, git metadata, `body`),
`knowledge` (topic, confidence 0–10, updated_at), `settings`, `knowledge_group_names`,
`knowledge_groups` (composite PK), `nudge_state` (per-session lesson-cue counter) and `cue_state`
(single row: `pending`, `last_cue_at`, `last_skip_reason` — cue lifecycle; both runtime only,
never backed up), plus 4 indexes. All DDL is `CREATE … IF NOT EXISTS` + `INSERT OR IGNORE`
(idempotent). Connections set `PRAGMA busy_timeout = 3000` (concurrent hook + MCP writers).
`DEFAULT_SETTINGS`: `max_per_day=2`, `min_gap_minutes=240`, `ui_theme=system`,
`nudge_every=10` (interactions between lesson cues; 0 = every turn), `nudge_scope=session` (count
per chat session, or `global`) — the quiet session-scoped pacing is an explicit product decision;
never raise cue frequency by default.
`DEFAULT_PROFILE` (`core/db.ts`) seeds 24 topics only via `complete_onboarding` (an empty knowledge
table reliably means onboarding hasn't run).

## Rate-limit logic (`core/coach.ts`)

1. Count lessons in the last 24h → if ≥ `max_per_day`: denied.
2. Last lesson timestamp → if elapsed < `min_gap_minutes`: denied (reason includes remaining time).
3. Otherwise allowed. Graceful: returns `allowed: true` on any error.

## Cue engine (`core/coach.ts`)

`evaluateCue(db, sessionId, {planMode})` — the Stop hook's decision, mutating: plan-mode gate
(plan turns never count nor cue) → onboarding gate → bump counter (`stop_hook_active` stops never
reach it) → threshold (`pending ? min(NUDGE_RETRY_AFTER=3, nudge_every) : nudge_every`) →
rate limit (denied stops keep accumulating) → cue: `markCuePending` (reset counters + arm retry).
Every silent exit returns a human-readable `reason` (consumed by doctor + `DEVCOACH_HOOK_DEBUG`).
`explainCue` is the read-only dry run (doctor verdict, prompt-hook priming). Resolution:
`log_lesson` → `resetNudge`; `skip_lesson` → `clearCuePending(reason)`
(both restart counters — a primed turn resolves BEFORE the Stop hook, so no block is needed).
Note: current Claude Code shows a generic "Stop hook error occurred" notice on ANY blocking Stop
hook (verified empirically) — hence priming-first design; blocks are the rare fallback.

---

## Development conventions

- **Clean Code**; match surrounding style.
- **Biome** must pass: `npm run lint` (and `npm run format` to fix). **Typecheck**: `npm run typecheck`.
- **Coverage thresholds** (`vitest.config.ts`): 92% lines · 95% functions · 91% statements · 76%
  branches — `npm run test:cov`. Do not merge below threshold.
- One-way dependency: `core/` never imports from `mcp/`, `cli/`, or `web/`.
- `db.ts` = pure query helpers; every DB access wrapped in try/catch with graceful fallback —
  **never crash the server**.
- DB/notebook paths always derived from `os.homedir()/.devcoach`, never hardcoded. Sole exceptions:
  the `DEVCOACH_DIR` env override (`core/db.ts`) for test/e2e sandboxing, and
  `DEVCOACH_CLAUDE_DIR`/`CLAUDE_CONFIG_DIR` (`core/claude-history.ts`) to relocate the
  Claude Code history the onboarding scan reads.
- `assets/` is the tracked source of truth (SKILL.md + web static) — `package.json` `files` ships it.
  `plugin/skills/` and `gemini-extension/skills/` are byte-checked mirrors: never edit them, run
  `npm run plugin:sync` (it also pins every manifest version to `package.json`).
- Prefer a Node built-in over a dependency; pin deps at latest stable.

---

## Local development & testing

```bash
npm install
npm run dev -- mcp                 # run the MCP server from source (tsx)
npm run dev -- ui                  # web dashboard from source
npm run lint && npm run typecheck && npm run test:cov
npm run build                      # tsup → dist/bin.js + code-split chunks (lean hook path)
npm run test:e2e                   # local-only: real `claude -p` sessions (sandboxed DEVCOACH_DIR)
npx @modelcontextprotocol/inspector node dist/bin.js mcp   # exercise tools/resources/prompt
node dist/bin.js --help            # CLI
node dist/bin.js doctor            # diagnose wiring + pacing (read-only)

# Sandbox mutating commands so they don't touch your real ~/.devcoach:
HOME=$(mktemp -d) node dist/bin.js stats     # or DEVCOACH_DIR=$(mktemp -d) …
```

## MCP config (Claude Code / Desktop)

```json
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

## Release

Releases are cut from the `workflow_dispatch` run of `.github/workflows/ci.yml` (patch/minor/major
or an exact version): `bump` commits + tags `v<version>`, then `publish` (`npm publish`, OIDC
trusted publishing, tokenless), `release` (GitHub Release with the self-signed `.mcpb`, the Claude
Code plugin zip, the Gemini extension zip, a CycloneDX SBOM and `SHASUMS256.txt`), `homebrew`
(regenerates `Formula/devcoach.rb` in `UltimaPhoenix/homebrew-tap`), `marketplace` (pins the entry
in `UltimaPhoenix/claude-plugins-marketplace`) and `mcp-registry`. A plain `v*` tag push runs the
same publish/release jobs. CI checks run on Node 24 and the `.node-version` (26). The `.mcpb` is
built via `npm run mcpb` (`scripts/build-mcpb.mjs` + `mcpb/manifest.json` + `icon.png`);
`npm run mcpb:sign` self-signs it (no code-signing certificate is configured — it installs as an
unverified publisher). The release run also publishes
`server.json` (root) to the official MCP Registry via `mcp-publisher login github-oidc` (job
`mcp-registry`, tokenless — ownership = repo OIDC + `mcpName` in the npm tarball);
`scripts/sync-plugin.mjs` pins `server.json`'s versions in the bump commit and
`tests/mcp-registry.test.ts` fails on drift, like the plugin/gemini-extension pins.
