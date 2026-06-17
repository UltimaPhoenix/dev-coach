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
- **Biome** (lint/format) · **Vitest** (tests, ≥80% line coverage) · **tsup** (bundle → `dist/bin.js`)

---

## Project structure

```
dev-coach/
├── package.json            # bin: devcoach → dist/bin.js; engines.node >=24; ESM
├── tsconfig.json  biome.json  vitest.config.ts  tsup.config.ts  .node-version (26)
├── assets/                 # tracked single source of truth
│   ├── SKILL.md            # coaching instructions (served as the MCP prompt)
│   └── static/             # vendored web bundle (tailwind.js, alpinejs, htmx, flatpickr, …)
├── src/
│   ├── bin.ts              # #!/usr/bin/env node → runCli()
│   ├── version.ts  skill.ts
│   ├── core/               # pure logic, no I/O coupling to mcp/cli/web
│   │   ├── models.ts       # Zod: Lesson, KnowledgeEntry/Group, Profile, Settings, RateLimitResult
│   │   ├── db.ts           # node:sqlite schema + migrations + query helpers + DEFAULT_PROFILE
│   │   ├── coach.ts        # rate limit, profile, knowledge deltas, stats
│   │   ├── git.ts  detect.ts  prompts.ts
│   ├── mcp/server.ts       # McpServer: 13 tools + 9 resources + devcoach_instructions prompt
│   ├── cli/commands.ts     # Commander dispatcher (23 subcommands) + term.ts (styled output)
│   └── web/app.ts          # Hono app (19 routes) + views.ts (hono/html pages)
├── tests/                  # Vitest (core, mcp, web, cli, setup-wizard)
├── mcpb/                   # Claude Desktop Extension: manifest.json (v0.4, server.type node) + icon.png/svg
├── scripts/build-mcpb.mjs  # stage → validate → pack the .mcpb via @anthropic-ai/mcpb (--sign to self-sign)
└── docs/  .github/workflows/ci.yml
```

---

## Exposed MCP tools (13)

`log_lesson`, `update_knowledge`, `get_lessons`, `star_lesson`, `delete_lesson`, `submit_feedback`,
`add_topic`, `remove_topic`, `add_group`, `remove_group`, `update_settings`, `open_ui`, `complete_onboarding`.

Every tool registers a `title` + read-only/destructive annotations, a tight Zod `inputSchema` with
`.describe()` on each param, `outputSchema`/`structuredContent` for model-shaped returns
(`Lesson`/`Profile`/`Settings`), and returns `{ isError: true, … }` with a recovery hint on failure.
`log_lesson` elicits inline feedback, capability-gated on `getClientCapabilities()?.elicitation`.

## MCP resources (9)

`devcoach://profile`, `settings`, `lessons/recent`, `stats`, `taught-topics`, `rate-limit`, `context`,
`onboarding`, and the templated `lessons/{lesson_id}`. Each returns JSON and never throws (returns
`{ error }` on failure).

## MCP prompt

`devcoach_instructions` returns the bundled `assets/SKILL.md` (the single source of truth; read at
runtime by `src/skill.ts`). Clients that support MCP prompts load it automatically.

---

## DB schema (shared `~/.devcoach/coaching.db`)

`lessons` (16 cols incl. `categories` JSON, `feedback`, `starred`, git metadata, `body`),
`knowledge` (topic, confidence 0–10, updated_at), `settings`, `knowledge_group_names`,
`knowledge_groups` (composite PK), plus 4 indexes. All DDL is `CREATE … IF NOT EXISTS` + `INSERT OR
IGNORE` (idempotent). `DEFAULT_SETTINGS`: `max_per_day=2`, `min_gap_minutes=240`, `ui_theme=system`.
`DEFAULT_PROFILE` (`core/db.ts`) seeds 24 topics only via `complete_onboarding` (an empty knowledge
table reliably means onboarding hasn't run).

## Rate-limit logic (`core/coach.ts`)

1. Count lessons in the last 24h → if ≥ `max_per_day`: denied.
2. Last lesson timestamp → if elapsed < `min_gap_minutes`: denied (reason includes remaining time).
3. Otherwise allowed. Graceful: returns `allowed: true` on any error.

---

## Development conventions

- **Clean Code**; match surrounding style.
- **Biome** must pass: `npm run lint` (and `npm run format` to fix). **Typecheck**: `npm run typecheck`.
- **Coverage ≥ 80% lines**: `npm run test:cov`. Do not merge below threshold.
- One-way dependency: `core/` never imports from `mcp/`, `cli/`, or `web/`.
- `db.ts` = pure query helpers; every DB access wrapped in try/catch with graceful fallback —
  **never crash the server**.
- DB/notebook paths always derived from `os.homedir()/.devcoach`, never hardcoded.
- `assets/` is the tracked source of truth (SKILL.md + web static) — `package.json` `files` ships it.
- Prefer a Node built-in over a dependency; pin deps at latest stable.

---

## Local development & testing

```bash
npm install
npm run dev -- mcp                 # run the MCP server from source (tsx)
npm run dev -- ui                  # web dashboard from source
npm run lint && npm run typecheck && npm run test:cov
npm run build                      # tsup → dist/bin.js
npx @modelcontextprotocol/inspector node dist/bin.js mcp   # exercise tools/resources/prompt
node dist/bin.js --help            # CLI

# Sandbox mutating commands so they don't touch your real ~/.devcoach:
HOME=$(mktemp -d) node dist/bin.js stats
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
