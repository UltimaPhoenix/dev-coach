---
title: Vision & roadmap
sidebar_label: Vision & roadmap
description: "devcoach is free, local, and open-source — not commercialized. Where the project is headed: gap-driven learning paths, deeper course modules, and optional team-level visibility."
keywords: [devcoach roadmap, open source AI coaching, learning paths, developer knowledge map, team learning]
---

# Vision & roadmap

import { Card, Cards } from "@site/src/components/Cards";

## The foundation — free, local, and always on

devcoach today is a free, open-source MCP server: one lesson at a time, rate-limited, entirely
local, nothing to open or maintain. That foundation stays. The local-first model is not a
limitation to eventually remove — it's a deliberate design that keeps your data on your machine
and coaching genuinely unobtrusive.

## What never changes

<Cards columns={3}>
<Card title="Local-first for individuals">

Your data stays on your machine, forever.

</Card>
<Card title="Free for personal use">

A single developer connecting devcoach to their agent will always be able to use it at no cost.

</Card>
<Card title="Unobtrusive by default">

One lesson at a time, rate-limited, nothing to open.

</Card>
</Cards>

## Not commercialized

devcoach is free and open-source under AGPL-3.0, and **it is not being commercialized**. There is
no paid tier, no subscription, and **no plans to sell the core tool** — the thing you install and
run stays free for everyone, forever.

If anything is ever sold, it would be a **separate, derivative product** built alongside devcoach —
never a paywall bolted onto the tool you already use. There is nothing to buy today, and the
roadmap below is a set of ideas we're exploring, not products with price tags.

There is no paid path at all today — not even a commercial license.

The only thing the AGPL rules out is embedding devcoach inside a **closed-source product**; if that
is ever your case, ask by opening an issue and it will be considered case by case. See
[License & commercial use](./reference/license) for the details — ordinary use, at home or at work,
is always free.

## Roadmap — ideas we're exploring

These are directions we find interesting, written down to invite discussion — not a committed plan
and not a price list.

### Shipped

<Cards columns={2}>
<Card title="Lesson sharing" label="Shipped in 2.1.0" to="/usage/sharing">

A lesson that landed for you can be handed to a teammate as copyable text, a server-less link or
a `.devcoach.md` file. It can be imported from the dashboard, the CLI or the agent, where it joins
the coaching log as a shared lesson: topic, level and feedback tracked as usual, pacing untouched.

Sharing is always explicit — nothing leaves your machine unless you send it.

</Card>
<Card title="Courses" label="Shipped in 2.5.0" to="/usage/courses">

Deeper course modules, shipped as courses: when a lesson is too much for one session, devcoach
builds a step-by-step course that starts where you stand, in one self-contained HTML document.

It stays on your machine unless you choose to publish it as a Claude artifact.

</Card>
</Cards>

### Exploring

<Cards columns={2}>
<Card title="Lesson sharing, next" label="Exploring">

- **Short links**: a secret Gist behind the long link, revocable from the CLI.
- **Ephemeral one-use links**: zero-knowledge. The key stays in the URL fragment; the server holds
  only ciphertext that self-destructs on first read.
- **Curated collections of lessons per stack** that a team or a community can maintain.

</Card>
<Card title="Gap-driven learning paths" label="Exploring">

devcoach already learns where you're weak: topics you score low on, concepts you keep marking ❌,
patterns the notebook flags. Connecting those gaps to a structured progression, the next thing to
learn in order, is a natural extension of that.

</Card>
<Card title="Courses from a wall you keep hitting" label="Exploring">

When you've hit the same wall three times, devcoach would offer a course on exactly that concept.
Today the coach offers one when you answer *couldn't follow* under a card, or starts one when you
ask.

</Card>
<Card title="Per-developer knowledge profiles" label="Exploring">

Each developer's knowledge map, calibrated to their actual stack and experience level.

</Card>
<Card title="Team-level visibility" label="Exploring">

Which topics a team is collectively strong or weak on, where coverage is thin, and where skills are
concentrated in one person. Enough signal to plan onboarding and spot gaps before they become
incidents.

</Card>
</Cards>

The individual, local experience stays private by default; anything team-shaped would be an
opt-in layer on top, never a change to how the solo tool works.

## Shape the roadmap

<Cards columns={2}>
<Card title="GitHub Issues" label="Open an issue" href="https://github.com/UltimaPhoenix/dev-coach/issues">

Have a feature request, a use case the current tool doesn't cover, or thoughts on any of the ideas
above? Feature requests, feedback and questions all live there.

</Card>
</Cards>
