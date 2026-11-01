# devcoach — CLAUDE.md

## What is this project

`devcoach` is a local CLI (TypeScript/Node) that acts as a progressive technical coach inside
Claude Code, Gemini CLI (beta) and Codex CLI (beta): the agent's hooks cue a lesson at the right
moment, the devcoach skill tells the model how to coach, and the model talks to devcoach through
`devcoach api <operation>` in its shell. Every time the agent completes a technical task, devcoach
decides whether to deliver a lesson based on the user's knowledge map, the rate limit, and what has
already been taught. It also ships a CLI and a local web dashboard. Everything is local — one SQLite
file at `~/.devcoach/coaching.db`.

- Repo: https://github.com/UltimaPhoenix/dev-coach
- npm package: `devcoach`
- End-user command: `devcoach api <operation>` (what the skill runs) · `npx -y devcoach <cmd>` (CLI) · `… ui` (dashboard)

---

## Stack

- **Node.js ≥ 24** (required for the embedded `node:sqlite`), ESM, TypeScript
- **No protocol layer.** The model's interface is the `devcoach api` command (`src/api/`); the MCP SDK
  left with 3.0. Runtime dependency tree: 5 packages (the v1 monolith dragged in ~90 — express, ajv,
  jose, …)
- **`node:sqlite`** (`DatabaseSync`) — zero-dependency embedded SQLite at `~/.devcoach/coaching.db`
- **Zod** — schema validation + the agent API's input schemas (`z.toJSONSchema` for `devcoach api --json`)
- **Hono** + `@hono/node-server` — web dashboard (server-rendered `hono/html`, vendored Tailwind/Alpine/HTMX).
  **Palette = tokens**: `assets/static/style.css` defines `--dc-gray-*` / `--dc-accent-*` as RGB
  triplets (light = Tailwind gray, dark = an IDE ramp `#1e1f22` → `#2b2d30` → `#393b40` →
  `#43454a`, accent = brand teal) and `layout()` points Tailwind's `gray` + `accent` scales at them
  — never type a hex or an `indigo-*` class in `views.ts` (`tests/theme.test.ts` fails on both and
  holds the WCAG contrast floor). Theme: `applyTheme()` is the single writer and fires `dc:theme`;
  the nav toggle shows the CURRENT scheme and stores a per-browser choice (`theme-override`) that
  only saving Settings clears; `system` follows the OS live
- **Commander** — CLI arg parsing (`--help`, friendly errors)
- **fflate** — ZIP backup/restore
- **Biome** (lint/format) · **Vitest** (tests; coverage thresholds 92% lines / 95% functions /
  91% statements / 76% branches) · **tsup** (bundle → `dist/bin.js` + code-split chunks along the
  dynamic-import boundaries in `bin.ts`/`commands.ts`: the hook path loads `bin.js` + `hooks-*.js`
  + the shared core chunk (~38 KB, db/coach/models incl. zod) + the hooks module (~8 KB) on every
  agent stop; the CLI incl. `api` (~80 KB) and the web UI (~123 KB, only `ui`) load on demand)

---

## Project structure

