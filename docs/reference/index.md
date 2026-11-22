---
title: Reference
sidebar_label: Reference
description: "Look up a devcoach setting, where your data lives, what devcoach reads and sends, the MCP tools your agent sees, and the license."
keywords: [devcoach reference, devcoach settings, devcoach privacy, devcoach MCP tools, devcoach license]
---

# Reference

import { Card, Cards } from "@site/src/components/Cards";

The facts to look up. For how to do something, see [Use devcoach](../usage/index.md).

## What are you looking for?

<Cards columns={2}>
  <Card label="Settings and data" title="Configuration" to="/reference/configuration">
    The seven settings and their defaults, how pacing works, environment variables, where your data
    lives, backup, reset and the database.
  </Card>
  <Card label="What it reads and sends" title="Privacy & security" to="/reference/privacy">
    What devcoach reads to build your profile, what it stores, and when something leaves your
    computer.
  </Card>
  <Card label="For your agent" title="MCP server" to="/reference/mcp-server">
    The 25 tools, 11 resources and the prompt devcoach gives your agent.
  </Card>
  <Card label="Cost and terms" title="License" to="/reference/license">
    Free for everyone, at home or at work, under AGPL-3.0.
  </Card>
</Cards>

## Looked up most

| Question | Short answer | Where |
|---|---|---|
| Where is my data? | In `~/.devcoach/` on your computer: a database, the coaching notebook and your course files. | [Where it lives](./configuration.md#data-location) |
| How often do lessons come? | By default about one cue every 10 interactions, at most 2 lessons a day, at least 4 hours apart. Every number is a setting. | [How pacing works](./configuration.md#rate-limits) |
| Does my data leave my computer? | Only when you share a lesson or publish a course. What your agent reads from devcoach is part of its conversation with its model, as with anything in a session. No account, no telemetry, no update check. | [Privacy & security](./privacy.md) |
| How do I back up? | `devcoach backup`, or **Download backup** on the dashboard's Settings page. The zip is not encrypted. | [Back up and restore](./configuration.md#backup-strategy) |
| Can I use it at work? | Yes. It is free for everyone, and using it never puts your own code under the AGPL. | [License](./license.md) |
| What can my agent call? | 25 tools, 11 resources and 1 prompt. | [MCP server](./mcp-server.md) |

How the pieces work together around one task is in [How it works](../how-it-works.md).
