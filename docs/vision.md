---
title: Vision & roadmap
sidebar_label: Vision & roadmap
description: "Free, local, open source and not for sale. Shipped: lesson sharing and courses. Exploring: short links, gap-driven learning paths, team visibility."
keywords: [devcoach roadmap, open source AI coaching, learning paths, developer knowledge map, team learning]
---

# Vision & roadmap

import { Card, Cards } from "@site/src/components/Cards";
import { Stop, Timeline } from "@site/src/components/Timeline";

Where devcoach is going, and what stays the same on the way: the promises first, then what has
shipped and what we're exploring next.

## What never changes

<Cards columns={3}>
<Card title="Local-first for individuals">

Your coaching data lives on your machine, with no account and no telemetry. That is a deliberate
design, and it stays.

</Card>
<Card title="Free for everyone">

Using devcoach costs nothing, at home or at work, and always will.

</Card>
<Card title="Unobtrusive by default">

One short lesson when one is due, at a pace you set. Nothing to open or maintain.

</Card>
</Cards>

## Not commercialized

devcoach is free and open source under AGPL-3.0, and **it is not being commercialized**. There is
no paid tier, no subscription, no commercial license on offer, and **no plans to sell the core
tool**.

If anything is ever sold, it would be a **separate, derivative product** built alongside devcoach,
never a paywall bolted onto the tool you already use.

Using devcoach, at home or at work, never puts your own code under the AGPL. The AGPL's condition is
about devcoach itself: if you distribute a modified devcoach, or run one as a network service, you
release your changes under the AGPL too. Embedding devcoach in a **closed-source product** is not
covered; if that is ever your case, open an issue and it will be considered case by case.
[License & commercial use](./reference/license) has the details and examples.

## Roadmap

What shipped from earlier ideas, and what we're exploring now. Nothing below is a commitment or a
price list.

<Timeline
  label="devcoach releases with their dates, then what comes next"
  caption={<>Release dates from the <a href="https://github.com/UltimaPhoenix/dev-coach/blob/main/CHANGELOG.md">changelog</a>.</>}
>
<Stop version="1.0" date="2026-08-27" title="First stable release" to="/install">Claude Code plugin; Gemini CLI and Codex CLI (beta).</Stop>
<Stop version="2.1.0" date="2026-09-14" title="Lesson sharing" to="/usage/sharing">A lesson travels as text, a link or a file.</Stop>
<Stop version="2.5.0" date="2026-09-28" title="Courses" to="/usage/courses">Step by step, from a lesson you couldn't follow.</Stop>
<Stop version="2.7.0" date="2026-10-06" title="Guided setup" to="/install/claude-code-plugin">`/devcoach:setup`; `doctor` checks Claude Desktop.</Stop>
<Stop version="2.8.0" when="next" status="next" title="Windows" to="/install/windows">A one-line installer, and Scoop.</Stop>
<Stop when="exploring" status="exploring" title="Ideas" to="#exploring">Short links, learning paths, team visibility.</Stop>
</Timeline>

### Exploring

Directions we find interesting, written down to invite discussion.

<Cards columns={2}>
<Card title="Lesson sharing, next">

- **Short links**: a secret Gist behind the long link, revocable from the CLI.
- **Ephemeral one-use links**: zero-knowledge. The key stays in the URL fragment; the server holds
  only ciphertext that self-destructs on first read.
- **Curated collections of lessons per stack** that a team or a community can maintain.

</Card>
<Card title="Gap-driven learning paths">

devcoach already learns where you're weak: topics with low confidence on your knowledge map,
lessons you marked ❌, patterns the notebook flags. Connecting those gaps to a structured
progression, the next thing to learn in order, is a natural extension of that.

</Card>
<Card title="Courses from a wall you keep hitting">

When you've hit the same wall three times, devcoach would offer a course on exactly that concept.
Today the coach offers one when you answer *couldn't follow* under a card, or starts one when you
ask.

</Card>
<Card title="Team-level visibility">

Built from each developer's own knowledge map: which topics a team is collectively strong or weak
on, where coverage is thin, and where skills are concentrated in one person. Enough signal to plan
onboarding and spot gaps before they become incidents.

</Card>
</Cards>

The individual, local experience stays private by default; anything team-shaped would be an
opt-in layer on top, never a change to how the solo tool works.

## Shape the roadmap

Have a feature request, a use case the current tool doesn't cover, or thoughts on any of the ideas
above? [Open an issue on GitHub](https://github.com/UltimaPhoenix/dev-coach/issues): feature
requests, feedback and questions all live there.