```
dev-coach/
├── package.json            # bin: devcoach → dist/bin.js; engines.node >=24; ESM
├── tsconfig.json  biome.json  vitest.config.ts  tsup.config.ts  .node-version (26)
├── assets/                 # tracked single source of truth
│   ├── SKILL.md            # coaching instructions (slim body; `allowed-tools: Bash(devcoach *)`)
│   ├── references/         # skill progressive disclosure: onboarding.md, calibration.md, review.md, sharing.md, course.md
│   ├── launcher/launch.mjs # the plugin / Gemini-extension launcher (plugin:sync copies it into both)
│   └── static/             # vendored web bundle (tailwind.js, alpinejs, htmx, flatpickr, …)
├── src/
│   ├── bin.ts              # #!/usr/bin/env node → runCli(); Node < 24 → one sentence and exit (hooks: silent exit 0)
│   ├── version.ts  skill.ts
│   ├── api/                # the agent API the skill drives through `devcoach api`
│   │   ├── operations.ts   # the 25 operations: Zod input, readOnly/destructive, run() → {ok, result|error}; runOperation, describeOperations
│   │   └── state.ts        # profilePayload / briefingPayload / onboardingPayload (+ onboardingNextStep)
│   ├── core/               # pure logic, no I/O coupling to api/cli/web
│   │   ├── models.ts       # Zod: Lesson, KnowledgeEntry/Group, Profile, Settings, RateLimitResult
│   │   ├── db.ts           # node:sqlite schema + migrations + query helpers + DEFAULT_PROFILE
│   │   ├── coach.ts        # rate limit, cue engine (evaluateCue/explainCue), profile, stats
│   │   ├── git.ts  detect.ts  prompts.ts   # prompts.ts renders the lesson card (formatLessonForDisplay)
│   │   ├── share.ts  share-fetch.ts   # lesson sharing: payload, code/link/.devcoach.md codecs, parseSharedInput; URL fetch
│   │   ├── claude-history.ts   # cross-project stack scan of ~/.claude (projects map, manifests, activity, memories)
│   │   ├── courses.ts      # courses: directory + document validation over the db.ts rows (see Courses below)
│   │   ├── runtime.ts      # where devcoach runs from: classifyPath (channel × Node manager × OS), describeRuntime
│   ├── cli/commands.ts     # Commander dispatcher (api + 27 visible + 8 hidden hooks; `mcp` = a hidden stub that exits 1)
│   │                       #   + term.ts (colours, tables, OSC 8 link()) + open.ts (browser)
│   │                       #   api-command.ts (`devcoach api`: the JSON envelope + exit codes) · hooks.ts (the cues, devcoachCommand())
│   │                       #   install.ts (install/uninstall/doctor; removes the MCP registrations 2.x wrote)
│   │                       #   path-lookup.ts (resolveCommand: the lookup a spawn does, `;` + PATHEXT on Windows)
│   └── web/app.ts          # Hono app (33 routes incl. POST /shutdown) + views.ts (hono/html pages); assets/static/share.js
│                           #   startUi returns the server; SIGINT/SIGTERM/SIGHUP → gracefulShutdown (close, 2 s drain, exit);
│                           #   the open_ui child is detached, so stop_ui / `ui --stop` POST /shutdown (same-origin guarded)
├── tests/                  # Vitest (18 files: core, db-extra, coach/git/claude-history, share, api, web, cli, setup-wizard,
│                           #   hooks, hooks-spawn, launcher, runtime, plugin, gemini-extension, theme, term, screenshots-fixture)
├── website/src/pages/lesson.tsx  # the share link's landing page (+ src/lib/shareCode.ts: browser decoder)
├── scripts/e2e-claude.mjs  # local-only e2e (SPENDS TOKENS): real `claude -p` sessions over a grid of installation methods
│                           #   (plugin-tree, plugin-market, cli-entry, homebrew) × session kinds (fresh-cue, fresh-explicit,
│                           #   lesson, skip, plan-mode, restored). `npm run test:e2e` = smoke (4 calls);
│                           #   `-- --all` = 24 scenarios; `-- --list`, `-- --only a:b`; one sandbox per scenario
├── scripts/sync-plugin.mjs # pins plugin/, gemini-extension/ + self-marketplace to package.json; copies the skill,
│                           #   the LICENSE and the launcher (assets/launcher/launch.mjs → both scripts/launch.mjs)
├── scripts/marketplace-entry.mjs # the devcoach marketplace entry, derived from plugin.json (+ category/tags); used by update-marketplace.mjs
├── scripts/build-plugin-zip.mjs  # the two plugin zips; every entry carries its Unix mode so bin/devcoach stays executable
├── scripts/screenshots.mjs # Playwright capture of docs/screenshots from scripts/screenshots/fixture.zip (5 lessons + 1 shared
│                           #   by "Ada" + 2 demo courses with SVG charts; the zip keeps the highlighter placeholder — filled on
│                           #   restore). Course pages: viewport sized to the page (OOPIF + fullPage clips). The docs site's
│                           #   share page is captured from website/build (the workflow builds it; /ping stubbed via page.route)
├── plugin/                 # Claude Code plugin (bin/devcoach shim + launcher + hooks + /devcoach:setup, :ui, :share, :import, :course
│                           #   commands + skill mirror — skills/ and scripts/launch.mjs synced, never hand-edited; scripts/launch.config.json is its own)
├── gemini-extension/       # Gemini CLI extension (same launcher, AfterAgent/BeforeAgent hooks) — synced
└── docs/  website/  .github/workflows/{ci,docs,update-screenshots,cla}.yml
```

