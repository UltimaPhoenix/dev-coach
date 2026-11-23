---
title: claude.ai web (not supported)
sidebar_label: claude.ai web (not supported)
description: devcoach does not work on claude.ai in the browser. It is a local MCP server, and claude.ai cannot reach a server on your computer. Use Claude Desktop or Claude Code instead.
---

import { Card, Cards } from "@site/src/components/Cards";

# claude.ai web (not supported)

devcoach does not work on claude.ai in the browser. devcoach is an MCP server that runs on your
computer and keeps your data there, and claude.ai supports only hosted, remote connectors, so it
cannot reach it. [Privacy & security](../reference/privacy.md#why-it-cant-be-a-hosted--remote-connector)
explains why devcoach stays local.

## What you get here

<Cards columns={3}>
  <Card label="No" title="devcoach's tools">
    claude.ai cannot reach the server, so none of its 25 tools.
  </Card>
  <Card label="No" title="Lessons">
    Without the tools there is no profile, no memory of past lessons and no pacing.
  </Card>
  <Card label="No" title="The devcoach skill">
    It would not help: every lesson it describes is built on calls to those tools.
  </Card>
</Cards>

## Use one of these instead

<Cards columns={2}>
  <Card label="No terminal" title="Claude Desktop" to="/install/claude-desktop">
    The extension *(beta)* adds all 25 tools. You ask for a lesson when you want one.
  </Card>
  <Card label="Automatic lessons" title="Claude Code" to="/install/claude-code-plugin">
    The plugin: when a task ends and a lesson is due, Claude teaches it.
  </Card>
</Cards>

Both can run on the same computer and share one profile and one set of lessons (`~/.devcoach/`).
Other agents: [what each agent gets](./index.md).
