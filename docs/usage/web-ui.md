---
title: Web dashboard
sidebar_label: Web dashboard
description: The devcoach dashboard shows your lessons, knowledge map, courses and settings in your browser, and lets you change them. How to open and stop it, and what each page shows.
---

# Web dashboard

import ThemedShot from "@site/src/components/ThemedShot";
import Clip from "@site/src/components/Clip";
import Scale from "@site/src/components/Scale";
import Peek from "@site/src/components/Peek";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { Cards, Card } from "@site/src/components/Cards";

The dashboard shows your lessons, knowledge map, courses and settings in your browser, and lets you
change them. It is a companion to the [coaching in your agent](./coaching.md) and to the
[CLI](./cli.md): all three read and write the same local database.

<Cards columns={3}>
  <Card label="Nav: Profile" title="Knowledge map" to="#knowledge-map-knowledge">
    Every topic with its confidence bar, which you adjust by clicking.
  </Card>
  <Card label="Nav: Lessons" title="Lessons" to="#lessons-lessons">
    Your whole lesson history to search, filter, sort, star, share and delete.
  </Card>
  <Card label="Click a row" title="A lesson's page" to="#lesson-detail-lessonsid">
    The full lesson, where it happened, and the feedback buttons.
  </Card>
  <Card label="Nav: Courses" title="Courses" to="#courses-courses">
    Every step-by-step course with its progress, one step at a time.
  </Card>
  <Card label="↗ Share · ＋ Import" title="Sharing a lesson" to="#sharing-a-lesson">
    Hand a lesson to a teammate, or add one they sent you.
  </Card>
  <Card label="⚙️ Top right" title="Settings" to="#settings-settings">
    Pacing, theme, backup and restore, and your coaching notebook.
  </Card>
</Cards>

## Launch

```bash title="Open the dashboard"
npx -y devcoach ui              # http://localhost:7860
npx -y devcoach ui --port 8080  # custom port
npx -y devcoach ui --open       # also open it in your default browser
```

Installed devcoach globally or with Homebrew? Drop the `npx -y` and run `devcoach ui`.

- **The URL is a link.** Most terminals open it on a click, or on a Cmd/Ctrl-click.
- **Local only.** The dashboard listens on `127.0.0.1` only, so no other machine can reach it.
- **Where it opens:** your lessons once you have one, the knowledge map before that.
  Settings → *Home page* picks one for good.
- **Port taken?** `devcoach ui` tells you what holds it. A dashboard already running there: open it,
  or `--stop` it. Another program: pick another port with `--port`.

Or ask your agent to *open the devcoach dashboard*: it calls the `open_ui` tool. With the
[Claude Code plugin](../install/claude-code-plugin.md), type `/devcoach:ui`, or `/devcoach:ui 8080`
to pick the port. Claude starts it and gives you the URL, with no install and nothing on your PATH.

## Stop

- **In the terminal that runs `devcoach ui`:** press **Ctrl+C**. The dashboard stops taking new
  requests, gives the ones in progress up to 2 seconds to finish, and exits. A second Ctrl+C exits
  at once.
- **From any terminal:** `npx -y devcoach ui --stop`, with `--port 8080` if you changed the port.
- **Started by your agent** with `open_ui` or `/devcoach:ui`: it runs in the background, so Ctrl+C
  cannot reach it. Ask the agent to close it: type `/devcoach:ui stop`, or say *stop the devcoach
  dashboard*, which calls the `stop_ui` tool. Or use `--stop` as above. Both stop any dashboard on
  that port.

## Profile: the knowledge map {/* #knowledge-map-knowledge */}

Address: `/knowledge`

<Clip
  alt="The knowledge map: Edit is pressed, the plus beside django raises it from 3 (red) to 4 (yellow), and Done leaves edit mode"
  mp4={require("../clips/knowledge-edit.mp4").default}
  webm={require("../clips/knowledge-edit.webm").default}
  poster={require("../clips/knowledge-edit.png").default}
  width={1640}
  height={1026}
/>

The map lists every topic you track, in its group, with a confidence bar from 0 to 10. The bar's
colour is its band, and the band sets how deep the lessons on that topic go:

<Scale
  bands={[
    { from: 0, to: 3, label: "learning", tone: "low" },
    { from: 4, to: 6, label: "intermediate", tone: "mid" },
    { from: 7, to: 10, label: "strong", tone: "high" },
  ]}
  caption={
    <>
      Junior lessons up to 3: from scratch, no jargon. Mid lessons from 4 to 6: the why, the
      alternatives, the trade-offs. Senior lessons from 7 to 9: edge cases, production trade-offs.
      At 10, only something new from the last six months or so.
    </>
  }
/>

- **Where you stand.** Once you have a lesson, the line under the title reads
  `N lessons total · N / max today · N this week`, then *Available now* or why the next lesson has
  to wait.
- **A topic's lessons.** Click a topic name to search your lessons for it.
- **Change your map.** Click **✎ Edit**. Every change saves as you make it; **✓ Done** leaves edit
  mode.

<details>
<summary>What does each button do in edit mode?</summary>

| Button | What it does |
|---|---|
| `+` / `−` beside a bar | Raises or lowers that topic's confidence by 1 |
| `⇄` | Moves a topic to another group |
| `×` beside a topic | Removes the topic |
| `+ topic` in a group's header | Adds a topic to that group |
| `+ Add topic` at the top | Adds a topic, with its confidence and group (Other unless you pick one) |
| `+ Add group` at the top | Creates a group (Languages, DevOps, Frontend…) |
| `×` beside a group's name | Deletes the group; its topics move to Other |

</details>

<details>
<summary>What does the map show before the first lesson?</summary>

- **Not set up yet** (no topic at all): a *Set up devcoach* block. Say *set up devcoach* to your
  agent (with the Claude Code plugin, `/devcoach:setup`). The block also gives the command that
  checks the wiring for the way you installed devcoach: `devcoach doctor` for Homebrew and global npm
  installs, `/devcoach:setup` with the plugin, `npx -y devcoach doctor` otherwise.
- **Set up, no lesson yet**: the map alone. The line with your numbers appears with the first lesson.

</details>

## Lessons {/* #lessons-lessons */}

Address: `/lessons`

<Clip
  alt="The Lessons page: typing cache in the search box, clicking a senior level pill to filter by it, then opening a lesson"
  mp4={require("../clips/lessons-find.mp4").default}
  webm={require("../clips/lessons-find.webm").default}
  poster={require("../clips/lessons-find.png").default}
  width={1640}
  height={922}
/>

Every lesson you received or imported, newest first, 25 to a page.

- **Find a lesson.** Type in the search box, use the filters, or click a level pill or a category
  chip in a row. The filters cover period, feedback, level, category, project and more. Each active
  filter shows as a chip above the table; its `×` removes it.
