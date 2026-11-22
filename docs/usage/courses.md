---
title: Courses
sidebar_label: Courses
description: "A course is a step-by-step path from a lesson you couldn't follow: how it starts, how the coach finds where you stand, and where the course lives."
---

# Courses

import ThemedShot from "@site/src/components/ThemedShot";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { Chat, Say, Choices } from "@site/src/components/Chat";
import { DemoCourse } from "@site/src/components/Tour";
import Clip from "@site/src/components/Clip";
import FileTree from "@site/src/components/FileTree";
import Terminal from "@site/src/components/Terminal";
import cli from "@site/src/data/cli-output.json";

**Couldn't follow a lesson? devcoach makes you a course.** When a lesson is too much for one
session, another lesson at the same level doesn't help. A course is a step-by-step path that starts
where you actually stand, and devcoach finds that starting point by asking.

Courses run where the devcoach skill runs: Claude Code, Gemini CLI (beta) and Codex CLI (beta). The
coach writes the course with your agent's own file tools.

## From ❌ to a course

This is one course from start to finish. The lesson, the chain of concepts and the course are the
documentation's demo data; the questions are worded as an example.

### 1 · You say you couldn't follow

Under every lesson card you answer with one letter. Answer `n` and the coach offers a course, once.

<Chat label="After a lesson on cache stampedes">
  <Say who="coach">Did that land? ✅ knew it (y) · 💡 understood (u) · ❌ couldn't follow (n)</Say>
  <Say who="you">n</Say>
  <Say who="coach">Want a step-by-step course on this? 🎓</Say>
  <Say who="you">yes</Say>
</Chat>

