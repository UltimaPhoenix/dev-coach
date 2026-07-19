# Contributing to devcoach

## Quick start

```bash
git clone https://github.com/UltimaPhoenix/dev-coach && cd dev-coach
npm install
npm run dev -- mcp   # run the MCP server from source (tsx)
npm run dev -- ui    # run the web dashboard from source
```

## Before every commit

```bash
npm run lint         # Biome check (auto-fix: npm run format)
npm run typecheck    # TypeScript
npm run test:cov     # Vitest — coverage must stay ≥ 80% lines
```

All three must pass before opening a PR.

## Architecture rules

See [CLAUDE.md](CLAUDE.md) for the full project structure, stack, and conventions. The critical ones:

- `core/` must never import from `mcp/`, `cli/`, or `web/`
- Every DB access must be wrapped in try/catch — never crash the MCP server
- Paths always derived from `os.homedir()/.devcoach`, never hardcoded
- `assets/` is the tracked source of truth (SKILL.md + web static) — edit there, not in `dist/`.
  `plugin/skills/` and `gemini-extension/skills/` are synced mirrors: never edit them directly,
  run `npm run plugin:sync` (tests assert byte-identity with `assets/`)

## Submitting a PR

1. Fork the repo and create a branch from `main`
2. Make your changes and confirm all checks pass
3. Open a PR against `main` with a clear description of *what* and *why* — and **state any change you
   made to existing behaviour**
4. Sign the **[Contributor License Agreement](CLA.md)** — the CLA Assistant bot comments on your PR
   with a one-line phrase to post; signing is required before merge

Keep PRs focused. A change that fixes a bug and adds a feature should be two PRs.

## Licensing & the CLA

devcoach is licensed under **AGPL-3.0** and is also offered under a separate commercial license. So
that contributions can ship under both, every contributor signs a lightweight
[Contributor License Agreement](CLA.md): you confirm you have the right to contribute and you grant
the maintainer the right to license your contribution under **both** AGPL and commercial terms. The
[CLA Assistant](.github/workflows/cla.yml) bot handles this automatically on your first PR.

See also: [Code of Conduct](CODE_OF_CONDUCT.md) · [Security policy](SECURITY.md) · [License](LICENSE).

## Testing with the MCP inspector

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/bin.js mcp
```

## Sandbox mode (keeps your real `~/.devcoach` safe)

```bash
HOME=$(mktemp -d) node dist/bin.js stats
HOME=$(mktemp -d) npm run dev -- mcp
```

## Building the Claude Desktop extension

```bash
npm run mcpb          # → dist-mcpb/devcoach-<version>.mcpb
npm run mcpb:sign     # self-sign (shows as unverified publisher)
```
