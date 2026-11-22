---
title: Vision & roadmap
sidebar_label: Vision & roadmap
description: "Free, local, open source and not for sale. Two ideas we're exploring: a learning path across topics, and a course offered when a topic keeps coming back."
keywords: [devcoach roadmap, open source AI coaching, learning paths, developer knowledge map]
---

# Vision & roadmap

import { Card, Cards } from "@site/src/components/Cards";

Where devcoach is going, and what stays the same on the way: the promises first, then the ideas
we're exploring.

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

Using devcoach, at home or at work, never puts your own code under the AGPL. The AGPL's conditions
are about devcoach itself: a copy you pass on goes with its source, and if you distribute a modified
devcoach, or run one as a network service, you release your changes under the AGPL too. Embedding devcoach in a **closed-source product** is not
covered; if that is ever your case, open an issue and it will be considered case by case.
[License & commercial use](./reference/license) has the details and examples.

## Roadmap

Ideas we're exploring, written down to invite discussion. Nothing here is a commitment. What has
already shipped is in the [changelog](https://github.com/UltimaPhoenix/dev-coach/blob/main/CHANGELOG.md).

<Cards columns={2}>
<Card title="A learning path across topics">

devcoach already knows where you're weak: topics with low confidence on your knowledge map, lessons
you marked ❌, patterns the notebook flags. Today each lesson still starts from the task your agent
just finished. The idea is to connect those gaps into an order: the next thing to learn, and the one
after.

</Card>
<Card title="A course when a topic keeps coming back">

Today the coach offers a [course](./usage/courses.md) once, when you answer *couldn't follow* under a
lesson, or starts one when you ask. The idea is to offer one by itself when the same topic keeps
getting ❌.

</Card>
</Cards>

## Shape the roadmap

Have a feature request, a use case the current tool doesn't cover, or thoughts on any of the ideas
above? [Open an issue on GitHub](https://github.com/UltimaPhoenix/dev-coach/issues): feature
requests, feedback and questions all live there.
