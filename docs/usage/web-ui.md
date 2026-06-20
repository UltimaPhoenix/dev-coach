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

Installed devcoach globally or via Homebrew? Drop the `npx -y` and just run `devcoach ui`. Or let Claude
open it for you via the MCP tool:

```
open_ui({ port: 7860 })
```

---

## Pages

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

**Stats bar** (top of page): total lessons, today's count vs. daily limit, this week's count, and current rate-limit status.

<ThemedShot
  alt="Knowledge map"
  light={require("../screenshots/knowledge-map-light.png").default}
  dark={require("../screenshots/knowledge-map-dark.png").default}
/>

---

### Lessons (`/lessons`)

Filterable, sortable table of all delivered lessons.

**Filters:**
- Period (today / week / month / year / all)
- Category tag
- Difficulty level
- Project / repository / branch / commit hash
- Starred only
- Feedback (know / dont_know / none)
- Free-text search
- Date range (supports optional time: `2026-04-25T14:30`)

**Sort:** by timestamp, level, topic, title, or feedback. Ascending or descending.

**Pagination:** 25 per page.

**Actions per lesson:**
- `★` — toggle starred
- Feedback buttons (✓ / ✗ / clear) — record comprehension, adjusts knowledge confidence
- Lesson ID link — opens the detail page

<ThemedShot
  alt="Lessons"
  light={require("../screenshots/lessons-light.png").default}
  dark={require("../screenshots/lessons-dark.png").default}
/>

---

### Lesson detail (`/lessons/<id>`)

Full lesson content laid out in reading order:

- **Title row** — star toggle, title, level badge (junior / mid / senior)
- **Metadata row** — relative date with tooltip, topic ID, category tags, feedback badge + clear button
- **TL;DR callout** — one-sentence summary in a highlighted indigo box, always visible above the body
- **Lesson body** — full markdown content with syntax-highlighted code blocks
- **Task context** — the coding task that triggered the lesson (when available)
- **Git metadata** — clickable context links to jump back to where the lesson came from:
  - **Project** — the folder name where you were working
  - **Repository** — clickable link with platform icon (GitHub, GitLab, Bitbucket, or local). Click to open the remote repository in your browser or view local details
  - **Branch** — the git branch you were on when the lesson was taught
  - **Commit hash** — the exact commit (clickable to view on GitHub/GitLab/Bitbucket or as a local hash)
  - **Folder** — clickable `🔗 Open` link that opens the project folder in VS Code, so you can immediately review the code that triggered the lesson
- **Feedback buttons** — ✓ I know this / ✗ I don't know this (hidden once feedback is recorded)

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

- **Max per day** — maximum lessons in a 24-hour window (1–20)
- **Min gap** — minimum minutes between lessons (0–1440), input as hours + minutes
- **Export lessons** — download all lessons as JSON
- **Import lessons** — upload a previously exported JSON file
- **Export backup** — download a full zip (settings + knowledge map + lessons + notebook)
- **Import backup** — restore everything from a backup zip

**Export / import** here is the dashboard equivalent of the CLI's
[`devcoach backup` / `restore`](./cli.md#backup-export--import) — use it to move your profile to another
machine or take a snapshot before a big change. (The smaller *Export/Import lessons* buttons handle just
the lesson history as JSON.)

<ThemedShot
  alt="Settings"
  light={require("../screenshots/settings-light.png").default}
  dark={require("../screenshots/settings-dark.png").default}
/>

---

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
