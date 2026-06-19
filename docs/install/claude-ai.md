---
title: claude.ai web (skill copy)
sidebar_label: claude.ai web
---

# claude.ai web (skill copy)

Claude.ai does **not** support MCP servers, so install the coaching **instructions** as a skill instead:

1. Copy the content of [`assets/SKILL.md`](https://github.com/UltimaPhoenix/dev-coach/blob/main/assets/SKILL.md)
2. Go to **claude.ai → Settings → Custom instructions** (or Skills, depending on your plan)
3. Paste the content and save

This gives claude.ai the coaching *behaviour* only — the MCP tools (lesson logging, profile tracking) won't
work, because there's no local server. See [Privacy & security](../reference/privacy.md) for why a hosted
connector isn't possible.

:::note Keep the skill current
For Claude Code / Claude Desktop the skill is served automatically and is always up to date. If you copied
it manually to claude.ai, re-paste the latest `SKILL.md` after each devcoach update.
:::
