---
title: Web dashboard
sidebar_label: Web dashboard
---

# Web dashboard

import ThemedShot from "@site/src/components/ThemedShot";
import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

**What it's for:** a visual interface for everything the [CLI](./cli.md) does — browse and filter your
lesson history at a glance, adjust your knowledge map by clicking, and import/export backups. It's a
companion to the automatic [coaching in your agent](./coaching.md), reading and writing the same local
database.

## Launch

```bash
npx -y devcoach ui              # http://localhost:7860
npx -y devcoach ui --port 8080  # custom port
```

Installed devcoach globally or via Homebrew? Drop the `npx -y` and just run `devcoach ui`. The URL is
printed as a clickable link (terminals that support OSC 8 hyperlinks — iTerm2, Ghostty, WezTerm, Kitty,
VS Code, Windows Terminal, GNOME Terminal; elsewhere cmd/ctrl-click the plain URL), and `--open`
launches your default browser as well. The dashboard binds to `127.0.0.1` only, so it is never
reachable from other machines. If the port is taken, `devcoach ui` tells you whether a dashboard is
already running there (open it, or `--stop` it) or another process holds the port (pick `--port`).
Or let Claude open it for you via the MCP tool:

```
open_ui({ port: 7860 })
```

Using the [Claude Code plugin](../install/claude-code-plugin.md)? It ships a shortcut for exactly that —
type `/devcoach:ui` (optionally with a port, e.g. `/devcoach:ui 8080`) and Claude starts the dashboard
and hands you the URL. No install, no PATH needed.

## Stop

- In the terminal that runs `devcoach ui`: **Ctrl+C**. The shutdown is graceful — the server stops
  accepting, lets requests in flight finish (up to 2 s), then exits; a second Ctrl+C exits at once.
- A dashboard started by your agent (`open_ui`, `/devcoach:ui`) runs detached, so Ctrl+C cannot reach
  it: ask the agent to close it (`/devcoach:ui stop`, or *"stop the devcoach dashboard"* → the
  `stop_ui` tool), or run `devcoach ui --stop` (add `--port` if you changed it). Both work on any
  dashboard listening on that port.

---

## Pages

The top nav has **Profile** (`/knowledge`), **Lessons**, and **Settings**, plus a light/dark theme
toggle. The root URL (`/`, what `devcoach ui` prints) opens **Lessons** once you have at least one
lesson and the **knowledge map** before that; pick one explicitly under Settings → Home page.

### Knowledge map (`/knowledge`)

Displays your full knowledge map with colour-coded confidence bars:

- **Green** — confidence ≥ 7 (strong)
- **Yellow** — confidence 4–6 (intermediate)
- **Red** — confidence ≤ 3 (learning)

**Personalizing your profile** — click `✎ Edit` to enter edit mode:

- **Adjust confidence** — `+` / `−` buttons beside each bar to tune your self-assessment by 1 point
- **Reorganise topics** — `⇄` button moves a topic to a different group
- **Remove topics** — `×` button deletes a topic you no longer care about
- **Add topics** — `+ topic` in a group header adds directly to that group; `+ Add topic` at the top adds to Other
- **Create groups** — `+ Add group` at the top to organise new categories (Languages, DevOps, Frontend, etc.)
- **Delete groups** — `×` beside group names; topics move to Other if deleted

Changes save immediately as you edit.

**View mode**: topic names are clickable links that filter the lessons page to show only lessons for that topic.

**Stats bar** (top of page): `N lessons total · N / max today · N this week`, then whether a lesson is available now — or why not.

<ThemedShot
  alt="Knowledge map"
  light={require("../screenshots/knowledge-map-light.png").default}
  dark={require("../screenshots/knowledge-map-dark.png").default}
/>

---

### Lessons (`/lessons`)

Filterable, sortable table of all delivered lessons.

**Filters:**
- Period — All time / Today / Last 7 days / Last 30 days / Last year / Custom range (the date range
  accepts an optional time: `2026-04-25T14:30`)
- Feedback — All feedback / ✓ Known / ✗ Don't know / — No response
- Level — All levels / 🟢 Junior / 🟡 Mid / 🔴 Senior
- Filters popover — Category / Project / Repository / Branch / Commit
- Starred only
- Shared — All lessons / 👤 My own / 🤝 Shared with me / 🤝 from `<name>` (one entry per sender)
- Free-text search (also matches the sender of a shared lesson)

Active filters show as chips above the table; when nothing matches you get "No lessons match the
current filters."

**Sort:** click the Date, Topic, Title, Level or Feedback column header. Ascending or descending.

**Table columns:** ★, Date, Topic, Title, Level, Categories, Feedback, ↗ — the title gets the width
(categories wrap onto a second line when needed); the feedback cell shows `✓ Known` / `✗ Unknown`
(or nothing yet); `↗` opens the Share panel right there; a shared lesson shows `🤝 <sender>`
under its topic.

**Pagination:** 25 per page.