---

## Agent API (`devcoach api`)

The model's whole interface to devcoach is one shell command — `devcoach api <operation> ['<json>' | -]`
(`src/cli/api-command.ts`) over the operation table in `src/api/operations.ts`: 25 operations with the
names the MCP tools had — `log_lesson`, `skip_lesson`, `get_lessons`, `star_lesson`, `delete_lesson`,
`submit_feedback`, `update_knowledge`, `add_topic`, `remove_topic`, `add_group`, `remove_group`,
`update_settings`, `open_ui`, `stop_ui`, `complete_onboarding`, `preview_deep_scan`, `get_briefing`,
`get_onboarding`, `get_profile`, `share_lesson`, `import_lesson`, `create_course`, `add_course_step`,
`update_course_progress`, `get_courses`. Each has a Zod `input` (`.describe()` on every field),
`readOnly` / `destructive` flags and `run()`; `runOperation(op, input)` validates and never throws;
`describeOperations()` is the catalogue `devcoach api --json` prints (`z.toJSONSchema`). The state
reads (`get_profile` / `get_briefing` / `get_onboarding`) come from `src/api/state.ts`
(`profilePayload` / `briefingPayload` / `onboardingPayload`; they never throw — `{ error }` becomes
`ok: false`).

**The envelope**: stdout is exactly ONE JSON line, `{"ok":true,"result":…}` or
`{"ok":false,"error":"…"}`. **Exit codes**: 0 ok · 1 refused by the operation or its schema · 2
unknown operation / input that is not JSON · 3 the error names `SchemaTooNewError` (the database was
upgraded by a newer devcoach — the same code as every other CLI write). `-` reads the JSON from stdin:
the skill pipes lesson bodies and pasted cards through a quoted heredoc (`<<'EOF'`). No operation →
the human list; `--json` → the catalogue.

**`reply_check`** lives inside `result` (`log_lesson`, `skip_lesson`, `share_lesson`, `import_lesson`,
`create_course`): a sentence to the model about what it must write back, because devcoach cannot see
the chat. `log_lesson` is a **pure save**: it resets the pacing counters, stamps the timestamp itself
(a model has no clock; `min_gap_minutes` depends on this being accurate) and never echoes the rendered
card (the echo once made the model print it twice); its `reply_check` is the conditional self-check.
**Ordering is log_lesson-first, card-last**: the skill runs the command silently and writes the card as
the FINAL message of the turn — card-first was tried and empirically fails (every Claude harness
teaches "the deliverable is the final message", so models bury the lesson in the command and end the
turn with nothing visible). `skip_lesson` is the explicit no-op: it records why and re-arms the pacing
(clears `cue_state.pending`). `complete_onboarding` takes no `notebook`: it only guarantees
`learning-state.md` is non-empty the instant it saves the profile; the skill writes the real notebook
to the `notebook_path` that `get_onboarding` / `get_briefing` return (`db.LEARNING_STATE_PATH`) — there
is no `update_notebook`. `get_onboarding` carries **`next_step`** (`onboardingNextStep` in
`api/state.ts`): what to do with the payload, including "an empty scan does not block Automatic: use
`default_topics` as returned" — the Stop hook's onboarding cue does not load the skill, so a rule that
must reach the cue path travels in this payload, never in the hook (a real session on a machine with
no Claude Code history once looped on the setup question forever). `preview_deep_scan` is the cheap,
metadata-only pre-check (a real rolling date window) before "Automatic (Deep)" spawns a subagent —
see `assets/references/onboarding.md`.

