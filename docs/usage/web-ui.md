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

Installed devcoach globally or via Homebrew? Drop the `npx -y` and just run `devcoach ui`. The dashboard
binds to `127.0.0.1` only, so it is never reachable from other machines. Or let Claude open it for you
via the MCP tool:

```
open_ui({ port: 7860 })
```

---

## Pages

The top nav has **Profile** (`/`), **Lessons**, and **Settings**, plus a light/dark theme toggle.

### Knowledge map (`/`)

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
- Free-text search

Active filters show as chips above the table; when nothing matches you get "No lessons match the
current filters."

**Sort:** click the Date, Topic, Title, Level or Feedback column header. Ascending or descending.

**Table columns:** ★, Date, Topic, Title, Level, Categories, Feedback — the feedback cell shows
`✓ Known` / `✗ Unknown` (or nothing yet).

**Pagination:** 25 per page.

**Actions per row:**
- `★` — toggle starred
- Click a level pill or category chip — filter the table by it
- Click anywhere else on the row — open the detail page (feedback is recorded there)

<ThemedShot
  alt="Lessons"
  light={require("../screenshots/lessons-light.png").default}
  dark={require("../screenshots/lessons-dark.png").default}
/>

---

### Lesson detail (`/lessons/<id>`)

Full lesson content laid out in reading order:

- **Title row** — `← Back to lessons`, star toggle, title, level pill (Junior / Mid / Senior)
- **Metadata row** — relative date with tooltip, topic ID, category chips, feedback badge + Clear
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

### Settings (`/settings`)

Three panels:

**Coaching** — the five settings, applied with *Save settings*:
- **Max lessons per day** — maximum lessons in a 24-hour window (1–20; `max_per_day`)
- **Minimum gap between lessons** — a dropdown: No cooldown, 15 minutes, 30 minutes, 1 hour,
  1 hour 30 min, 2 hours, 3 hours, 4 hours, 6 hours, 8 hours, 12 hours, 24 hours (`min_gap_minutes`)
- **Interactions between lessons** — how many interactions pass before a lesson is cued (0–1000;
  0 = every turn; `nudge_every`)
- **Count interactions** — *Per chat session* or *Globally* (`nudge_scope`)
- **UI theme** — 🌓 System / ☀️ Light / 🌙 Dark (`ui_theme`)

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

The knowledge map, feedback history, and git context together create a feedback loop: your edits guide lesson selection, lesson feedback adjusts your confidence, and the ability to jump back to context lets you learn in the exact place it happened.

---

## Keyboard shortcuts

The web UI has no keyboard shortcuts. Use the CLI for faster access to individual commands.