- **Open it** by clicking anywhere else on its row. **Star it** with `☆`.
- **Share it** with `↗`, which appears at the end of the row when you point at it.
- **Add one someone sent you** with **＋ Import**, at the right of the toolbar. More under
  [Sharing a lesson](#sharing-a-lesson).

<details>
<summary>Which filters are there?</summary>

| Filter | Options |
|---|---|
| Period | All time / Today / Last 7 days / Last 30 days / Last year / Custom range (the dates take an optional time: `2026-04-25T14:30`) |
| Feedback | All feedback / ✓ Knew it / 💡 Understood / ✗ Couldn't follow / — No response |
| Level | All levels / 🟢 Junior / 🟡 Mid / 🔴 Senior |
| Filters | Category / Project / Repository / Branch / Commit |
| Starred | Starred only |
| Shared | All lessons / 👤 My own / 🤝 Shared with me / 🤝 from `<name>` (one entry per sender) |
| Search | Free text (also matches the sender of a shared lesson) |

When the filters hide every lesson, the page names them
(*No lessons match 🔍 "kafka" in 🕐 Last 7 days.*) and offers **Clear every filter** and, when a
period or a date range is set, **Search all time**, which drops only that.

</details>

<details>
<summary>Which columns are there, and how do I sort and resize them?</summary>

- **Columns:** ★, Date, Topic, Title, Level, Categories, Feedback, Share (`↗`). A narrower
  window hides Feedback first (under 1280 px), then Categories (under 1024 px), then Topic (under 640 px).
- **Topic** carries `🤝 <sender>` under it for a lesson someone shared with you. **Feedback** shows
  `✓ Knew it`, `💡 Understood` or `✗ Couldn't follow`, or nothing yet.
- **Sort:** click the Date, Topic, Title, Level or Feedback header; click again to reverse.
- **Resize:** in a wide window, drag the line between two headers. The column on one side grows as
  much as the other shrinks, so the table keeps its width; the title never gets too narrow to read.
  Widths are remembered in this browser, and dropped when they no longer fit the window. Double-click a line to reset the two columns beside it, or
  use **⋯ → Reset column widths**.

</details>

<details>
<summary>How do I delete lessons, and what else is under ⋯?</summary>

**⋯** (at the right of the toolbar) holds two actions:

- **Delete lessons…** turns the star column into checkboxes. Clicking a row now ticks it instead of
  opening it (the header checkbox ticks the whole page), and a bar at the bottom shows *N selected*
  with **Delete selected**. After one confirmation the list reloads with the same filters and page.
  Esc or **✕ Cancel** leaves this mode without deleting anything, and a reload always leaves it.
  Deleting is permanent. You can delete a lesson someone shared with you too; importing the same share
  later adds it again.
- **Reset column widths**: see *Which columns are there* above.

</details>

<details>
<summary>What does the list show before the first lesson?</summary>

With no lesson and no filter, the page says when lessons come (the pacing from Settings), asks you to
set up your profile if you haven't, and gives the diagnostic command for your install with a
**Copy** button.

</details>

## Lesson detail {/* #lesson-detail-lessonsid */}

Address: `/lessons/<id>`

<ThemedShot
  alt="A lesson's page: title row, metadata, TL;DR, the lesson with its code, context, where it happened, the feedback buttons and the ID"
  light={require("../screenshots/lesson-docker-layer-cache-light.png").default}
  dark={require("../screenshots/lesson-docker-layer-cache-dark.png").default}
/>

On a small screen, click the picture to see it at full size. From top to bottom:

1. **Title row:** star, title, level pill, **⋯** and **↗ Share**. Click the pill to list that level;
   🗑 Delete lesson… is under **⋯**. `← Back to lessons` is above the card.
2. **Metadata:** date, topic, categories and, once you answer, your answer with **Clear**. Point at
   the date for the exact time. A shared lesson adds `🤝 shared by <name>`, a lesson that seeded a
   course a `🎓 Course · N/M` link.
3. **TL;DR:** the lesson in one sentence.
4. **The lesson,** with highlighted code.
5. **Context:** the task you were doing, when it was recorded.
6. **Where it happened:** project, repo, branch, commit, folder. The repository and the commit open
   on GitHub, GitLab or Bitbucket; the folder and a local repository open in VS Code.
7. **Feedback buttons,** gone once you answer. Only **✓ I knew this** changes something now: your
   confidence on the topic goes up by one, and **Clear** takes it back. More on
   [the three answers](./coaching.md#the-feedback-loop).
8. **ID,** for `devcoach lesson <id>` and the other commands that take one.

## Courses {/* #courses-courses */}

Address: `/courses`

<Clip
  alt="A course page: the step list at the left, the document on its current step; clicking step 3 switches to it, and Mark done moves the progress to 3 of 5"
  mp4={require("../clips/course-steps.mp4").default}
  webm={require("../clips/course-steps.webm").default}
  poster={require("../clips/course-steps.png").default}
  width={1640}
  height={1074}
/>

**Courses** lists every step-by-step [course](./courses.md) with its status, its progress and the
lesson it grew from. A course page shows its document one step at a time, under a bar that stays in
view. On the bar: back, title, status, progress and **⋯ → Delete course…**, which removes the course
and its folder and keeps the lesson.

- **The step list:** **Mark done**, **Skip** or **Reopen** a step, or click one to show it without a
  reload. *About this course* opens the goal, the lesson it grew from and the ✓/✗ prerequisites.
- **The document** follows the dashboard's light or dark theme. Its frame takes the height of the
  step, so the page scrolls, not the frame. It runs sandboxed, also when you open it on its own.
  See [what it can do](./courses.md#the-dashboard).

## Sharing a lesson

<Tabs>
  <TabItem value="share" label="↗ Share" default>
    <Clip
      alt="Sharing from the Lessons page: the arrow at the end of a row opens the share popover with your name, Include where it happened, and Copy text, Copy link, Download .md; Copy link turns to Copied"
      mp4={require("../clips/share-lesson.mp4").default}
      webm={require("../clips/share-lesson.webm").default}
      poster={require("../clips/share-lesson.png").default}
      width={1640}
      height={922}
    />
  </TabItem>
  <TabItem value="import" label="＋ Import">
    <Clip
      alt="Importing: Import opens a box, a lesson code is pasted, and the imported lesson opens with a confirmation and shared by Sam; back in the list it is first, with Sam under its topic"
      mp4={require("../clips/import-lesson.mp4").default}
      webm={require("../clips/import-lesson.webm").default}
      poster={require("../clips/import-lesson.png").default}
      width={1640}
      height={922}
    />
  </TabItem>
</Tabs>

- **Share:** **↗ Share** on a lesson's page, or `↗` at the end of its row to stay on the list. The
  panel holds your name, *Include where it happened* and three buttons: **Copy text**,
  **Copy link**, **Download .md**. Your name comes from the *Your name* setting, else from your git
  `user.name`. Edit it, or empty it to share anonymously. *Include where it happened* is off by
  default.
- **Import:** **＋ Import** on the Lessons page takes a code, a link, a web address, the whole copied
  card or a lessons JSON export. It also takes a `.devcoach.md` file, which you pick or drop
  anywhere on the page. A share link's **Import** button opens a preview here instead; nothing is
  saved until you click **Add to my lessons**.
- **A shared lesson** shows its sender under the topic and a `🤝 shared by` line on its page. The
  **🤝 Shared** filter lists them, per sender too. It never counts against your daily limit.

What each way carries, what travels with a lesson and how an imported lesson behaves:
[Sharing lessons](./sharing.md).

## Settings {/* #settings-settings */}

Address: `/settings`

<Peek show={0.37} label="Show the coaching notebook">
  <ThemedShot
    alt="Settings: the Coaching form and the Backup & Restore panel, then the coaching notebook"
    light={require("../screenshots/settings-light.png").default}
    dark={require("../screenshots/settings-dark.png").default}
  />
</Peek>

⚙️ **Settings**, at the top right of every page, opens it. The theme button beside it shows the theme
you see now. It switches the theme in this browser only, until you save a theme here. *System*
follows your OS as it changes. The page has three panels.

**Coaching** holds the seven settings, applied with *Save settings*:

| On the form | Setting |
|---|---|
| Max lessons per day | `max_per_day` |
| Minimum gap between lessons | `min_gap_minutes` |
| Interactions between lessons | `nudge_every` |
| Count interactions | `nudge_scope` |
| Your name (for sharing) | `share_name` |
| UI theme | `ui_theme` |
| Home page | `ui_home` |

What each one does, its range and its default:
[Configuration](../reference/configuration.md#settings).

:::warning[The gap is a list of 12 choices]

*No cooldown*, 15 or 30 minutes, 1 hour, 1 hour 30 min, and 2, 3, 4, 6, 8, 12 or 24 hours. A gap
set elsewhere to another value, say 100 minutes, shows as *No cooldown*, and saving the form then
stores 0. Pick the gap again before you save.

:::

**Backup & Restore** does what [`devcoach backup` and `restore`](./cli.md#backup-export--import) do:
move your profile to another machine, or keep a copy before a big change.

- **Download backup:** a zip with your settings, knowledge map, lessons, notebook and courses. It
  is not encrypted.
- **Restore backup:** adds what you are missing from a backup zip, and never removes a lesson, a
  topic or a course. Your settings, your notebook and the confidence of topics you both have take
  the backup's values ([details](../reference/configuration.md#backup-strategy)).
- **Download lessons** and **Import lessons:** your lessons alone, as JSON, and back. An import skips
  the lessons you already have.

**Coaching Notebook** shows `~/.devcoach/learning-state.md`, the notes devcoach keeps on how you
learn. It is read-only here: *Preview* / *Source* switch the view, **↓ Download** saves a copy, and
*Open in VS Code* opens the file in VS Code.
