# devcoach — CLAUDE.md

## What is this project

`devcoach` is a local MCP server (TypeScript/Node) that acts as a progressive technical coach.
It integrates with Claude Code, Claude Desktop, and other MCP-compatible agents via stdio transport.
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
- **Biome** (lint/format) · **Vitest** (tests, ≥80% line coverage) · **tsup** (bundle → `dist/bin.js`
  + code-split chunks along the dynamic-import boundaries in `bin.ts`/`commands.ts`: hooks (~30 KB,
  every agent stop), CLI (~27 KB), MCP server (~20 KB, only `mcp`), web UI (~65 KB, only `ui`))

---

## Project structure

```
dev-coach/
├── package.json            # bin: devcoach → dist/bin.js; engines.node >=24; ESM
├── tsconfig.json  biome.json  vitest.config.ts  tsup.config.ts  .node-version (26)
├── assets/                 # tracked single source of truth
│   ├── SKILL.md            # coaching instructions (slim body; served as the MCP prompt)
│   ├── references/         # skill progressive disclosure: onboarding.md, calibration.md
│   └── static/             # vendored web bundle (tailwind.js, alpinejs, htmx, flatpickr, …)
├── src/
│   ├── bin.ts              # #!/usr/bin/env node → runCli()
│   ├── version.ts  skill.ts
│   ├── core/               # pure logic, no I/O coupling to mcp/cli/web
│   │   ├── models.ts       # Zod: Lesson, KnowledgeEntry/Group, Profile, Settings, RateLimitResult
│   │   ├── db.ts           # node:sqlite schema + migrations + query helpers + DEFAULT_PROFILE
│   │   ├── coach.ts        # rate limit, cue engine (evaluateCue/explainCue), profile, stats
│   │   ├── git.ts  detect.ts  prompts.ts   # prompts.ts renders the lesson card (formatLessonForDisplay)
│   ├── mcp/server.ts       # McpServer: 15 tools + 11 resources + devcoach_instructions prompt
│   ├── cli/commands.ts     # Commander dispatcher (26 subcommands incl. doctor + hooks) + term.ts
│   └── web/app.ts          # Hono app (19 routes) + views.ts (hono/html pages)
├── tests/                  # Vitest (core, mcp, web, cli, setup-wizard, hooks-spawn)
├── scripts/e2e-claude.mjs  # local-only e2e: real `claude -p` sessions (npm run test:e2e)
├── mcpb/                   # Claude Desktop Extension: manifest.json (v0.4, server.type node) + icon.png/svg
├── scripts/build-mcpb.mjs  # stage → validate → pack the .mcpb via @anthropic-ai/mcpb (--sign to self-sign)
└── docs/  .github/workflows/ci.yml
```

---

## Exposed MCP tools (15)

`log_lesson`, `skip_lesson`, `update_knowledge`, `get_lessons`, `star_lesson`, `delete_lesson`,
`submit_feedback`, `add_topic`, `remove_topic`, `add_group`, `remove_group`, `update_settings`,
`open_ui`, `complete_onboarding`, `update_notebook`.

Every tool registers a `title` + read-only/destructive annotations, a tight Zod `inputSchema` with
`.describe()` on each param, `outputSchema`/`structuredContent` for model-shaped returns
(`Lesson`/`Profile`/`Settings`), and returns `{ isError: true, … }` with a recovery hint on failure.
`log_lesson` elicits inline feedback (capability-gated on `getClientCapabilities()?.elicitation`)
and resets the pacing counters. Its result deliberately does **not** echo the rendered card (the
echo made the model re-print it after the tool-approval pause → double card); a logged-but-invisible
card is recovered by the stop-hook, which renders it from the DB (`formatLessonForDisplay`).
`skip_lesson` is the explicit no-op: it records
why no lesson was warranted and re-arms the pacing (clears `cue_state.pending`).

## MCP resources (11)

`devcoach://briefing` (**the pre-lesson read** — one call returns onboarding status, rate limit,
taught topics, profile, and the notebook; SKILL.md prescribes this single read instead of five),
`profile`, `notebook` (text/markdown — the coaching notebook),
`settings`, `lessons/recent`, `stats`, `taught-topics`, `rate-limit`, `context`,
`onboarding`, and the templated `lessons/{lesson_id}`. Each returns JSON (except `notebook`)
and never throws (returns
`{ error }` on failure).

## MCP prompt

`devcoach_instructions` returns the bundled `assets/SKILL.md` + inlined `assets/references/*.md`
(single source of truth; read at runtime by `src/skill.ts`). MCP prompts are surfaced as
user-invocable slash commands, **not** auto-injected — so coaching is driven by the hooks:

- **`stop-hook`** (Stop, one spawn per stop): onboarding check + cue engine. When a lesson is due
  it emits `{decision:"block", reason, systemMessage}` — the reason is a compact directive that
  **invokes the devcoach skill via the Skill tool** (SKILL.md owns the full flow; a 5-line fallback
  covers missing skills) and offers `skip_lesson` as the explicit no-op.
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

`lessons` (16 cols incl. `categories` JSON, `feedback`, `starred`, git metadata, `body`),
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
`log_lesson` → `resetNudge` + `markDisplayPending`; `skip_lesson` → `clearCuePending(reason)`
(both restart counters — a primed turn resolves BEFORE the Stop hook, so no block is needed).
Card recovery: the stop after `log_lesson` consumes `display_pending` and, when the turn
(final message + transcript scan) lacks the `🎓 devcoach` band, blocks ONCE — the block
embeds the card rendered from the DB, so the model just prints it.
Note: current Claude Code shows a generic "Stop hook error occurred" notice on ANY blocking Stop
hook (verified empirically) — hence priming-first design; blocks are the rare fallback.

---

## Development conventions

- **Clean Code**; match surrounding style.
- **Biome** must pass: `npm run lint` (and `npm run format` to fix). **Typecheck**: `npm run typecheck`.
- **Coverage ≥ 80% lines**: `npm run test:cov`. Do not merge below threshold.
- One-way dependency: `core/` never imports from `mcp/`, `cli/`, or `web/`.
- `db.ts` = pure query helpers; every DB access wrapped in try/catch with graceful fallback —
  **never crash the server**.
- DB/notebook paths always derived from `os.homedir()/.devcoach`, never hardcoded. Sole exception:
  the `DEVCOACH_DIR` env override (`core/db.ts`) for test/e2e sandboxing.
- `assets/` is the tracked source of truth (SKILL.md + web static) — `package.json` `files` ships it.
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
{ "mcpServers": { "devcoach": { "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

## Release

Tag `v*` → CI (`.github/workflows/ci.yml`) lints, type-checks, tests on Node 24 & 26, builds, and
`npm publish --provenance` (OIDC, tokenless). A Node `.mcpb` for Claude Desktop is built via
`npm run mcpb` (`scripts/build-mcpb.mjs` + `mcpb/manifest.json` + `icon.png`); `npm run mcpb:sign`
self-signs it. On a `v*` tag, CI builds, signs (with the `MCPB_CERT`/`MCPB_KEY` secrets if present,
else self-signed), and attaches the `.mcpb` to the GitHub Release.
