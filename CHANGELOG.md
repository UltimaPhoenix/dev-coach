# Changelog

Notable changes to devcoach. Versions follow [Semantic Versioning](https://semver.org/).

---

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
  MCP `initialize`. CI runs that build on every push. The manifest now declares the Node runtime floor
  (`>=24`, for `node:sqlite`).
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