**Feedback** (`submit_feedback`) has three answers: `know` = already knew it (the only one that moves
confidence: +1 entering, −1 leaving), `understood` = new and clear (no change), `dont_know` = couldn't
follow this session (no change; the lesson is a course seed). `coach.recordFeedback` is the single
writer (one transaction, idempotent) for the agent API, the CLI and the dashboard. Schema v4 rewrote
pre-existing `dont_know` rows to `understood` once (gated on the stored `user_version`).

**The command the model runs** is `devcoach`: on the PATH after a Homebrew / npm install, and under
the Claude Code plugin through `plugin/bin/devcoach` (a sh shim that execs the launcher; Claude Code
puts a plugin's `bin/` on the Bash tool's PATH while the plugin is enabled). The hook cues name it
through `devcoachCommand()` = `process.env.DEVCOACH_COMMAND || "devcoach"` (`cli/hooks.ts`); the
launcher sets `DEVCOACH_COMMAND` from its `launch.config.json` `command` field — plugin: `devcoach`,
Gemini extension: `launcher` = `node "<absolute launcher path>"` (Gemini has no PATH entry for
extensions; the cue is the only way the model learns that path). The skill falls back to
`npx -y devcoach api …` when the shell cannot find the command. **Permission rule**: `Bash(devcoach *)`
is the one-line allow rule (`allowed-tools` in SKILL.md and in every plugin command). Never write
`Bash(node */launch.mjs *)` — everything before the first `*` is the prefix, so it allows every `node`
command; `/devcoach:setup` once shipped `Bash(node:*)`, the same hole, and now allows exactly
`Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs *)` for its runtime check.

**Why MCP was dropped (3.0)**: in Claude Code the coaching is triggered by the hooks, not by MCP — the
server was only the model's state API, and it produced a whole class of bugs (`failed to connect`,
`plugin:devcoach:devcoach` vs `devcoach` server-name confusion in resource URIs, Claude Desktop's
PATH, a startup line to diagnose spawns), while Claude Code defers MCP tool schemas behind tool
search. A shell command needs none of that. The Claude Desktop chat extension (`.mcpb`), the other MCP
agents (Cursor, Windsurf, Cline, Continue, Zed) and the MCP Registry listing went with it, on purpose;
Claude Code, Gemini CLI and Codex CLI stay (hooks, skills and a shell tool). `devcoach mcp` is a hidden
Commander stub that prints the migration message to stderr and exits 1, so a host still configured
with the old registration sees the reason in its MCP log; `install` / `uninstall` remove those
registrations (`~/.claude.json` via `claude mcp remove` or the file, Claude Desktop's config file,
Gemini `settings.json` via `gemini mcp remove`, Codex `config.toml` via `codex mcp remove` — else a
manual-step warning, devcoach never writes TOML; `install` prints an `Old MCP…` line only when it
removed one) and `doctor` warns about one left behind.

## Hooks

The skill (`assets/SKILL.md` + `assets/references/*.md`, single source of truth; `src/skill.ts` reads
them for `devcoach install`) is never auto-injected — coaching is driven by the hooks:

- **`stop-hook`** (Stop, one spawn per stop): onboarding check + cue engine. When a lesson is due
  it emits `{decision:"block", reason, systemMessage}` — the reason is a pure-delegation directive
  that **invokes the devcoach skill via the Skill tool** and repeats NONE of its rules (a duplicated
  copy once drifted to a flat "output NOTHING else" with no recovery clause — the card got saved but
  never printed; a test locks the cue rule-free). It carries only the notebook-checkpoint count, the
  5-line fallback for missing skills (the sole place allowed to instruct — it names
  `<cmd> api get_briefing` / `log_lesson -` / `skip_lesson`), and `skip_lesson` as the explicit no-op.
  The `systemMessage` toast is neutral ("checking whether a lesson is due…") so a silent skip doesn't
  read as a failed lesson.
- **`prompt-hook`** (UserPromptSubmit): read-only peek (`explainCue`, never bumps); when this turn's
  stop would reach the threshold it primes the model via `hookSpecificOutput.additionalContext`.
- `onboard-hook` / `lesson-ready` remain as the legacy two-entry layout; `devcoach install`
  repairs/normalizes hook entries without `--force` and skips them when the devcoach plugin is
  enabled (double registration would double-count).

