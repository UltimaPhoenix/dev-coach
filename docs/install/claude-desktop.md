---
title: Claude Desktop (.mcpb)
sidebar_label: Claude Desktop (.mcpb)
---

# Claude Desktop extension (`.mcpb`)

A single bundle that runs on Claude Desktop's built-in runtime — no Node or terminal required:

```bash
npm run mcpb        # → dist-mcpb/devcoach-<version>.mcpb
# Claude Desktop → Settings → Extensions → Install Extension… → pick the .mcpb
```

`npm run mcpb:sign` self-signs it (installs as an *unverified publisher*; a real code-signing certificate
is needed for a verified signature). Prebuilt `.mcpb` releases and a Desktop directory listing are planned.

→ Next: **[Coaching in your agent](../usage/coaching.md)**.
