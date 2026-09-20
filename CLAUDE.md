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
- **`@modelcontextprotocol/server`** — official MCP TypeScript SDK **v2** (`McpServer`, `ResourceTemplate`;
  `StdioServerTransport` from `@modelcontextprotocol/server/stdio`); `@modelcontextprotocol/client` is a
  dev dependency for the in-memory tests only. Runtime dependency tree: 7 packages (the v1 monolith
  dragged in ~90 — express, ajv, jose, …)
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
├── tsconfig.json  biome.json  vitest.config.ts  tsup.config.ts  tsup.mcpb.config.ts  .node-version (26)
├── assets/                 # tracked single source of truth
│   ├── SKILL.md            # coaching instructions (slim body; served as the MCP prompt)
│   ├── references/         # skill progressive disclosure: onboarding.md, calibration.md, review.md, sharing.md, course.md
│   └── static/             # vendored web bundle (tailwind.js, alpinejs, htmx, flatpickr, …)
├── src/
│   ├── bin.ts              # #!/usr/bin/env node → runCli()
│   ├── version.ts  skill.ts
│   ├── core/               # pure logic, no I/O coupling to mcp/cli/web
│   │   ├── models.ts       # Zod: Lesson, KnowledgeEntry/Group, Profile, Settings, RateLimitResult
│   │   ├── db.ts           # node:sqlite schema + migrations + query helpers + DEFAULT_PROFILE
│   │   ├── coach.ts        # rate limit, cue engine (evaluateCue/explainCue), profile, stats
│   │   ├── git.ts  detect.ts  prompts.ts   # prompts.ts renders the lesson card (formatLessonForDisplay)
│   │   ├── share.ts  share-fetch.ts   # lesson sharing: payload, code/link/.devcoach.md codecs, parseSharedInput; URL fetch
│   │   ├── claude-history.ts   # cross-project stack scan of ~/.claude (projects map, manifests, activity, memories)
│   │   ├── courses.ts      # courses: directory + document validation over the db.ts rows (see Courses below)
│   ├── mcp/server.ts       # McpServer: 25 tools + 11 resources + devcoach_instructions prompt
│   ├── cli/commands.ts     # Commander dispatcher (35 subcommands: 27 visible + 8 hidden hooks) + term.ts (colours, tables, OSC 8 link()) + open.ts (browser)
│   └── web/app.ts          # Hono app (33 routes incl. POST /shutdown) + views.ts (hono/html pages); assets/static/share.js
│                           #   startUi returns the server; SIGINT/SIGTERM/SIGHUP → gracefulShutdown (close, 2 s drain, exit);
│                           #   the open_ui child is detached, so stop_ui / `ui --stop` POST /shutdown (same-origin guarded)
├── tests/                  # Vitest (16 files: core, db-extra, coach/git/claude-history, share, mcp, mcpb, web,
│                           #   cli, setup-wizard, hooks, hooks-spawn, plugin, gemini-extension, mcp-registry, …)
├── website/src/pages/lesson.tsx  # the share link's landing page (+ src/lib/shareCode.ts: browser decoder)
├── scripts/e2e-claude.mjs  # local-only e2e: real `claude -p` sessions (npm run test:e2e)
├── scripts/sync-plugin.mjs # pins plugin/, gemini-extension/, server.json + self-marketplace to package.json; copies the skill + LICENSE
├── scripts/marketplace-entry.mjs # the devcoach marketplace entry, derived from plugin.json (+ category/tags); used by update-marketplace.mjs
├── scripts/screenshots.mjs # Playwright capture of docs/screenshots from scripts/screenshots/fixture.zip
├── mcpb/                   # Claude Desktop Extension: manifest.json (v0.4, server.type node) + icon.png/svg
├── scripts/build-mcpb.mjs  # self-contained bundle (tsup.mcpb.config.ts, deps inlined) → guards (no bare imports;
│                           #   CLI + MCP initialize from outside the repo) → validate → pack via @anthropic-ai/mcpb
├── plugin/                 # Claude Code plugin (pinned npm launcher + hooks + /devcoach:ui, /devcoach:share, /devcoach:import commands + skill mirror — skills/ synced, never hand-edited)
├── gemini-extension/       # Gemini CLI extension (same launcher pattern, AfterAgent/BeforeAgent hooks) — synced
├── server.json             # MCP Registry manifest (io.github.UltimaPhoenix/devcoach) — version pinned by sync
└── docs/  website/  .github/workflows/{ci,docs,update-screenshots,cla}.yml
```

---

## Exposed MCP tools (25)

`log_lesson`, `skip_lesson`, `update_knowledge`, `get_lessons`, `star_lesson`, `delete_lesson`,
`submit_feedback`, `add_topic`, `remove_topic`, `add_group`, `remove_group`, `update_settings`,
`open_ui`, `complete_onboarding`, `preview_deep_scan`, `get_briefing`, `get_onboarding`, `get_profile`,
`share_lesson`, `import_lesson`, `stop_ui`, `create_course`, `add_course_step`,
`update_course_progress`, `get_courses`.

**Feedback** (`submit_feedback`) has three answers: `know` = already knew it (the only one that moves
confidence: +1 entering, −1 leaving), `understood` = new and clear (no change), `dont_know` = couldn't
follow this session (no change; the lesson is a course seed). `coach.recordFeedback` is the single
writer (one transaction, idempotent) for MCP, CLI and the dashboard. Schema v4 rewrote pre-existing
`dont_know` rows to `understood` once (gated on the stored `user_version`).

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

**The skill reads state through the `get_briefing` / `get_onboarding` / `get_profile` tools**, built
from the same payload builders as the resources (`profilePayload`/`briefingPayload`/`onboardingPayload`
in `mcp/server.ts`): tool names resolve in every client, whereas a resource read needs the
client-specific server name (`plugin:devcoach:devcoach` under the plugin vs `devcoach` as a plain MCP
entry) — a model once guessed `devcoach` under the plugin and the read failed. Resources stay for
clients that browse them; never hardcode a server name in the skill.

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
`devcoach uninstall` is the exact inverse of `install` (MCP registration, devcoach-owned hook
entries, skill dirs; user hooks untouched; `--data` wipes `~/.devcoach` after a prompt) — it exists
because Homebrew formulae have no uninstall hook, so the formula's `caveats` tell users to run it before
`brew uninstall`. `devcoach doctor` diagnoses the whole wiring and explains why the next stop would(n't) cue;
`DEVCOACH_HOOK_DEBUG=1` traces every hook decision to `~/.devcoach/hook.log`.

---

## DB schema (shared `~/.devcoach/coaching.db`)

`lessons` (19 cols incl. `categories` JSON, `feedback`, `starred`, git metadata, `body`,
`imported` + `shared_by`), `courses` + `course_steps` (schema v5, see Courses below),
`knowledge` (topic, confidence 0–10, updated_at), `settings`, `knowledge_group_names`,
`knowledge_groups` (composite PK), `nudge_state` (per-session lesson-cue counter) and `cue_state`
(single row: `pending`, `last_cue_at`, `last_skip_reason` — cue lifecycle; both runtime only,
never backed up), plus 6 indexes (incl. the unique `(course_id, anchor)` on `course_steps`). All DDL is `CREATE … IF NOT EXISTS` + `INSERT OR IGNORE`
(idempotent). Connections set `PRAGMA busy_timeout = 3000` (concurrent hook + MCP writers).
`DEFAULT_SETTINGS`: `max_per_day=2`, `min_gap_minutes=240`, `ui_theme=system`, `ui_home=auto` (`/` → `/lessons` once a lesson exists, else `/knowledge`), `share_name=""`,
`nudge_every=10` (interactions between lesson cues; 0 = every turn), `nudge_scope=session` (count
per chat session, or `global`) — the quiet session-scoped pacing is an explicit product decision;
never raise cue frequency by default.
`DEFAULT_PROFILE` (`core/db.ts`) seeds 24 topics only via `complete_onboarding` (an empty knowledge
table reliably means onboarding hasn't run).

## Courses (`core/courses.ts`, `references/course.md`)

A course is ONE rich, self-contained HTML document the model writes itself at
`~/.devcoach/courses/<id>/index.html` (`COURSES_DIR`; the notebook precedent — no tool carries
HTML), indexed by `courses` (id = `slugify(title, "course")`, `lesson_id` seed, `prerequisites` JSON
from the Q&A, status active|completed|abandoned) and `course_steps` (one row per `<section id=anchor>`,
status todo|done|skipped). `core/courses.ts` owns every path check: ids match `^[a-z0-9-]+$` before any
filesystem access, `courseDocument(id)` re-validates on every read (under the course dir, regular
file, no symlink, ≤ 2 MB), `addStep` refuses an anchor the document does not contain. Backups carry
`courses.json` + `courses/<id>/index.html`; restore whitelists entry names and never overwrites.
Tools: `create_course` (returns `course_dir`, `document_path`, `seed_context`, a `reply_check` that
has the model write the file), `add_course_step`, `update_course_progress`, `get_courses`.
Dashboard: `/courses`, `/courses/:id` (steps + `<iframe sandbox="allow-scripts allow-forms">`),
`/courses/:id/index.html` served under `Content-Security-Policy: sandbox …; default-src 'none';
script-src 'unsafe-inline' 'unsafe-eval'; form-action 'none'; base-uri 'none'; frame-ancestors
'self'` so a top-level open is as confined as the frame — course HTML is never inlined or
DOMPurify'd; `eval` is allowed on purpose so editable JS examples run (the sandbox leaves it
nothing to reach). The document shows **one step at a time** (its own `nav.steps` + hash routing,
per the contract in `references/course.md`; `<title>` is short and the tokens/dark-mode rules make
the same file publishable as a Claude artifact — an offer the skill makes once, nothing stored).
The server appends `assets/static/course-frame.js` to every served document (sets `data-embedded`,
which hides the in-document menu, and `postMessage`s height + current anchor); the page's
`assets/static/course-viewer.js` grows the frame so the **page** scrolls, keeps the pinned step list
in sync and turns step clicks into a hash change on the frame (no reload). The skill flow
(`references/course.md`) is user-initiated, never starts inside a cued turn, finds a seed lesson
from a few words of its title (`get_lessons` `search`, several matches → a pick), explores
prerequisites one question per message as Yes / Roughly / No choices, asks pick-type checks as
choices and typed ones as text, keeps code in the seed's language (only JS-family code gets a real
runner; the rest get simulations / predict-the-output / spot-the-bug), and **both hooks pause
lesson cues while a course is active** (`db.hasActiveCourse`, no counter bump). `/devcoach:course`
is the plugin command.

## Rate-limit logic (`core/coach.ts`)

1. Count lessons in the last 24h → if ≥ `max_per_day`: denied.
2. Last lesson timestamp → if elapsed < `min_gap_minutes`: denied (reason includes remaining time).
3. Otherwise allowed. Graceful: returns `allowed: true` on any error.

Both steps count **own lessons only** (`imported = 0`): a shared lesson never uses the daily budget,
never starts the gap (`getLastLessonTimestamp`), and never resets the pacing (`log_lesson` alone does).

## Lesson sharing (`core/share.ts`, `core/share-fetch.ts`)

One payload (`SharedLessonSchema`: format `devcoach.lesson`, version 1, the lesson minus every local
path, `origin {id, timestamp}`, `shared_by`, `shared_at`, `app_version`), three encodings of it:
the **code** `devcoach:lesson:1:<base64url(raw deflate JSON)>` (`encodeShareCode`/`decodeShareCode`,
fflate level 9 — decodable in a browser with `DecompressionStream("deflate-raw")`, which is what
`website/src/lib/shareCode.ts` does), the **text** (`formatLessonForDisplay` card + a hint line + the
code as the LAST line), the **link** (`SHARE_PAGE_URL#code` — must equal the docs site's
`url + baseUrl + "lesson"`) and the **`.devcoach.md` file** (strict YAML-subset front matter +
markdown body, no YAML dependency). `parseSharedInput` accepts all of them plus a legacy lessons JSON
array, finds the code anywhere in a card/link, and re-joins email-wrapped codes. Privacy rules live
in `buildSharePayload`: `folder` never, `repository` only for github/gitlab/bitbucket, the other
context keys only with `includeContext`. `resolveSharedBy`: explicit → anonymous → `share_name`
setting → git `user.name` → null. Storage: `coach.importSharedLesson` keeps the sender's id, suffixes
`-shared`/`-shared-2`… only on collision with a different lesson, and reports a re-import of the same
share as `duplicated` (`isSameSharedLesson`: imported + same title/topic/sender — no `LIKE`).
Surfaces: CLI `share`/`import` (no arg = clipboard), MCP `share_lesson`/`import_lesson`
(`reply_check`: code verbatim in a fenced block), the skill (`assets/references/sharing.md` holds the
flows: pick lesson → transport → privacy → verbatim reply; import outcomes; "show me the lesson X
shared" = card without `log_lesson`; the ONE unprompted offer, right after `star_lesson`), the plugin
commands `/devcoach:share` + `/devcoach:import` (`plugin/commands/`), the user guide `docs/usage/sharing.md`, dashboard (`/lessons/:id/share`,
`POST /lessons/import` with a `Sec-Fetch-Site` guard (the share route too; it persists `share_name`
only when the popover posts `persist=1`, set by Alpine on the name input's `change`, not per keystroke),
read-only `GET /lessons/import?code=`,
`/ping` = the app's only CORS route, locked to the docs origin + `Access-Control-Allow-Private-Network`),
and the docs page `website/src/pages/lesson.tsx` — whose dashboard probe (`website/src/lib/dashboardProbe.ts`,
`npm test --prefix website`) must stay browser-aware: WebKit blocks https→http://127.0.0.1 subresources as
mixed content (bug 171934, open), so Safari/iOS get an "unsupported" state and NO fetch; Chrome 142+ gates
loopback behind the `local-network-access` permission (queried before/after the fetch to tell a refusal
from a dead dashboard; `targetAddressSpace: "loopback"` on the request). Hardening (from two ultrareview rounds, keep it):
markdown from lessons is always `DOMPurify.sanitize`d before `innerHTML` (dashboard) / rendered
through `marked` + DOMPurify (docs page); `decodeShareCode` caps the input at `MAX_CODE_CHARS` and
inflates with a byte budget (`inflateBounded`; the docs decoder streams the same way); `fetchSharedInput`
refuses non-public hosts after DNS resolution, pins the socket to the resolved address (`nodeTransport`:
Node's http/https client with a `lookup` that answers the validated IP — defeats DNS rebinding; global
fetch has no such hook and an undici Agent from npm is NOT interoperable with the fetch bundled in Node 24,
tried and reverted), follows ≤ 3 redirects by hand and reads the body with a byte cap;
`share_name` is normalised by one helper (`normalizeShareName`, `SHARE_NAME_MAX`). Roadmap, not built:
short links (secret Gist) and ephemeral one-use links.

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

- **Branching model**: `develop` is the integration branch — every PR (features, Dependabot, the
  screenshots workflow) targets it; `main` only ever receives release commits, fast-forwarded by the
  `bump` job, so it is always the last release. `main` stays the **default branch** on purpose:
  the self-marketplace (`/plugin marketplace add UltimaPhoenix/dev-coach`, `source: "./plugin"` — the
  maintainer / local-testing path; user docs point only at `UltimaPhoenix/claude-plugins-marketplace`,
  which CI pins to each release tag) clones the default branch and `claude plugin marketplace add` has
  no ref option, so whatever is on `main` is what that path installs. Feature branches from `develop`; hotfixes from `main` (release on
  `main`, then merge `main` into `develop` — the next release preflight refuses to run until
  `main` is an ancestor of `develop`). Release pushes carry `[skip ci]`, so `main` never gets a
  CI run: SonarCloud's main branch and the README CI badge point at `develop`.
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
  `plugin/skills/`, `gemini-extension/skills/` and both `LICENSE` copies are byte-checked mirrors: never
  edit them, run `npm run plugin:sync` (it also pins every manifest version to `package.json`).
  Marketplace entries (public tap + self-marketplace) mirror `plugin.json`'s metadata — change it there.
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

Releases are cut from the `workflow_dispatch` run of `.github/workflows/ci.yml` **on `develop`**
(patch/minor/major or an exact version): `bump` commits `chore: release v<version> [skip ci]` on
`develop`, tags it and pushes — atomically — the bump to `develop`, the fast-forward of `main` and
the tag (a non-fast-forward `main` rejects all three); dispatched on `main` it is a hotfix release
(bump on `main` only). Every green push to `develop` also publishes a **canary**: the `prerelease`
job computes `<next minor>-next.<run>.g<sha>` in the runner (never committed, never a `v*` tag —
the release preflight derives versions from `v*` tags only), publishes it to npm under the dist-tag
`next` (`npx -y devcoach@next`), and recreates the rolling GitHub prerelease `next` with the
`.mcpb` + plugin/Gemini zips, and the `marketplace-beta` job pins that plugin zip (archive source +
sha256, via `scripts/update-beta-marketplace.mjs`) in `UltimaPhoenix/claude-plugins-marketplace-beta`
— a **separate** marketplace so the plugin keeps its name (`devcoach@ultimaphoenix-beta`, same
tools/commands/skill as the release; `doctor` warns when both channels are enabled). The docs site
deploys both branches from one Pages artifact:
`main` at `/dev-coach/`, `develop` at `/dev-coach/next/` (`DOCS_NEXT=1` build: noindex, no sitemap,
banner). Then `publish` (`npm publish`, OIDC
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
