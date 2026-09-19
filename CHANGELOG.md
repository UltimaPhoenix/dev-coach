# Changelog

Notable changes to devcoach. Versions follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added
- **Delete lessons from the dashboard**, kept out of the way until you ask: the **⋯ More** button
  (the same on the Lessons toolbar and on a lesson page) holds the rare actions — *Delete lessons…*
  turns the star column into checkboxes with a *Delete selected* bar (one confirmation, one request
  for all of them); on a lesson page it holds *Delete lesson…*. Same-origin only, like share/import.
  A lesson someone shared with you deletes the same way, and the same share is accepted again
  afterwards.
- **Lessons table**: the title gets the width and categories wrap instead of squeezing it; columns are
  **resizable** by dragging a header edge (remembered in the browser, double-click or *⋯ → Reset
  column widths* to reset); the share arrow appears on hover and opens the Share panel in a popover
  next to the row, right there in the list.
- **Filter lessons by sender**: the dashboard's new **🤝 Shared** dropdown (All / My own / Shared with
  me / from `<name>`), a `🤝 <sender>` badge under the topic, `devcoach lessons --from <name>`,
  `get_lessons({shared_by})`, and the skill answers "what did Ada send me". The free-text search now
  matches the sender too.
- **Home page setting** (`ui_home`, Settings → Home page): where the dashboard's `/` lands. **Auto**
  (default) opens Lessons once you have at least one lesson and the knowledge map before that;
  **Lessons** / **Knowledge map** pin one. The knowledge map now lives at `/knowledge`; launch URLs are
  unchanged.

## [2.3.1] — 2026-09-15

### Fixed
- **`devcoach ui` on a busy port** prints a one-line explanation instead of Node's `EADDRINUSE` stack
  trace: a dashboard already running there (its link, `v<version>`, and the `--stop` hint; `--open`
  opens that one) vs another process holding the port (suggests `--port`). The `open_ui` MCP tool
  reports an already-running dashboard instead of spawning a child that died unseen.

## [2.3.0] — 2026-09-15

### Added
- **`devcoach ui`**: the dashboard URL is printed as a clickable terminal link (OSC 8, in terminals
  that render it), `--open` launches your default browser, and **Ctrl+C now stops the server
  gracefully** (in-flight requests finish; a second Ctrl+C exits at once). `devcoach ui --stop` and the
  new **`stop_ui`** MCP tool (20 → 21 tools; `/devcoach:ui stop` in the plugin) stop a dashboard that
  runs detached — the one your agent started with `open_ui` — through a same-origin `POST /shutdown`.

### Changed
- Dependencies: hono 4.13.7, zod 4.6.2; docs site marked 18, DOMPurify 3.4.15, React 19.3.

## [2.2.1] — 2026-09-15

### Fixed
- **Share page — dashboard check tells the truth.** Safari (WebKit) blocks every request from an
  https page to `http://127.0.0.1`, so the page used to report a running dashboard as "no dashboard
  answered"; the check is now skipped there with an explanation. Chrome 142+'s *Local network
  access* permission (asked, refused) is told apart from a dashboard that is really down, and a
  *retry the check* link replaces reloading. The Import button was never affected.

### Changed
- Docs: Homebrew page explains that `brew upgrade` updates only the binary (re-run `devcoach install`
  for hooks and skill) and recommends **plugin + Homebrew** for Claude Code users — the plugin keeps the
  coaching wiring current automatically, Homebrew adds the CLI.
- Docs: one install path for the Claude Code plugin — the UltimaPhoenix marketplace (pinned to each
  release by CI); the repo's own marketplace is a maintainer path now. The CLI is documented as a
  companion to the plugin (`devcoach ui`, `stats`, `share` / `import`, `backup` without going
  through Claude — never `devcoach install` next to the plugin).

## [2.2.0] — 2026-09-14

### Added
- **`devcoach uninstall`** — the inverse of `install`: removes the MCP registration, devcoach's hook
  entries and the skill directories for Claude Code / Claude Desktop (default), Gemini CLI and Codex
  CLI (`--gemini`, `--codex`, `--all`). Coaching data is never deleted unless `--data` is given (asks
  first). The Homebrew formula's caveats now point to it, since `brew uninstall` cannot run it.
- **Sharing in the skill and the plugin**: `assets/references/sharing.md` (transport choice, privacy,
  verbatim codes, import outcomes, showing a shared lesson as a card, the single share offer right
  after a star); plugin slash commands `/devcoach:share` and `/devcoach:import`; a *Sharing lessons*
  guide in the docs (`usage/sharing`), with FAQ, homepage and README entries.
