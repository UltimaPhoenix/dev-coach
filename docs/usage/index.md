---
title: Use devcoach
sidebar_label: Use devcoach
description: "What you can do with devcoach and where: lessons in your agent's chat, courses, sharing, the web dashboard and the command line."
keywords: [use devcoach, devcoach lessons, devcoach courses, devcoach dashboard, devcoach command line]
---

# Use devcoach

import { Card, Cards } from "@site/src/components/Cards";
import Matrix, { Legend, No, Note, Notes, Partly, Ref, Yes } from "@site/src/components/Matrix";

devcoach works from three places: your agent's chat, a web dashboard in your browser and the
`devcoach` command. They share one profile and one lesson log, so start wherever you are.

## What do you want to do?

<Cards columns={3}>
  <Card label="Start here" title="Get a lesson and answer it" to="/usage/coaching#your-first-lesson">
    A short lesson at the end of your agent's reply, and three one-key answers.
  </Card>
  <Card label="Your profile" title="Set up, and set the pace" to="/usage/coaching#onboarding">
    How devcoach learns what you know, and how often lessons come.
  </Card>
  <Card label="Go deeper" title="Take a course" to="/usage/courses">
    A lesson you couldn't follow, rebuilt step by step from what you already know.
  </Card>
  <Card label="With others" title="Share a lesson" to="/usage/sharing">
    Hand one over as text, a link or a file, or add one you were sent.
  </Card>
  <Card label="In a browser" title="Open the dashboard" to="/usage/web-ui">
    Your lessons, knowledge map, courses and settings, served from your own computer.
  </Card>
  <Card label="In a terminal" title="Use the command line" to="/usage/cli">
    Lessons, stats, settings, backups and `devcoach doctor`.
  </Card>
</Cards>

## Where you can do it

Most things work from all three places. A course is taught in the chat; a backup and the setup check
are not.

<Matrix label="What you can do from your agent, the dashboard and the command line" minWidth={38}>

| What | In your agent | Web dashboard | Command line |
|---|---|---|---|
| **Get a lesson** | <Yes>When one is due, or when you ask<Ref n={1} to="lessons" /></Yes> | <No>No</No> | <No>No</No> |
| **Answer a lesson** | <Yes>One key under the card</Yes> | <Yes>On the lesson's page</Yes> | <Yes>`devcoach feedback`</Yes> |
| **Read past lessons** | <Yes>Ask for them</Yes> | <Yes>Search and filters</Yes> | <Partly>`devcoach lessons`<Ref n={2} to="summary" /></Partly> |
| **Take a course** | <Yes>Taught here, one step per message</Yes> | <Partly>Read it and mark its steps</Partly> | <Partly>List courses and their progress</Partly> |
| **Share or import a lesson** | <Yes>Ask</Yes> | <Yes>Share and Import buttons</Yes> | <Yes>`devcoach share`, `import`</Yes> |
| **Edit the knowledge map** | <Yes>Ask</Yes> | <Yes>In place</Yes> | <Yes>`knowledge-add`, `group-add` and the like</Yes> |
| **Change the pace** | <Yes>Ask</Yes> | <Yes>Settings</Yes> | <Yes>`devcoach set`</Yes> |
| **Back up and restore** | <Partly>Restore only, at setup<Ref n={3} to="restore" /></Partly> | <Yes>Settings</Yes> | <Yes>`devcoach backup`, `restore`</Yes> |
| **Check the setup** | <No>No</No> | <No>No</No> | <Yes>`devcoach doctor`</Yes> |

</Matrix>

<Notes>
<Legend />
<Note n={1} id="lessons">A lesson comes by itself in Claude Code, Gemini CLI (beta) and Codex CLI (beta). In Claude Desktop and other agents you ask for one ([what each agent gets](../install/index.md#what-each-agent-gets)).</Note>
<Note n={2} id="summary">`devcoach lesson <id>` prints a lesson's details and summary. Its full text is in the dashboard and in the chat.</Note>
<Note n={3} id="restore">When devcoach sets up your profile, one of the choices is **Import backup** ([Onboarding](./coaching.md#onboarding)).</Note>
</Notes>

No `devcoach` command on your computer? The [Claude Code plugin](../install/claude-code-plugin.md) and
the Claude Desktop extension install none: run any command as `npx -y devcoach <command>`, or
[add the command](../install/index.md).
