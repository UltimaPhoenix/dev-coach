# devcoach — Gemini CLI extension

Install: unzip the `devcoach-gemini-extension-<version>.zip` release asset, then
`gemini extensions install <folder>`. Docs: https://ultimaphoenix.github.io/dev-coach/install/gemini-cli

**Maintainers:** `skills/devcoach/` and the version/pin stamps in this folder are **synced
mirrors** — the source of truth is `assets/` and the root `package.json`. Never edit them here;
run `npm run plugin:sync` instead. `tests/gemini-extension.test.ts` fails CI on any drift.