- **Share page**: two-column layout with a sticky action panel and a **Download .devcoach.md** button;
  the dashboard's import preview is wider and shows the full lesson.

### Changed
- Docs: the Claude Code plugin is no longer marked Beta; the `.mcpb` extension is marked Beta in the
  sidebar as well.
- CI: the Homebrew job polls npm for the release tarball for up to 15 minutes (2.1.0 needed a re-run).

## [2.1.0] — 2026-09-14

### Added
- **Lesson sharing.** Hand a lesson to another person and import theirs — from the dashboard, the CLI
  and the agent — over one portable payload with three transports the receiver never has to tell
  apart: **copyable text** (the card plus one `devcoach:lesson:1:…` line), a **server-less link**
  (`https://ultimaphoenix.github.io/dev-coach/lesson#…` — the lesson lives in the URL fragment, decoded
  in the browser, never sent to a server) and a **`.devcoach.md` file** (YAML front matter + markdown,
  renders on GitHub).
  - Dashboard: **↗ Share** popover on a lesson (name, *Include where it happened*, Copy text / Copy
    link / Download .md), **＋ Import** box on the Lessons page (paste anything, pick a file, or drop a
    `.devcoach.md` anywhere), a read-only preview page (`/lessons/import?code=…`) with one *Add to
    my lessons* button, `GET /ping` for the docs page's best-effort "your dashboard is running"
    check, and *Your name (for sharing)* in Settings.
  - CLI: `devcoach share [id|--last] [--link] [--file] [--with-context] [--by|--anonymous]` and
    `devcoach import [source]` (code, card, link, URL, file, `-`; no argument reads the clipboard);
    `devcoach lessons --imported`; `devcoach set share_name`.
  - MCP: `share_lesson` and `import_lesson` tools (18 → 20); `get_lessons` gains an `imported`
    filter, `update_settings` accepts `share_name`; the skill handles "share the last lesson" /
    "import this devcoach lesson".
  - Docs site: `/lesson` share page (decodes the fragment locally, sanitized rendering, one-click
    import into the local dashboard, `noindex`).
- **Privacy defaults for sharing.** Only the lesson travels unless context is explicitly included; a
  local folder path is never exported and a repository name only for remote hosts; the sender name
  comes from `share_name` → git `user.name` and can be anonymous; nothing is saved on the receiving
  side until confirmed.

### Changed
- **Schema v3** (additive, automatic): `lessons` gains `imported INTEGER NOT NULL DEFAULT 0` and
  `shared_by TEXT`. An imported lesson is stored like your own — its topic counts as taught and
  feedback calibrates the profile — but it is **excluded from `max_per_day` and `min_gap_minutes`**
  and never resets the pacing counters. Backups round-trip the new fields; older backups restore
  with `imported = 0`.

## [2.0.2] — 2026-09-11

### Fixed
- **Coaching flow no longer depends on the MCP server's name.** The skill used to read
  `devcoach://briefing` / `devcoach://onboarding` / `devcoach://profile` as resources, and a resource
  read needs the client-specific server name (`plugin:devcoach:devcoach` under the Claude Code plugin,
  `devcoach` as a plain MCP entry) — a model guessing `devcoach` under the plugin failed the read.
  The same data is now exposed by three read-only tools, `get_briefing`, `get_onboarding` and
  `get_profile`, which every client resolves by name; the skill, its references and the hook cues
  call the tools (with a fallback to the resources for an older server). The resources stay for
  clients that browse them. Tool count 15 → 18.

## [2.0.1] — 2026-09-06

### Fixed
- **Claude Desktop extension manifest**: declares the Node runtime floor (`runtimes.node ">=24"`, for
  `node:sqlite`), mirrored from `package.json` `engines` and pinned by the packaging test, so Claude
  Desktop can refuse an older bundled runtime up front instead of failing at startup.

## [2.0.0] — 2026-09-06

### Changed
- **MCP SDK v2**: the server now runs on `@modelcontextprotocol/server` 2.0 (the monolithic
  `@modelcontextprotocol/sdk` 1.x is retired upstream); `@modelcontextprotocol/client` is used only by
  the in-memory tests. Tool schemas are `z.object()` Standard Schema objects. The wire contract is
  unchanged: the same 15 tools, 11 resources and prompt, with the same descriptions, defaults,
  `structuredContent` and `isError` shapes, and the same protocol negotiation with Claude Code and
  other 2024–2025-era clients (verified with the `claude -p` e2e suite). No user-facing API change;
  the major bump marks the dependency swap.
