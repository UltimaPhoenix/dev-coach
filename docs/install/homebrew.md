---
title: Homebrew
---

# Homebrew (macOS / Linux)

:::tip Recommended for developers
If you work in a terminal, this is the best fit: a single `brew install` sets up devcoach **and** the
`devcoach` CLI, so the [command line](../usage/cli.md) and `devcoach ui` work directly (no `npx` prefix).
:::

devcoach ships from its own tap. Add and trust the repository once, install, then connect:

```bash
# 1. Add the tap — registers github.com/UltimaPhoenix/homebrew-tap with Homebrew
brew tap UltimaPhoenix/tap

# 2. Trust the whole tap — required when Homebrew enforces HOMEBREW_REQUIRE_TAP_TRUST
brew trust --tap UltimaPhoenix/tap

# 3. Install
brew install devcoach

# 4. Connect (Homebrew puts `devcoach` on your PATH — no npx prefix needed)
devcoach install
```

`brew tap` registers the third-party repository; `brew trust --tap` marks it trusted so Homebrew loads its
formulae when `HOMEBREW_REQUIRE_TAP_TRUST` is set. Both are one-time. Update later with
`brew upgrade devcoach`.

Prefer a one-liner? `brew install UltimaPhoenix/tap/devcoach` taps and installs in one go — run
`brew trust --tap UltimaPhoenix/tap` first if your Homebrew enforces tap trust. The formula declares
`depends_on "node"`, so Homebrew pulls in a recent Node automatically.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
