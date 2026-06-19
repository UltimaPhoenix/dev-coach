---
title: Coaching in your agent
sidebar_label: Coaching in your agent
---

# Coaching in your agent

This is devcoach's main job: **automatic, in-context coaching** while you work with your AI agent. After
your agent finishes a technical task, devcoach appends one short lesson about something that task touched —
calibrated to what you already know. There's nothing to open and no command to run; it happens in the
background.

> The [CLI](./cli.md) and [web dashboard](./web-ui.md) are *secondary* ways to review and manage your
> data — this page is the core experience. See [How it works](../how-it-works.md) for the decision flow
> behind lesson selection.

## Onboarding

The first time your agent connects, devcoach notices your profile isn't set up and walks you through it
inline — no separate command.

### Automatic detection (recommended)

**If you already use Claude on real projects, choose automatic.** devcoach scans your project files
(`package.json`, `requirements.txt`, `go.mod`, lockfiles, …) and proposes your stack with starting
confidence scores:

```
I detected these technologies in your project:

  typescript     → confidence 6  (keep? or enter 0–10 to adjust)
  docker         → confidence 7  (keep? or enter 0–10 to adjust)
  github_actions → confidence 6  (keep? or enter 0–10 to adjust)

Anything I missed? List any tools, languages, or practices you work with regularly.
```

You confirm, tweak scores, or add topics it missed, then devcoach proposes logical groups (Languages,
Frontend, DevOps, …). It's the fastest path and gives the most accurate starting profile — which is why
it's recommended for anyone already working in a real codebase with Claude.

### Other ways to onboard

- **Restore from a backup** — on a new machine? Provide your backup zip path and your whole profile
  (knowledge map, lessons, settings) is imported instantly. See
  [Backup, export & import](./cli.md#backup-export--import).
- **Guided conversation** — prefer to describe your stack by hand? devcoach asks about each technology and
  your confidence (1–3 still learning · 4–6 comfortable · 7–9 strong · 10 expert).

You can re-run onboarding any time from the terminal with `devcoach setup`.

## Your first lesson

You work on a task as normal. After your agent responds, devcoach appends a lesson:

```
🎓 devcoach · TypeScript · Level: Mid

Promise.allSettled vs Promise.all — don't let one failure sink the batch

Promise.all rejects the moment any promise rejects, and you lose the results of the ones that
already succeeded. For independent work, reach for Promise.allSettled… [short, focused explanation]

Did that land?  ✅ know · ❌ don't know · ⏭ skip
```

## The feedback loop

Your response tunes future coaching:

- **✅ know** — raises your confidence on that topic; you'll see fewer, deeper lessons there.
- **❌ don't know** — lowers it; devcoach revisits the area sooner.
- **⏭ skip** — no change.

## Staying unobtrusive

Rate limits keep coaching from getting noisy — by default **≤ 2 lessons/day, ≥ 4 hours apart**. Tune them
any time with `devcoach set …` or from the [dashboard](./web-ui.md); see
[Configuration](../reference/configuration.md).

→ Review your progress in the **[CLI](./cli.md)** or the **[web dashboard](./web-ui.md)** — they show the
same data.
