---
title: Claude Desktop (.mcpb)
sidebar_label: Claude Desktop (.mcpb)
---

# Claude Desktop extension (`.mcpb`)

:::warning Beta
The `.mcpb` extension format is currently in beta. It works well for most users, but report any issues
to [GitHub Issues](https://github.com/UltimaPhoenix/dev-coach/issues). For the most stable experience,
use [Homebrew](./homebrew.md) or [npm/npx](./npx.md).
:::

:::tip Recommended for Claude Desktop
The simplest, no-terminal way to add devcoach to Claude Desktop — one click, runs on Desktop's built-in
runtime.
:::

A single bundle that runs on Claude Desktop's built-in runtime — no Node or terminal required:

```bash
npm run mcpb        # → dist-mcpb/devcoach-<version>.mcpb
# Claude Desktop → Settings → Extensions → Install Extension… → pick the .mcpb
```

`npm run mcpb:sign` self-signs it (installs as an *unverified publisher*; a real code-signing certificate
is needed for a verified signature). Prebuilt `.mcpb` releases and a Desktop directory listing are planned.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