Say yes and it begins right there. Say nothing and nothing happens: the lesson is kept as a seed,
and you can start the course whenever you like ([other ways to start](#other-ways-to-start)).

### 2 · It asks what you already know

One question per message, from the target concept down to the ground you stand on. A *no* goes one
level down; a *yes* is the floor the course starts from.

<Chat label="Finding where to start">
  <Say who="coach">To explain how to stop a **cache stampede** I first need **single-flight rebuilds**. Do you know what it means to let one request rebuild a key while the others wait?</Say>
  <Choices options={["Yes", "Roughly", "No"]} picked="No" />
  <Say who="coach">Under that sits **the thundering herd**. Do you know what happens when many readers miss the cache at the same moment?</Say>
  <Choices options={["Yes", "Roughly", "No"]} picked="No" />
  <Say who="coach">And under that, **cache keys with a TTL**. Do you know what a TTL does to a cached value?</Say>
  <Choices options={["Yes", "Roughly", "No"]} picked="Yes" />
  <Say who="coach">So: cache keys with a TTL ✓ → the thundering herd ✗ → single-flight rebuilds ✗. I'll start from one key and its readers.</Say>
</Chat>

In Claude Code the three answers come as selectable choices, so you click rather than type; Gemini
and Codex get the same question as text. *Roughly* counts as known, with a short refresher as the
first step. The chain stops at something you know, at a topic your profile rates 6 or more out of
10, or after five levels.

### 3 · It writes your course

It plans bottom-up from that floor to the target: three to seven short steps, one idea each. Then
it writes the course as **one rich, self-contained HTML document** on your machine, which shows one
step at a time, with the step menu at the side and *Previous / Next* at the bottom. This is the
course that conversation produced. It is the real document, and it runs here:

<div className="margin-bottom--lg">
  <DemoCourse
    caption={{
      still: "The course in the dashboard, on its third step. Run it to move through the steps yourself.",
      running: "The course document itself, framed here as the dashboard frames it. In the dashboard your progress is saved step by step.",
    }}
    shot={{
      light: require("../screenshots/course-cache-stampede-light.png").default,
      dark: require("../screenshots/course-cache-stampede-dark.png").default,
    }}
  />
</div>

Every step has the idea, a worked example (drawn from the work that triggered the lesson when it
can), a *Try it* box and a *Check yourself* question with a reveal.

### 4 · It teaches one step per message

Back in the chat, each step gets one message: the idea in a few lines, a pointer to the step in the
dashboard, then the check question.

<Chat label="Step 1 of 5">
  <Say who="coach">**One key, many readers.** A cache key with a TTL is a promise with a deadline: until the deadline every reader gets the copy; after it, the first reader finds nothing and goes to the origin. With a hot key the first reader is not alone. The step is open in your dashboard.</Say>
  <Say who="coach">A hot key expires and the rebuild takes 300 ms. Who calls the origin?</Say>
  <Choices
    stacked
    options={[
      "The first reader only, the others wait for its result",
      "Every reader that arrives during those 300 ms",
      "Nobody: the cache keeps serving the old value",
    ]}
    picked="Every reader that arrives during those 300 ms"
  />
  <Say who="coach">Right. Step 1 is done: 1 of 5.</Say>
</Chat>

A correct answer marks the step done and moves on. A wrong one gets a fresh angle, never a silent
skip; after two misses the coach offers to split the step in two, right there in the document.
Check questions come as choices when the answer is a pick (an order, a yes/no, one of a few
candidates) and as free text when you have to write an output or an explanation.

<a id="what-happens-next" />

- Say *skip* to skip a step, *later* to pause; `/devcoach:course continue` resumes.
- While a course is active, the usual lesson cues pause, so nothing interrupts the conversation.
- At the end, if the course grew from a lesson you couldn't follow, it offers once to mark that
  lesson as understood.

## Other ways to start

You don't have to wait for a ❌. Start a course on any lesson, or on any concept at all:

```text title="In Claude Code (plugin)"
/devcoach:course                       # from the newest lesson you couldn't follow
/devcoach:course node error event      # from the lesson those words describe
/devcoach:course logarithms            # from a concept, when no lesson matches
/devcoach:course continue              # pick up the active course
```

With nothing after it, `/devcoach:course` takes the newest lesson you couldn't follow, or your
newest lesson when there is none.

In any agent, just ask: *"explain this properly"*, *"teach me X from the basics"*, *"start a course
on the HTMX redirect lesson"*.

- **You never need a lesson's id.** A few words of its title are enough (every word has to match
  somewhere, in any order). When several lessons match, you pick one from a list, or choose *none*
  for a free concept.
- **If that lesson already has a course**, the coach asks first: continue it (if it is still
  active), redo it, keep both, or cancel.

## What is in a course

**Code in the lesson's own language.** JavaScript examples are editable and really run in the
page. A Java, Rust, Go, Python or Swift course keeps its snippets read-only and makes you predict
the output, fill a blank, spot the bug, or drive a simulation of the concept instead.

**An optional copy as a Claude artifact.** Right after writing the document, and only in a client
that has the Artifact tool, the coach offers once to publish the same file as a Claude artifact — a
copy you can share by link:

<Chat label="The offer, in the devcoach skill's words">
  <Say who="coach">*Publish this course as a Claude artifact too? That **uploads a copy to claude.ai** — it leaves this machine. Only you can open it until you share the link.* *It mentions lolcoach and the hang you debugged.*</Say>
  <Choices options={["Yes", "No"]} />
</Chat>

**Saying yes uploads that copy to claude.ai: it is the one case where course content leaves your
machine.** The link is private until you share it, but the file then lives on Anthropic's
servers under your account, and a course often quotes your own work (project names, paths,
snippets from the task that started it) — the coach tells you what this one contains when it
asks. Say no and nothing is uploaded. The local file stays the course either way; devcoach
records nothing about the artifact, so you manage or delete it from your artifacts on claude.ai.
[Privacy & security](../reference/privacy.md#publishing-a-course-as-an-artifact) has the full
statement.

## Where it lives

Everything stays on your machine, next to your lessons (the only exception is an artifact you
chose to publish, above):

<FileTree
  root="~/.devcoach/"
  items={[
    { name: "coaching.db", note: <>the course's index and progress (tables <code>courses</code>, <code>course_steps</code>)</> },
    { name: "courses/", children: [
      { name: "<course-id>/", children: [
        { name: "index.html", note: "the course document, written by the AI with its own file tools, never pasted into the chat" },
      ] },
    ] },
  ]}
/>

Backups include both, and `devcoach restore` puts them back.

## The dashboard

<Clip
  alt="A course page in the dashboard: clicking steps 2 and 3 in the step list switches the document to each step, then Mark done on step 3 moves the progress from 2/5 to 3/5"
  mp4={require("../clips/course-steps.mp4").default}
  webm={require("../clips/course-steps.webm").default}
  poster={require("../clips/course-steps.png").default}
  width={1640}
  height={1074}
/>

**Courses** in the top nav lists every course with its progress and the lesson it grew from. A
course page shows the prerequisite chain (✓ known, ✗ unknown), the step list with *Mark done* /
*Skip* / *Reopen* (click a step and the document switches to it) and the document itself, one
step at a time. The frame grows to fit the document, so you scroll the page, not a box. The lesson
page links to its course with the current progress. Deleting a course (⋯ → Delete course…) removes
its rows and its folder; the lesson stays.

:::note[Is a course safe to open?]

The coach wrote the document, so the dashboard confines it. It shows the document in a sandboxed
frame (`sandbox="allow-scripts allow-forms"`) and serves it with a Content-Security-Policy that
applies the same sandbox when you open its dashboard address in a tab of its own (opened straight
from disk, the file is an ordinary local page). The document cannot load anything from the network
(no fetch, no scripts, images or fonts from the web), post a form, open a window, or read or change
the dashboard. Scripts inside it do run, `eval` included, on purpose: that
is what makes the editable JavaScript examples work, and the sandbox leaves them nothing of yours to
reach. Like any page, it can still follow a link, which replaces the course in its frame.

:::

<Tabs>
  <TabItem value="list" label="Courses" default>
    <ThemedShot
      alt="The Courses list: an active course at 2/5 with the lesson it grew from, and a completed one"
      light={require("../screenshots/courses-light.png").default}
      dark={require("../screenshots/courses-dark.png").default}
    />
  </TabItem>
  <TabItem value="backoff" label="A completed course">
    <ThemedShot
      alt="A completed course on its jitter step: three retry schedules plotted over the attempt number"
      light={require("../screenshots/course-backoff-jitter-light.png").default}
      dark={require("../screenshots/course-backoff-jitter-dark.png").default}
    />
  </TabItem>
</Tabs>

The two courses on this page are the documentation's own demo: charts and diagrams are plain SVG
that the document draws from a function, so they follow the theme like everything else.

## CLI

`devcoach courses` lists your courses with their progress; `devcoach course <id>` shows one: the
chain, the steps and where the document is. On the demo data:

<Terminal
  command="devcoach courses"
  output={cli.courses}
  caption="The table is wider than this column: scroll it sideways for the status and the date."
/>

<Terminal command="devcoach course from-a-cache-miss-to-a-stampede" output={cli.course} />

## Editing a course document

The coach writes the course and registers each of its steps; you can still polish the document
yourself. It is plain HTML: edit `index.html` in its folder, and the dashboard shows the change the
next time you open the course. Keep it working in the dashboard:

| Keep | Why |
|---|---|
| Inline styles and scripts only: no external URLs, no forms, no `alert` / `confirm` | The frame blocks all of those |
| The one-section-at-a-time script and the `nav.steps` menu | The dashboard hides the menu and switches steps from its own list |
| Colours as CSS variables on `:root` | They follow the light and dark themes, in the dashboard and on their own |
| A new section registered with the agent (`add_course_step`) | Only registered sections appear in the step list; any other stays as extra reading |

<details>
<summary>For course authors: code highlighting, the colour tokens and what the dashboard adds</summary>

**Code is highlighted.** A course that shows code carries highlight.js (BSD-3-Clause) inside the
file: devcoach fills a placeholder the document leaves for it, licence text included, so the code is
coloured in the dashboard, from disk and in a published artifact alike. Colours follow the palette
and the theme. Documents written before this existed are highlighted by the dashboard when it serves
them; the file on disk stays as it was. A course without code never carries the library, and a
backup stores the placeholder rather than one copy of the library per course: restore puts it back,
so a restored course is self-contained again. See
[`THIRD_PARTY_NOTICES.md`](https://github.com/UltimaPhoenix/dev-coach/blob/main/THIRD_PARTY_NOTICES.md).

**Colour tokens.** `--bg --panel --text --muted --line --code-bg --accent --accent-soft --on-accent
--ok --ok-soft --warn --warn-soft --log-bg --log-text`, set for light, for
`@media (prefers-color-scheme: dark)` and for `:root[data-theme="dark"]`. A course **conforms to the
dashboard's palette without copying it**: the neutrals are the dashboard's, the accent is the
course's own. Opened on its own, the document follows your OS and has its own light/dark switch;
inside the dashboard that switch is hidden, and the document follows the dashboard's theme toggle,
with the dashboard's neutrals.

**What the dashboard adds, and the one thing devcoach writes.** The dashboard opens the file with
`data-embedded` set, which hides the menu, and appends a small script that reports the frame's
height and current step. Those additions are never written to the file. The one write devcoach makes
to a course document is filling the highlighter placeholder, when a step is registered or its
progress changes (the dashboard's *Mark done* included).

</details>