**The launcher** (`assets/launcher/launch.mjs`, the single source for the plugin and the Gemini
extension; `tests/launcher.test.ts` runs it as real child processes against a fake `npm`): installs
the pinned devcoach once into `<data>/runtime/<version>/` — npm runs in `<version>.tmp-<pid>/` and
the directory is **renamed** into place, so a runtime exists only when its install finished (an
interrupted install once looked installed and failed on every later start, and a server start raced
the first prompt's hook in one directory). `api` — like every subcommand but the hooks — installs
synchronously and, when it cannot, prints the launcher's full diagnosis on **stderr** and exits
**1** with nothing on stdout, so the model never mistakes a failure for an answer (exit 0 was a mute
"failed to connect" in the MCP days); hooks never wait for npm — they start a detached `--install`,
and after a failure show ONE `systemMessage` a day (`install-failed.json`, `notice.stamp`). The
launcher also exports `DEVCOACH_COMMAND` (see Agent API). Node < 24 is named before anything else. `DEVCOACH_RUNTIME_DIR` / `DEVCOACH_RUNTIME_SPEC` relocate the data dir
and what gets installed (tests, e2e). `/devcoach:setup` (`plugin/commands/setup.md`) is the
explicit entry: runtime → server → profile, running the skill's `references/onboarding.md` — there
is no second onboarding skill, on purpose. **The hooks were deliberately left as they are** (user
decision, 2026-10-03): `ONBOARD_CUE` still carries its own short flow and does not load the skill,
so a rule that lives only in `references/onboarding.md` never reaches the cue path. A real session
showed the cost: on a machine with no Claude Code history (every new device) the model would not
build a profile from an empty scan and asked the user again, forever. The rule therefore travels
in the data the cue already asks for: `get_onboarding` returns **`next_step`**
(`onboardingNextStep` in `api/state.ts`) — what to do with this payload,
including "an empty scan does not block Automatic: use `default_topics` as returned". Verified in
real sessions with the unchanged hook (`fresh-cue`, plugin and plain CLI entry). When onboarding
needs a new rule on the cue path, put it there, not in the hook.

The Claude Code **skill**: `devcoach install` copies `assets/SKILL.md` + `references/` to
`~/.claude/skills/devcoach/` with a `.devcoach-version` stamp; the welcome screen and `stats` hint
to re-run `install` when the installed skill is missing/outdated (e.g. after `brew upgrade`).
`devcoach uninstall` is the exact inverse of `install` (devcoach-owned hook
entries, skill dirs; user hooks untouched; `--data` wipes `~/.devcoach` after a prompt) — it exists
because Homebrew formulae have no uninstall hook, so the formula's `caveats` tell users to run it before
`brew uninstall`. `devcoach doctor` diagnoses the whole wiring and explains why the next stop would(n't) cue;
`DEVCOACH_HOOK_DEBUG=1` traces every hook decision to `~/.devcoach/hook.log`.

**Diagnostics**: `core/runtime.ts` `classifyPath` is the single table of where devcoach and Node
live per OS (Homebrew Cellar incl. Linuxbrew, npm global, nvm / nvm-windows / fnm / volta / asdf /
mise / n, `_npx` and `fnm_multishells` = ephemeral, plugin / Gemini dirs); paths are normalised (`\`
→ `/`, lower-case on Windows) so Windows cases are tested from any OS; `describeRuntime` feeds
`doctor` and the crash prefix in `bin.ts`. `cli/path-lookup.ts` `resolveCommand` = the lookup a spawn
does (`;` + PATHEXT on Windows — an older `findOnPath` split on `:` and never found anything there):
`install` uses it to pick the hook command (the absolute PATH hit, not its realpath, so `brew
upgrade` keeps it; ephemeral or absent → `npx -y devcoach`), `doctor` to say whether the skill's
`devcoach api …` resolves in the agent's shell (ok under an enabled plugin — it ships bin/devcoach;
otherwise a warning that names Homebrew / `npm i -g` and the npx fallback). There is no startup line
and no host-log reading any more: nothing starts a server.

---

## DB schema (shared `~/.devcoach/coaching.db`)

`lessons` (19 cols incl. `categories` JSON, `feedback`, `starred`, git metadata, `body`,
`imported` + `shared_by`), `courses` + `course_steps` (schema v5, see Courses below),
`knowledge` (topic, confidence 0–10, updated_at), `settings`, `knowledge_group_names`,
`knowledge_groups` (composite PK), `nudge_state` (per-session lesson-cue counter) and `cue_state`
(single row: `pending`, `last_cue_at`, `last_skip_reason` — cue lifecycle; both runtime only,
never backed up), `schema_migrations` (one-shot data migrations by name — runtime, never backed
up) plus 6 indexes (incl. the unique `(course_id, anchor)` on `course_steps`). All DDL is
`CREATE … IF NOT EXISTS` + `INSERT OR IGNORE` (idempotent). Connections set
`PRAGMA busy_timeout = 3000` (concurrent hook + `api` writers).
**Schema guard (v6)**: `PRAGMA user_version` is the fast-path stamp; a stamp NEWER than
`SCHEMA_VERSION` means another channel (release/beta plugin, Homebrew CLI — they share one file)
upgraded it, and `getInitializedConnection` then opens the file **read-only** (`compatOf(conn)`
non-null): no DDL, no re-stamp; `withTransaction` and the read-only SQLite error both surface as
`SchemaTooNewError` (`readOnlyMessage`: both versions, taken from the `schema_app_version` /
`schema_min_app_version` settings rows `initSchema` writes; bump `SCHEMA_MIN_APP_VERSION` with
the schema). Surfaces: hooks silent (no prime, no onboarding cue), `devcoach api` writes refused (`ok: false`,
exit 3) + `compat` in `get_briefing`/`get_profile`/`get_onboarding` (SKILL.md says it in one line),
CLI read commands
end with a yellow notice and a refused write exits 3 (`bin.ts`), dashboard banner via `/ping`
`compat` + a 503 page from `app.onError`, `doctor` red line. One-shot data migrations (the v4
`dont_know → understood` rewrite) are gated by the `schema_migrations` ledger, seeded on first run
from the stamp OR the presence of `courses` (a v5+ build was here) — a stamp an old build
downgraded never repeats them. An already-shipped build without the guard (≤ 2.4.0) is not
protected; the ledger protects the data from it.
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
Operations: `create_course` (returns `course_dir`, `document_path`, `seed_context`, a `reply_check`
that has the model write the file), `add_course_step`, `update_course_progress`, `get_courses`.
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
in sync, turns step clicks into a hash change on the frame (no reload) and answers every frame
report with `{type:"devcoach:theme"}` so the embedded document follows the dashboard's toggle
(the bridge sets `data-theme` and the dashboard's neutral tokens; the document's own
`.theme-switch` is for standalone/artifact opens and is hidden when embedded). Course colours are
tokens that **conform to the palette without copying it** (neutrals = dashboard, accent = the
course's own; `tests/theme.test.ts` checks the skeleton's values). **Code highlighting**
(`core/highlighter.ts`): the document carries ONE `<script data-devcoach="highlighter"></script>`
placeholder and `ensureHighlighter` (called by `addStep` / `setStepStatus`) fills it with the
vendored highlight.js + its BSD-3-Clause licence text + a `--syn-*` token stylesheet — the only
write devcoach makes to a model-written document, and only where the placeholder asks for it;
the dashboard appends the same block on the way out to documents that have code and no filled
block. One copy of the library everywhere it can be one: the vendored file is the dashboard's
own `highlight.min.js`, a document without `<pre><code>` is never filled, a filled document is
never filled or served with a second block, and backups store the placeholder
(`stripHighlighter` on export, `fillHighlighter` on restore — exact inverse, byte for byte). The
copy inside each course file is the one duplication kept on purpose: it is what makes the
document self-contained (disk, artifact). Vendored licences live in `THIRD_PARTY_NOTICES.md`. The skill flow
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
Surfaces: CLI `share`/`import` (no arg = clipboard), the api operations `share_lesson`/`import_lesson`
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
- One-way dependency: `core/` never imports from `api/`, `cli/`, or `web/`; `api/` never imports from `cli/`.
- `db.ts` = pure query helpers; every DB access wrapped in try/catch with graceful fallback —
  **never crash a hook or an `api` call** (a failure is `{ ok: false, error }`, never a stack).
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
npm run dev -- api                 # the agent API from source (tsx): list, `api --json`, `api get_briefing`
npm run dev -- ui                  # web dashboard from source
npm run lint && npm run typecheck && npm run test:cov
npm run build                      # tsup → dist/bin.js + code-split chunks (lean hook path)
npm run test:e2e                   # local-only: real `claude -p` sessions (sandboxed DEVCOACH_DIR)
DEVCOACH_DIR=$(mktemp -d) node dist/bin.js api get_briefing   # exercise an operation in a sandbox
node dist/bin.js --help            # CLI
node dist/bin.js doctor            # diagnose wiring + pacing (read-only)

# Sandbox mutating commands so they don't touch your real ~/.devcoach:
HOME=$(mktemp -d) node dist/bin.js stats     # or DEVCOACH_DIR=$(mktemp -d) …
```

## Permission rule (Claude Code)

The skill and the plugin commands pre-approve `Bash(devcoach *)` for their own turn; a user who wants
no prompt ever adds the same rule to `permissions.allow`. Nothing wider — see Agent API.

## Release

Releases are cut from the `workflow_dispatch` run of `.github/workflows/ci.yml` **on `develop`**
(patch/minor/major or an exact version): `bump` commits `chore: release v<version> [skip ci]` on
`develop`, tags it and pushes — atomically — the bump to `develop`, the fast-forward of `main` and
the tag (a non-fast-forward `main` rejects all three); dispatched on `main` it is a hotfix release
(bump on `main` only). Every green push to `develop` also publishes a **canary**: the `prerelease`
job computes `<next minor>-next.<run>.g<sha>` in the runner (never committed, never a `v*` tag —
the release preflight derives versions from `v*` tags only), publishes it to npm under the dist-tag
`next` (`npx -y devcoach@next`), and recreates the rolling GitHub prerelease `next` with the release
assets staged in `dist-release/` (the plugin and Gemini zips, a CycloneDX SBOM, `SHASUMS256.txt`) —
`build-plugin-zip.mjs` packs TWO plugin zips: the offline-marketplace layout
`devcoach-plugin-<v>.zip` (root `marketplace.json` + `plugin/`) and the plugin-root layout
`devcoach-plugin-archive-<v>.zip` (what an `archive` marketplace source needs; the first one installs
inert), both keeping `bin/devcoach` executable — and the `marketplace-beta` job pins the **archive**
zip (archive source + sha256, via `scripts/update-beta-marketplace.mjs`) in
`UltimaPhoenix/claude-plugins-marketplace-beta` — a **separate** marketplace so the plugin keeps its
name (`devcoach@ultimaphoenix-beta`, same commands/skill as the release; `doctor` warns when both
channels are enabled); it pushes with a write deploy key scoped to the beta repo
(`BETA_MARKETPLACE_DEPLOY_KEY`, `claude-marketplace` environment), not the release marketplace
token. The docs site deploys both branches from one Pages artifact: `main` at `/dev-coach/`,
`develop` at `/dev-coach/next/` (`DOCS_NEXT=1` build: noindex, no sitemap, banner). Then `publish`
(`npm publish`, OIDC trusted publishing, tokenless), `release` (GitHub Release with the same
`dist-release/` assets: the two Claude Code plugin zips, the Gemini extension zip, the CycloneDX SBOM
and `SHASUMS256.txt`), `homebrew` (regenerates `Formula/devcoach.rb` in `UltimaPhoenix/homebrew-tap`)
and `marketplace` (pins the entry in `UltimaPhoenix/claude-plugins-marketplace`). A plain `v*` tag
push runs the same publish/release jobs. CI checks run on Node 24 and the `.node-version` (26). No
`.mcpb`, no `server.json` and no MCP Registry job since 3.0; `scripts/sync-plugin.mjs` pins the
plugin, Gemini-extension and self-marketplace versions in the bump commit and the packaging tests
fail on drift.