- **Runtime dependency tree: 95 packages → 7.** Ninety of them existed only because the v1 SDK pulled
  in express, ajv, jose, eventsource, cors and friends — the source of most Dependabot security PRs on
  the lockfile and of the plugin launcher's slow first install.

### Fixed
- **Claude Desktop extension (.mcpb)**: the bundle shipped the code-split npm `dist/`, whose chunks
  import the SDK, Hono, Commander, Zod and fflate from `node_modules` that the extension never
  contained, so the server could not start. The `.mcpb` is now a single self-contained `dist/bin.js`
  (`tsup.mcpb.config.ts`, every dependency inlined); the build refuses to pack unless the bundle has no
  bare-specifier imports and, run from a temp directory outside the repo, starts the CLI and answers an
  MCP `initialize`. CI runs that build on every push.
- **Release pipeline**: the bump commit now also pins the self-marketplace entry
  (`.claude-plugin/marketplace.json`) and the synced LICENSE mirrors; 1.0.3 had left the marketplace
  pin at 1.0.2.

## [1.0.0] – [1.0.3] — 2026-08-27 → 2026-09-03

Release notes for the 1.0 line live in the
[GitHub Releases](https://github.com/UltimaPhoenix/dev-coach/releases): 1.0 GA, AGPL dual license,
Claude Code plugin marketplace with `/devcoach:ui`, Gemini CLI and Codex CLI (beta) integrations,
MCP Registry publishing, Dependabot grouping.

## [0.7.0] — 2026-06-25

No functional changes. A re-release published while hardening the release pipeline; identical in
content to 0.6.0. Use **0.7.0** (the current `latest` on npm).

## [0.6.0] — 2026-06-25

### Changed
- **License**: relicensed from **Apache-2.0** to **AGPL-3.0-only** (`LICENSE`). devcoach stays free and
  open source; a separate commercial license is available for proprietary/closed use. Versions
  published before this change remain under Apache-2.0.
- **CI**: the release pipeline pushes the release commit to the protected `main` branch via a scoped
  admin token (`RELEASE_TOKEN`), marked `[skip ci]` to avoid a double publish.

### Added
- **Contributor License Agreement** (`CLA.md`) enforced by a CLA Assistant workflow, enabling the
  AGPL + commercial dual-licensing model
- **Community health files**: `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue & pull-request templates,
  `CODEOWNERS`, and a **License & commercial use** docs page

---

## [0.3.66] — unreleased

### Changed
- **Plugin**: launcher now installs a pinned `devcoach` from npm once and runs it via `node` directly, removing the runtime `npx` dependency

---

## [0.3.65] — 2026-06-19

### Changed
- **Docs**: restructured into chaptered categories (Installation / Using / Reference)
- **Docs**: installation guidance now recommends method by audience — Homebrew for developers, Claude Code plugin or `.mcpb` for non-experts

---

## [0.3.64] — 2026-06-19

### Changed
- **Docs**: split install instructions by method into dedicated pages (plugin, npx, Homebrew, `.mcpb`, claude.ai web)

---

## [0.3.63] — 2026-06-19

### Added
- **Plugin**: devcoach is now distributable as a Claude Code plugin (MCP server + Stop hooks + skill in one bundle)

### Changed
- **Docs**: deepened the Why manifesto — how learning itself changes in the AI era

---

## [0.3.62] — 2026-06-18

### Added
- **Docs**: `docs/why.md` — the full rationale for why devcoach exists
- **CI**: CycloneDX SBOM and SHA256 checksums attached to every GitHub release

### Changed
- **Docs**: refreshed install methods; corrected MCP `remove` scope

---

## [0.3.61] — 2026-06-18

### Fixed
- **CI**: Sonar coverage reporting; raised coverage baseline and restored badges

### Added
- **Docs**: Homebrew install method documented

---

## [0.3.60] — 2026-06-18

### Fixed
- **CI**: cache SonarQube scanner; clear S8707 false positive findings

### Changed
- **Tests**: raised line coverage from 89% to 95%; deduplicated profile table tests

---

## [0.3.59] — 2026-06-18

### Changed
- **CI**: bumped `sonarqube-scan-action` v5 → v8

---

## [0.3.56–0.3.58] — 2026-06-17–18

### Changed
- **CI**: miscellaneous pipeline maintenance (artifact actions, provenance configuration)

---

## [0.3.54–0.3.55] — 2026-06-15–17

### Changed
- **CI**: Homebrew tap bump automation

---

_For older versions, see the [GitHub releases page](https://github.com/UltimaPhoenix/dev-coach/releases)._