**Actions per row:**
- `★` — toggle starred
- `↗` (appears when you hover the row) — share this lesson from a popover right next to the icon, without leaving the list
- Click a level pill or category chip — filter the table by it
- Click anywhere else on the row — open the detail page (feedback is recorded there)

**⋯ More** (toolbar, right) — the rare actions live behind this button so the toolbar stays calm:

- **Delete lessons…** — deleting is deliberately hidden until you ask for it. The star column turns
  into checkboxes, clicking a row now ticks it instead of opening it (the header checkbox ticks the
  whole page), and a bar at the bottom shows *N selected* with **Delete selected**. One
  confirmation, then the list reloads with the same filters and page. Esc or **✕ Cancel** (toolbar
  or bar) leaves the mode without deleting anything; it is never remembered across reloads. Deleting is permanent; a lesson
  someone shared with you can be deleted too, and the same share is accepted again if you import it
  later.
- **Reset column widths** — see below.

**Resizable columns** — on desktop widths, drag the boundary between two column headers: the column
on one side grows exactly as much as its neighbour shrinks, so the table never changes width and no
column can be pushed out of view. The title column takes whatever its neighbours give or take and never
drops below a readable width. Widths are remembered in this browser (and dropped if they no longer fit
the window); double-click a boundary to reset the two columns beside it, or use **⋯ → Reset column
widths**.

