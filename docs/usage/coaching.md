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
inline — no separate command. You pick one of four options.

### Automatic (strongly recommended)

**If you already use Claude Code on real projects, choose automatic.** devcoach builds your profile in
one pass, with no questions, from the stack detected across your whole local Claude Code history — the
projects map, manifests and lockfiles (`package.json`, `requirements.txt`, `go.mod`, …), activity
metadata, and auto-memory excerpts. Conversation text is never read. Topics, starting confidence scores,
and groups (Languages, Frontend, DevOps, …) are saved right away; you review and adjust afterwards. It's
the fastest path and gives the most accurate starting profile — which is why it's recommended for anyone
already working in real codebases with Claude.

### Automatic (Deep)

Opt-in variant for a finer-grained profile. A metadata-only pre-check first counts the projects active in
the last three months; above eight, devcoach asks whether to narrow the window, proceed with the 25 most
recent, or pick specific projects. A separate subagent then reads real conversation text from your local
session transcripts (`~/.claude/projects/`, at most the 5 most recent sessions per project) and returns
only the synthesized topics, groups, and notebook — the transcripts never enter your main conversation.
Your agent states this trade-off before you choose.

### Guided

Prefer to describe your stack by hand? devcoach asks about each technology and your confidence
(1–3 still learning · 4–6 comfortable · 7–9 strong · 10 expert).

### Import backup

On a new machine? Provide your backup zip path and your whole profile (knowledge map, lessons, settings,
notebook) is imported instantly. See [Backup, export & import](./cli.md#backup-export--import).

### After onboarding

Whichever option you pick, devcoach saves the profile, writes the coaching notebook
(`~/.devcoach/learning-state.md`), and shows a summary grouped by area — ungrouped topics under `Other`:

```
### Languages
- **typescript** — 6/10
- **python** — 4/10

### DevOps
- **docker** — 7/10
- **github_actions** — 6/10

### Other
- **redis** — 3/10

Change any of this later: tell me in chat, use the `devcoach` CLI, or open `devcoach ui`.
```

Prefer the terminal? `devcoach setup` is an interactive wizard — backup path → automatic or manual
topics → optional groups → daily limit and minimum gap — that you can run any time.

## Your first lesson

You work on a task as normal. After your agent responds, devcoach appends a lesson card as the final text
of the reply:

```
### ──────── 🎓 devcoach ────────

**Promise.allSettled vs Promise.all** · TypeScript · Mid

Promise.all rejects the moment any promise rejects, and you lose the results of the ones that
already succeeded. For independent work, reach for Promise.allSettled… [3–6 short paragraphs]

💡 *Senior tip:* map each task to a `{ ok, value }` / `{ ok, error }` result up front so callers
never have to branch on `status` strings.

### ──────── typescript · mid ────────

Did that land? ✅ know (y) · ❌ don't know (n)
```

## The feedback loop

Answer on the line under the card — a bare `y` or `n` is enough — and your reply tunes future coaching:

- **✅ know** (`y`, `yes`) — raises your confidence on that topic by one; you'll see fewer, deeper
  lessons there.
- **❌ don't know** (`n`, `no`) — lowers it by one; devcoach revisits the area sooner.
- **Anything else, or no reply** — no change; the question is dropped silently and you carry on.

## Staying unobtrusive

Coaching is paced: a lesson is cued at most once every `nudge_every` interactions (default 10) per chat
session, and only within the rate limit. Rate limits keep coaching from getting noisy — by default
**≤ 2 lessons/day, ≥ 4 hours apart**. Not what you want? Customize immediately — more aggressive if you
want to learn faster, looser if you prefer fewer interruptions.

Adjust with the terminal:
```bash
devcoach set max_per_day 5           # up to 5 lessons per day
devcoach set min_gap_minutes 60      # as little as 1 hour between lessons
devcoach set nudge_every 5           # cue a lesson every 5 interactions instead of 10
```

Or use the [web dashboard](./web-ui.md) Settings page. Full reference: [Configuration](../reference/configuration.md).

→ Review your progress in the **[CLI](./cli.md)** or the **[web dashboard](./web-ui.md)** — they show the
same data.
