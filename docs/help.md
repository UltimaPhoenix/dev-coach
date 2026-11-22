---
title: Help
sidebar_label: Help
description: "devcoach is not doing what you expect? Run devcoach doctor, find what you see, or read the questions people ask."
keywords: [devcoach help, devcoach troubleshooting, devcoach doctor, devcoach FAQ, no lesson appears]
---

# Help

import { Card, Cards } from "@site/src/components/Cards";

## First, run the check

`devcoach doctor` looks at your whole setup: the server, the hooks, the devcoach skill and the pace.
It says what is wrong and why the next task would or would not bring a lesson.

```bash
devcoach doctor
```

No `devcoach` command on your computer? `npx -y devcoach doctor` runs the same check.
[How to read what it prints →](./troubleshooting.md#doctor)

## What do you see?

<Cards columns={3}>
  <Card title="No lesson appears" to="/troubleshooting#no-lessons">
    Your agent finishes tasks and nothing follows.
  </Card>
  <Card title="The agent cannot start devcoach" to="/troubleshooting#mcp-server-not-connecting">
    "Failed to connect", or devcoach is missing from the agent's tools.
  </Card>
  <Card title="Node is too old" to="/troubleshooting#node-version-error">
    A message that devcoach needs Node 24 or newer.
  </Card>
  <Card title={'"Stop hook error occurred"'} to="/troubleshooting#stop-hook-error">
    Next to a lesson in Claude Code. It is harmless.
  </Card>
  <Card title="A newer devcoach upgraded the database" to="/troubleshooting#database-newer">
    Reading works; saving is refused.
  </Card>
  <Card title="Something else" to="/troubleshooting#symptoms">
    Every message devcoach shows, and where its fix is.
  </Card>
</Cards>

## Have a question?

<Cards columns={3}>
  <Card title="What devcoach is" to="/faq#about">
    What it does, how it differs from inline explanations, what a course is.
  </Card>
  <Card title="Getting lessons" to="/faq#getting-lessons">
    Why none has come yet, how to change the pace, sharing.
  </Card>
  <Card title="Your data and privacy" to="/faq#your-data-and-privacy">
    Where it is stored and what leaves your computer.
  </Card>
  <Card title="Install and agents" to="/faq#install-and-agents">
    Which agents work, and what each one gets.
  </Card>
  <Card title="Cost and license" to="/faq#cost-and-license">
    Free for everyone, and what AGPL-3.0 means for you.
  </Card>
</Cards>

## Still stuck?

[Open an issue on GitHub](https://github.com/UltimaPhoenix/dev-coach/issues) and paste what
`devcoach doctor` prints. If the problem is that lessons don't come, add a
[trace of the hooks](./troubleshooting.md#hook-trace) too.