**＋ Import** (toolbar, right) — add a lesson someone shared with you: paste the code, the link, a
URL, or the whole copied card into the box, pick a `.devcoach.md` file, or simply **drop the file
anywhere on the page**. See [Sharing a lesson](#sharing-a-lesson).

<ThemedShot
  alt="Import a shared lesson"
  light={require("../screenshots/lessons-import-light.png").default}
  dark={require("../screenshots/lessons-import-dark.png").default}
/>

<ThemedShot
  alt="Lessons"
  light={require("../screenshots/lessons-light.png").default}
  dark={require("../screenshots/lessons-dark.png").default}
/>

---

### Lesson detail (`/lessons/<id>`)

Full lesson content laid out in reading order:

- **Title row** — `← Back to lessons`, star toggle, title, level pill (Junior / Mid / Senior), **↗ Share**,
  and the same **⋯ More** button as the Lessons toolbar, holding the rare actions — today
  **🗑 Delete lesson…** (asks for confirmation, then returns to the list)
- **Metadata row** — relative date with tooltip, topic ID, category chips, feedback badge + Clear;
  a lesson someone shared with you also shows `🤝 shared by <name>`
- **TL;DR callout** — one-sentence summary in a highlighted indigo box, always visible above the body
- **Lesson body** — full markdown content with syntax-highlighted code blocks
- **Task context** — a `Context:` line with the coding task that triggered the lesson (when available)
- **Git metadata** — a row of lowercase labels, `project · repo · branch · commit · folder`, linking back
  to where the lesson came from:
  - **project** — the folder name where you were working
  - **repo** — link with a platform icon (GitHub, GitLab, Bitbucket, or local). Click to open the remote
    repository in your browser or view local details
  - **branch** — the git branch you were on when the lesson was taught
  - **commit** — the exact commit (clickable to view on GitHub/GitLab/Bitbucket or as a local hash)
  - **folder** — a VS Code icon link that opens the project folder in VS Code, so you can immediately
    review the code that triggered the lesson
- **Feedback buttons** — `✓ I know this` / `✗ I don't know this` (hidden once feedback is recorded)
- **ID line** — the full lesson ID, for `devcoach lesson <id>` and friends

<Tabs>
  <TabItem value="docker" label="Docker layer caching (Junior)" default>
    <ThemedShot
      alt="Docker layer caching"
      light={require("../screenshots/lesson-docker-layer-cache-light.png").default}
      dark={require("../screenshots/lesson-docker-layer-cache-dark.png").default}
    />
  </TabItem>
  <TabItem value="postgres" label="PostgreSQL EXPLAIN ANALYZE (Mid)">
    <ThemedShot
      alt="PostgreSQL EXPLAIN ANALYZE"
      light={require("../screenshots/lesson-postgresql-explain-analyze-light.png").default}
      dark={require("../screenshots/lesson-postgresql-explain-analyze-dark.png").default}
    />
  </TabItem>
  <TabItem value="rebase" label="Git interactive rebase (Mid)">
    <ThemedShot
      alt="Git interactive rebase"
      light={require("../screenshots/lesson-git-interactive-rebase-light.png").default}
      dark={require("../screenshots/lesson-git-interactive-rebase-dark.png").default}
    />
  </TabItem>
  <TabItem value="cicd" label="CI/CD pipeline stages (Senior)">
    <ThemedShot
      alt="CI/CD pipeline stages"
      light={require("../screenshots/lesson-ci-cd-pipeline-stages-light.png").default}
      dark={require("../screenshots/lesson-ci-cd-pipeline-stages-dark.png").default}
    />
  </TabItem>
  <TabItem value="stampede" label="Cache stampede (Senior)">
    <ThemedShot
      alt="Cache stampede"
      light={require("../screenshots/lesson-redis-cache-stampede-light.png").default}
      dark={require("../screenshots/lesson-redis-cache-stampede-dark.png").default}
    />
  </TabItem>
</Tabs>

---

### Sharing a lesson

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

<ThemedShot
  alt="Share popover"
  light={require("../screenshots/lesson-share-light.png").default}
  dark={require("../screenshots/lesson-share-dark.png").default}
/>

**Receiving** — every way in leads to the same place:

- **＋ Import** on the Lessons page: paste the code, the link, a URL whose body is a shared lesson
  (a raw gist, a file in a repo), the whole copied card, or a lessons JSON export; pick a
  `.devcoach.md`; or **drop the file anywhere** on the page.
- The share link's **Import** button opens `/lessons/import?code=…` on your dashboard — a preview
  with a single **Add to my lessons** button. **Nothing is saved until you click.**
- The [CLI](./cli.md#sharing-a-lesson) (`devcoach import`, no argument = clipboard) and your
  [agent](./coaching.md#sharing-a-lesson-with-a-teammate) (`import_lesson`) do the same.

<ThemedShot
  alt="Shared lesson preview"
  light={require("../screenshots/lesson-import-preview-light.png").default}
  dark={require("../screenshots/lesson-import-preview-dark.png").default}
/>

An imported lesson shows a **🤝 shared by** line in its metadata and never counts against your daily
limit — see [How an imported lesson behaves](./sharing.md#how-an-imported-lesson-behaves).

---

### Settings (`/settings`)

Three panels:

**Coaching** — the six settings, applied with *Save settings*:
- **Max lessons per day** — maximum lessons in a 24-hour window (1–20; `max_per_day`)
- **Minimum gap between lessons** — a dropdown: No cooldown, 15 minutes, 30 minutes, 1 hour,
  1 hour 30 min, 2 hours, 3 hours, 4 hours, 6 hours, 8 hours, 12 hours, 24 hours (`min_gap_minutes`)
- **Interactions between lessons** — how many interactions pass before a lesson is cued (0–1000;
  0 = every turn; `nudge_every`)
- **Count interactions** — *Per chat session* or *Globally* (`nudge_scope`)
- **Your name (for sharing)** — the sender name proposed when you share a lesson; empty means your
  git `user.name` (`share_name`)
- **UI theme** — 🌓 System / ☀️ Light / 🌙 Dark (`ui_theme`)
- **Home page** — 🏠 Auto / 📚 Lessons / 🧭 Knowledge map (`ui_home`): where `/` lands. Auto opens
  Lessons once you have one, the knowledge map before

**Backup & Restore**:
- **Download backup** — a full zip (settings + knowledge map + lessons + notebook)
- **Restore backup** — restore everything from a backup zip
- **Download lessons** — all lessons as JSON
- **Import lessons** — upload a previously exported JSON file

**Coaching Notebook** — a read-only view of `~/.devcoach/learning-state.md`, the notes devcoach keeps on
how you learn, with a Preview / Source toggle, `↓ Download`, and *Open in VS Code*.

**Backup & Restore** is the dashboard equivalent of the CLI's
[`devcoach backup` / `restore`](./cli.md#backup-export--import) — use it to move your profile to another
machine or take a snapshot before a big change. (The smaller *Download/Import lessons* buttons handle just
the lesson history as JSON.)

<ThemedShot
  alt="Settings"
  light={require("../screenshots/settings-light.png").default}
  dark={require("../screenshots/settings-dark.png").default}
/>

---

## How personalization works

The dashboard is where you actively shape your coaching:

1. **Adjust confidence on the Knowledge map** — if you feel stronger in TypeScript than you rated yourself, bump it up. This tunes which topics devcoach prioritises.

2. **Edit groups and topics** — add topics you care about, delete ones you don't. Your knowledge map is your learning intent statement.

3. **Record feedback on lessons** — when you click ✓ or ✗ on a lesson, you're telling devcoach whether that angle landed. This adjusts both your confidence on that topic and future lesson depth.

4. **Star lessons to revisit** — use the `★` button to mark lessons worth reading again. You can filter by "starred only" on the Lessons page.

5. **Jump to context** — click repository, commit, or folder links on lesson details to immediately review the code that triggered the lesson. This helps you understand *why* the lesson was taught and *where* to apply it.

6. **Share what landed** — hand a lesson to a teammate with **↗ Share**, and import theirs with **＋ Import**. Shared lessons enrich your log without touching your pacing.

The knowledge map, feedback history, and git context together create a feedback loop: your edits guide lesson selection, lesson feedback adjusts your confidence, and the ability to jump back to context lets you learn in the exact place it happened.

---

## Keyboard shortcuts

The web UI has no keyboard shortcuts. Use the CLI for faster access to individual commands.
