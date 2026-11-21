---
title: Web dashboard
sidebar_label: Web dashboard
---

# Web dashboard

import ThemedShot from "@site/src/components/ThemedShot";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";
import { Cards, Card } from "@site/src/components/Cards";
import Peek from "@site/src/components/Peek";

**What it's for:** a visual interface for everything the [CLI](./cli.md) does — browse and filter your
lesson history at a glance, adjust your knowledge map by clicking, and import/export backups. It's a
companion to the automatic [coaching in your agent](./coaching.md), reading and writing the same local
database.

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

Installed devcoach globally or via Homebrew? Drop the `npx -y` and just run `devcoach ui`.

- **The URL is a link.** It is printed as a clickable link in terminals that support OSC 8 hyperlinks
  (iTerm2, Ghostty, WezTerm, Kitty, VS Code, Windows Terminal, GNOME Terminal); elsewhere cmd/ctrl-click
  the plain URL. `--open` launches your default browser as well.
- **Local only.** The dashboard binds to `127.0.0.1` only, so it is never reachable from other machines.
- **Port taken?** `devcoach ui` tells you whether a dashboard is already running there (open it, or
  `--stop` it) or another process holds the port (pick `--port`).

Or let Claude open it for you via the MCP tool:

```
open_ui({ port: 7860 })
```

Using the [Claude Code plugin](../install/claude-code-plugin.md)? It ships a shortcut for exactly that —
type `/devcoach:ui` (optionally with a port, e.g. `/devcoach:ui 8080`) and Claude starts the dashboard
and hands you the URL. No install, no PATH needed.

## Stop

```bash title="Stop a dashboard from any terminal"
npx -y devcoach ui --stop              # the one on port 7860
npx -y devcoach ui --stop --port 8080  # if you changed the port
```

- In the terminal that runs `devcoach ui`: **Ctrl+C**. The shutdown is graceful — the server stops
  accepting, lets requests in flight finish (up to 2 s), then exits; a second Ctrl+C exits at once.
- A dashboard started by your agent (`open_ui`, `/devcoach:ui`) runs detached, so Ctrl+C cannot reach
  it: ask the agent to close it (`/devcoach:ui stop`, or *"stop the devcoach dashboard"* → the
  `stop_ui` tool), or run `devcoach ui --stop` (add `--port` if you changed it). Both work on any
  dashboard listening on that port.

---

## Pages

- **Top nav:** **Profile** (`/knowledge`), **Lessons** and **Courses**.
- **Top right:** the ⚙️ **Settings** button, and the sun/moon button. It shows the **current** theme and
  switches it for this browser. The choice holds until you save a theme in Settings; with *System* the
  dashboard follows your OS live.
- **The root URL** (`/`, what `devcoach ui` prints) opens **Lessons** once you have at least one lesson
  and the **knowledge map** before that; pick one explicitly under Settings → Home page.

### Knowledge map (`/knowledge`)

<ThemedShot
  alt="Knowledge map"
  light={require("../screenshots/knowledge-map-light.png").default}
  dark={require("../screenshots/knowledge-map-dark.png").default}
/>

Your full knowledge map, with a colour-coded confidence bar per topic:

| Colour | Confidence | Meaning |
|---|---|---|
| **Green** | ≥ 7 | strong |
| **Yellow** | 4–6 | intermediate |
| **Red** | ≤ 3 | learning |

**What you can do here:**

- **Read where you stand.** The stats bar at the top of the page (once there is a lesson) shows
  `N lessons total · N / max today · N this week`, then whether a lesson is available now — or why not.
- **Jump to a topic's lessons.** In view mode, topic names are clickable links that filter the lessons
  page to show only lessons for that topic.
- **Personalize your profile.** Click `✎ Edit` to enter edit mode. Changes save immediately as you edit.

<details>
<summary>What does each button do in edit mode?</summary>

| Button | What it does |
|---|---|
| `+` / `−` beside each bar | **Adjust confidence** — tune your self-assessment by 1 point |
| `⇄` | **Reorganise topics** — moves a topic to a different group |
| `×` beside a topic | **Remove topics** — deletes a topic you no longer care about |
| `+ topic` in a group header | **Add topics** — adds directly to that group |
| `+ Add topic` at the top | **Add topics** — adds to Other |
| `+ Add group` at the top | **Create groups** — organise new categories (Languages, DevOps, Frontend, etc.) |
| `×` beside a group name | **Delete groups** — its topics move to Other |

</details>

<details>
<summary>What does the map show before the first lesson?</summary>

The page says what to do next instead of showing a blank map:

- **Not set up yet** (no topic at all): a *Set up devcoach* block — say *"set up devcoach"* to your
  agent (with the Claude Code plugin, `/devcoach:setup`). It also gives the one command that checks
  the wiring for the way you installed devcoach: `devcoach doctor` for Homebrew and global npm
  installs, `/devcoach:setup` under the plugin, `npx -y devcoach doctor` otherwise.
- **Set up, no lesson yet**: the map alone; the stats bar appears with the first lesson.

</details>

---

### Lessons (`/lessons`)

<ThemedShot
  alt="Lessons"
  light={require("../screenshots/lessons-light.png").default}
  dark={require("../screenshots/lessons-dark.png").default}
/>

Filterable, sortable table of all delivered lessons.

**What you can do here:**

- **Find a lesson.** Search in free text, filter by period, feedback, level, category, project and more,
  and sort by a column. Active filters show as chips above the table.
- **Star it.** `★` toggles starred.
- **Share it.** `↗` appears when you hover the row and shares the lesson from a popover right next to
  the icon, without leaving the list.
- **Filter by what you see.** Click a level pill or category chip to filter the table by it.
- **Open it.** Click anywhere else on the row to open the detail page; feedback is recorded there.
- **Add a lesson someone shared with you.** **＋ Import** (toolbar, right): paste the code, the link, a
  URL, or the whole copied card into the box, pick a `.devcoach.md` file, or simply **drop the file
  anywhere on the page**. See [Sharing a lesson](#sharing-a-lesson).

<details>
<summary>Which filters are there?</summary>

| Filter | Options |
|---|---|
| Period | All time / Today / Last 7 days / Last 30 days / Last year / Custom range (the date range accepts an optional time: `2026-04-25T14:30`) |
| Feedback | All feedback / ✓ Knew it / 💡 Understood / ✗ Couldn't follow / — No response |
| Level | All levels / 🟢 Junior / 🟡 Mid / 🔴 Senior |
| Filters popover | Category / Project / Repository / Branch / Commit |
| Starred | Starred only |
| Shared | All lessons / 👤 My own / 🤝 Shared with me / 🤝 from `<name>` (one entry per sender) |
| Search | Free text (also matches the sender of a shared lesson) |

When the active filters hide every lesson, the page names them
(*No lessons match 🔍 "kafka" in 🕐 Last 7 days.*) and offers **Search all time** (drops the period
or date range, keeps the rest — shown only when one is set) and **Clear every filter**.

</details>

<details>
<summary>Which columns are there, and how do I sort and resize them?</summary>

- **Table columns:** ★, Date, Topic, Title, Level, Categories, Feedback, ↗ — the title gets the width
  (categories wrap onto a second line when needed); the feedback cell shows `✓ Knew it` / `💡 Understood` / `✗ Couldn't follow`
  (or nothing yet); `↗` opens the Share panel right there; a shared lesson shows `🤝 <sender>`
  under its topic.
- **Sort:** click the Date, Topic, Title, Level or Feedback column header. Ascending or descending.
- **Pagination:** 25 per page.

**Resizable columns** — on desktop widths, drag the boundary between two column headers: the column
on one side grows exactly as much as its neighbour shrinks, so the table never changes width and no
column can be pushed out of view. The title column takes whatever its neighbours give or take and never
drops below a readable width. Widths are remembered in this browser (and dropped if they no longer fit
the window); double-click a boundary to reset the two columns beside it, or use **⋯ → Reset column
widths**.

When the Date column gets narrow, dates switch to a compact form: `17m`, `today`, `Mon 2` within the
last week, then `Sep 10`. Lessons two months old or older show their date instead of a relative label:
`July 3` within the current year, `July 3, 2025` for earlier years (compact: `Jul 2025`).

</details>

<details>
<summary>How do I delete lessons, and what else is under ⋯ More?</summary>

**⋯ More** (toolbar, right) — the rare actions live behind this button so the toolbar stays calm:

- **Delete lessons…** — deleting is deliberately hidden until you ask for it. The star column turns
  into checkboxes, clicking a row now ticks it instead of opening it (the header checkbox ticks the
  whole page), and a bar at the bottom shows *N selected* with **Delete selected**. One
  confirmation, then the list reloads with the same filters and page. Esc or **✕ Cancel** (toolbar
  or bar) leaves the mode without deleting anything; it is never remembered across reloads. Deleting is permanent; a lesson
  someone shared with you can be deleted too, and the same share is accepted again if you import it
  later.
- **Reset column widths** — see *Resizing columns* above.

</details>

<details>
<summary>What does the list show before the first lesson?</summary>

With no lesson at all and no filter, the page says when lessons come (the pacing from Settings), asks
you to set up your profile if you haven't, and gives the diagnostic command for your install with a
**Copy** button.

</details>

---

### Lesson detail (`/lessons/<id>`)

<Tabs>
  <TabItem value="docker" label="Docker layer caching (Junior)" default>
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="Docker layer caching"
        light={require("../screenshots/lesson-docker-layer-cache-light.png").default}
        dark={require("../screenshots/lesson-docker-layer-cache-dark.png").default}
      />
    </Peek>
  </TabItem>
  <TabItem value="postgres" label="PostgreSQL EXPLAIN ANALYZE (Mid)">
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="PostgreSQL EXPLAIN ANALYZE"
        light={require("../screenshots/lesson-postgresql-explain-analyze-light.png").default}
        dark={require("../screenshots/lesson-postgresql-explain-analyze-dark.png").default}
      />
    </Peek>
  </TabItem>
  <TabItem value="rebase" label="Git interactive rebase (Mid)">
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="Git interactive rebase"
        light={require("../screenshots/lesson-git-interactive-rebase-light.png").default}
        dark={require("../screenshots/lesson-git-interactive-rebase-dark.png").default}
      />
    </Peek>
  </TabItem>
  <TabItem value="cicd" label="CI/CD pipeline stages (Senior)">
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="CI/CD pipeline stages"
        light={require("../screenshots/lesson-ci-cd-pipeline-stages-light.png").default}
        dark={require("../screenshots/lesson-ci-cd-pipeline-stages-dark.png").default}
      />
    </Peek>
  </TabItem>
  <TabItem value="stampede" label="Cache stampede (Senior)">
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="Cache stampede"
        light={require("../screenshots/lesson-redis-cache-stampede-light.png").default}
        dark={require("../screenshots/lesson-redis-cache-stampede-dark.png").default}
      />
    </Peek>
  </TabItem>
</Tabs>

Full lesson content laid out in reading order.

**What you can do here:**

- **Read the lesson.** The TL;DR callout first, then the full body with syntax-highlighted code blocks.
- **Answer it.** The feedback buttons sit below the lesson and disappear once feedback is recorded.
- **Go back to the code.** The git metadata row links to the repository, the commit and the project
  folder, so you can immediately review the code that triggered the lesson.
- **Star, share or delete it.** All three are in the title row.

<details>
<summary>What is on a lesson's page, from top to bottom?</summary>

| Part | What it shows |
|---|---|
| **Title row** | `← Back to lessons`, star toggle, title, level pill (Junior / Mid / Senior), **↗ Share**, and the same **⋯ More** button as the Lessons toolbar, holding the rare actions — today **🗑 Delete lesson…** (asks for confirmation, then returns to the list) |
| **Metadata row** | relative date with tooltip, topic ID, category chips, feedback badge + Clear; a lesson someone shared with you also shows `🤝 shared by <name>` |
| **TL;DR callout** | one-sentence summary in a highlighted box, always visible above the body |
| **Lesson body** | full markdown content with syntax-highlighted code blocks |
| **Task context** | a `Context:` line with the coding task that triggered the lesson (when available) |
| **Git metadata** | a row of lowercase labels, `project · repo · branch · commit · folder`, linking back to where the lesson came from (next table) |
| **Feedback buttons** | `✓ I knew this` / `💡 Understood` / `✗ Couldn't follow` (hidden once feedback is recorded) |
| **ID line** | the full lesson ID, for `devcoach lesson <id>` and friends |

</details>

<details>
<summary>Where do the git metadata labels lead?</summary>

| Label | What it is |
|---|---|
| **project** | the folder name where you were working |
| **repo** | link with a platform icon (GitHub, GitLab, Bitbucket, or local). Click to open the remote repository in your browser or view local details |
| **branch** | the git branch you were on when the lesson was taught |
| **commit** | the exact commit (clickable to view on GitHub/GitLab/Bitbucket or as a local hash) |
| **folder** | a VS Code icon link that opens the project folder in VS Code, so you can immediately review the code that triggered the lesson |

</details>

---

### Courses (`/courses`)

<Tabs>
  <TabItem value="courses" label="Courses" default>
    <ThemedShot
      alt="The Courses list"
      light={require("../screenshots/courses-light.png").default}
      dark={require("../screenshots/courses-dark.png").default}
    />
  </TabItem>
  <TabItem value="course" label="A course page">
    <Peek label="Show the whole step">
      <ThemedShot
        alt="A course page: sticky bar, pinned step list, the document on its current step"
        light={require("../screenshots/course-cache-stampede-light.png").default}
        dark={require("../screenshots/course-cache-stampede-dark.png").default}
      />
    </Peek>
  </TabItem>
</Tabs>

Every step-by-step [course](./courses.md) with its progress, its status and the lesson it grew
from.

**What you can do here:**

- **Open a course.** A course page is the document itself, one step at a time, with a slim sticky bar
  on top (back · title · status · progress · **⋯**) and a pinned step list at the side.
- **Move through its steps.** **Mark done** / **Skip** / **Reopen** in the step list; clicking a step
  switches the document to that section without a reload. *About this course* folds away the goal, the
  seed lesson and the ✓/✗ prerequisite chain.
- **Delete it.** The **⋯** menu holds **Delete course…** — rows and folder go, the seed lesson stays.
- **Reach it from its lesson.** A lesson that seeded a course shows a `🎓 Course · N/M` link in its
  metadata row.

:::note[The course document's frame]

The document sits in a sandboxed frame (`sandbox="allow-scripts allow-forms"` plus a
`Content-Security-Policy` that also sandboxes it when opened on its own: no network, no form posts,
no navigation out — `eval` is allowed so editable JS examples can run). The frame grows to the height
of the step it shows, so the page scrolls, never the frame, and the document follows the dashboard's
light/dark toggle.

:::

---

### Sharing a lesson

<Peek label="Show the whole lesson page">
  <ThemedShot
    alt="Share popover"
    light={require("../screenshots/lesson-share-light.png").default}
    dark={require("../screenshots/lesson-share-dark.png").default}
  />
</Peek>

A lesson that landed for you is worth handing to a teammate. **↗ Share** on a lesson (or `↗` in the
table, which opens the same panel in a popover next to the row) shows your name (prefilled from `share_name`, then git), an *Include where it
happened* checkbox (project, branch, commit and task context — **off by default**, and a local folder
path is never exported), and three ways to hand it over — all carrying the same lesson:

| Transport | What you get | Best for |
|---|---|---|
| **Copy text** | The lesson card as markdown, then one `devcoach:lesson:1:…` line | Chat, issues, email — the receiver pastes the whole thing anywhere devcoach accepts input |
| **Copy link** | `https://ultimaphoenix.github.io/dev-coach/lesson#devcoach:lesson:1:…` | Messaging: the receiver sees the lesson in the browser and imports it with one click |
| **Download .md** | `<lesson-id>.devcoach.md` — YAML front matter + the markdown body | Files, pull requests, wikis — renders on GitHub, opens in any editor |

What travels, how the link works and what an imported lesson does to your pacing are in the
[Sharing lessons](./sharing.md) guide.

**Receiving** — every way in leads to the same place:

- **＋ Import** on the Lessons page: paste the code, the link, a URL whose body is a shared lesson
  (a raw gist, a file in a repo), the whole copied card, or a lessons JSON export; pick a
  `.devcoach.md`; or **drop the file anywhere** on the page.
- The share link's **Import** button opens `/lessons/import?code=…` on your dashboard — a preview
  with a single **Add to my lessons** button. **Nothing is saved until you click.**
- The [CLI](./cli.md#sharing-a-lesson) (`devcoach import`, no argument = clipboard) and your
  [agent](./coaching.md#sharing-a-lesson-with-a-teammate) (`import_lesson`) do the same.

<Tabs>
  <TabItem value="import-box" label="＋ Import" default>
    <ThemedShot
      alt="Import a shared lesson"
      light={require("../screenshots/lessons-import-light.png").default}
      dark={require("../screenshots/lessons-import-dark.png").default}
    />
  </TabItem>
  <TabItem value="import-preview" label="A share link's preview">
    <Peek label="Show the whole preview">
      <ThemedShot
        alt="Shared lesson preview"
        light={require("../screenshots/lesson-import-preview-light.png").default}
        dark={require("../screenshots/lesson-import-preview-dark.png").default}
      />
    </Peek>
  </TabItem>
  <TabItem value="shared-list" label="Shared lessons">
    <ThemedShot
      alt="The Lessons page filtered to shared lessons"
      light={require("../screenshots/lessons-shared-light.png").default}
      dark={require("../screenshots/lessons-shared-dark.png").default}
    />
  </TabItem>
  <TabItem value="shared-lesson" label="A shared lesson">
    <Peek label="Show the whole lesson">
      <ThemedShot
        alt="A shared lesson's page"
        light={require("../screenshots/lesson-shared-light.png").default}
        dark={require("../screenshots/lesson-shared-dark.png").default}
      />
    </Peek>
  </TabItem>
</Tabs>

A shared lesson sits in the log like your own, with the sender's name under the topic and a
**🤝 shared by** line on its page; the **🤝 Shared** filter lists them (per sender, too). It carries
no project, branch or folder unless the sender chose to include them.

An imported lesson shows a **🤝 shared by** line in its metadata and never counts against your daily
limit — see [How an imported lesson behaves](./sharing.md#how-an-imported-lesson-behaves).

---

### Settings (`/settings`)

<Peek label="Show all three panels">
  <ThemedShot
    alt="Settings"
    light={require("../screenshots/settings-light.png").default}
    dark={require("../screenshots/settings-dark.png").default}
  />
</Peek>

**What you can do here:**

- **Set the pacing.** How many lessons a day, the gap between them, and how many interactions pass
  before one is cued.
- **Pick the theme and the home page**, and the name proposed when you share a lesson.
- **Back up and restore.** One zip with everything, or the lessons alone as JSON.
- **Read your coaching notebook**, the notes devcoach keeps on how you learn.

The page has three panels: **Coaching**, **Backup & Restore** and the **Coaching Notebook**.

**Coaching** — the settings below, applied with *Save settings*:

| Setting | What it sets |
|---|---|
| **Max lessons per day**<br/>`max_per_day` | maximum lessons in a 24-hour window (1–20) |
| **Minimum gap between lessons**<br/>`min_gap_minutes` | a dropdown: No cooldown, 15 minutes, 30 minutes, 1 hour, 1 hour 30 min, 2 hours, 3 hours, 4 hours, 6 hours, 8 hours, 12 hours, 24 hours |
| **Interactions between lessons**<br/>`nudge_every` | how many interactions pass before a lesson is cued (0–1000; 0 = every turn) |
| **Count interactions**<br/>`nudge_scope` | *Per chat session* or *Globally* |
| **Your name (for sharing)**<br/>`share_name` | the sender name proposed when you share a lesson; empty means your git `user.name` |
| **UI theme**<br/>`ui_theme` | 🌓 System / ☀️ Light / 🌙 Dark |
| **Home page**<br/>`ui_home` | 🏠 Auto / 📚 Lessons / 🧭 Knowledge map: where `/` lands. Auto opens Lessons once you have one, the knowledge map before |

**Backup & Restore** is the dashboard equivalent of the CLI's
[`devcoach backup` / `restore`](./cli.md#backup-export--import) — use it to move your profile to another
machine or take a snapshot before a big change. (The smaller *Download/Import lessons* buttons handle just
the lesson history as JSON.)

| Button | What it does |
|---|---|
| **Download backup** | a full zip (settings + knowledge map + lessons + notebook) |
| **Restore backup** | restore everything from a backup zip |
| **Download lessons** | all lessons as JSON |
| **Import lessons** | upload a previously exported JSON file |

**Coaching Notebook** — a read-only view of `~/.devcoach/learning-state.md`, the notes devcoach keeps on
how you learn, with a Preview / Source toggle, `↓ Download`, and *Open in VS Code*.

---

## How personalization works

The dashboard is where you actively shape your coaching:

<Cards columns={3}>
  <Card title="Adjust confidence on the Knowledge map" to="#knowledge-map-knowledge">
    If you feel stronger in TypeScript than you rated yourself, bump it up. This tunes which topics devcoach prioritises.
  </Card>
  <Card title="Edit groups and topics" to="#knowledge-map-knowledge">
    Add topics you care about, delete ones you don't. Your knowledge map is your learning intent statement.
  </Card>
  <Card title="Record feedback on lessons" to="#lesson-detail-lessonsid">
    Your answer tells devcoach whether that angle landed. Only **✓ I knew this** moves your confidence on that topic (+1), so the next lessons there go deeper; **✗ Couldn't follow** keeps the lesson as the seed of a course.
  </Card>
  <Card title="Star lessons to revisit" to="#lessons-lessons">
    Use the `★` button to mark lessons worth reading again. You can filter by "starred only" on the Lessons page.
  </Card>
  <Card title="Jump to context" to="#lesson-detail-lessonsid">
    Click repository, commit, or folder links on lesson details to immediately review the code that triggered the lesson. This helps you understand *why* the lesson was taught and *where* to apply it.
  </Card>
  <Card title="Share what landed" to="#sharing-a-lesson">
    Hand a lesson to a teammate with **↗ Share**, and import theirs with **＋ Import**. Shared lessons enrich your log without touching your pacing.
  </Card>
</Cards>

The knowledge map, feedback history, and git context together create a feedback loop: your edits guide lesson selection, lesson feedback adjusts your confidence, and the ability to jump back to context lets you learn in the exact place it happened.

---

## Keyboard shortcuts

The web UI has no keyboard shortcuts. Use the CLI for faster access to individual commands.
