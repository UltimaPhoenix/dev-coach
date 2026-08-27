---
title: Claude Desktop (.mcpb)
sidebar_label: Claude Desktop (.mcpb)
---

# Claude Desktop extension (`.mcpb`)

:::warning[Beta]
The `.mcpb` extension format is currently in beta. It works well for most users, but report any issues
to [GitHub Issues](https://github.com/UltimaPhoenix/dev-coach/issues). For the most stable experience,
use [Homebrew](./homebrew.md) or [npm/npx](./npx.md).
:::

:::tip[Recommended for Claude Desktop]
The simplest, no-terminal way to add devcoach to Claude Desktop — one click, runs on Desktop's built-in
runtime.
:::

Every GitHub release ships a prebuilt `devcoach-<version>.mcpb` — a single bundle that runs on Claude
Desktop's built-in Node runtime, so no Node install or terminal is required:

1. Download `devcoach-<version>.mcpb` from the
   [latest release](https://github.com/UltimaPhoenix/dev-coach/releases/latest).
2. In Claude Desktop open **Settings → Extensions → Install Extension…** and pick the downloaded file.

That's it — the `devcoach` tools, resources, and the `devcoach_instructions` prompt are available in
your next conversation, and the database is created at `~/.devcoach/coaching.db` on first use.

:::note[Unverified publisher]
The bundle is **self-signed**, so Claude Desktop shows it as coming from an *unverified publisher*. A
verified signature needs a real code-signing certificate, which isn't configured — the label is
expected. Every release also publishes `SHASUMS256.txt` next to the `.mcpb` if you want to verify the
download.
:::

## From source

```bash
npm run mcpb        # → dist-mcpb/devcoach-<version>.mcpb
npm run mcpb:sign   # self-sign it — installs with the same "unverified publisher" label
```

Then install the resulting file through the same **Settings → Extensions → Install Extension…** dialog.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
