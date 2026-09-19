# devcoach — Claude Code plugin

Install: `/plugin marketplace add UltimaPhoenix/claude-plugins-marketplace`, then `/plugin install devcoach@ultimaphoenix`.
Open the web dashboard any time with `/devcoach:ui`; `/devcoach:course` starts a step-by-step course.
Docs: https://ultimaphoenix.github.io/dev-coach/install/claude-code-plugin

**Maintainers:** the repo's own `.claude-plugin/marketplace.json` (`/plugin marketplace add
UltimaPhoenix/dev-coach` → `devcoach@devcoach`) is the local-testing and CI-validation path, not the one
users are pointed at. `skills/devcoach/` and the version/pin stamps in this folder are **synced
mirrors** — the source of truth is `assets/` and the root `package.json`. Never edit them here;
run `npm run plugin:sync` instead. `tests/plugin.test.ts` fails CI on any drift.
