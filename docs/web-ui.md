# Web UI

The devcoach web dashboard provides a visual interface for everything the CLI does.

## Launch

```bash
devcoach ui              # http://localhost:7860
devcoach ui --port 8080  # custom port
```

Or via the MCP tool (Claude can launch it for you):

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

**Edit mode** (click `✎ Edit`):
- `+` / `−` buttons beside each bar to adjust confidence by 1
- `⇄` button to move a topic to a different group
- `×` button to delete a topic
- `+ topic` button in each group header to add a topic directly to that group
- `+ Add group` / `+ Add topic` buttons in the page header
- `×` beside group names to delete a group (topics move to Other)

**View mode**: topic names are clickable links that filter the lessons page to that topic.

**Stats bar** (top of page): total lessons, today's count vs. daily limit, this week's count, and current rate-limit status.

=== "Dark"
    ![Knowledge map – dark theme](screenshots/knowledge-map-dark.png)

=== "Light"
    ![Knowledge map – light theme](screenshots/knowledge-map-light.png)

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

=== "Dark"
    ![Lessons – dark theme](screenshots/lessons-dark.png)

=== "Light"
    ![Lessons – light theme](screenshots/lessons-light.png)

---

### Lesson detail (`/lessons/<id>`)

Full lesson content laid out in reading order:

- **Title row** — star toggle, title, level badge (junior / mid / senior)
- **Metadata row** — relative date with tooltip, topic ID, category tags, feedback badge + clear button
- **TL;DR callout** — one-sentence summary in a highlighted indigo box, always visible above the body
- **Lesson body** — full markdown content with syntax-highlighted code blocks
- **Task context** — the coding task that triggered the lesson (when available)
- **Git metadata** — project, repository (with platform icon + link), branch, commit hash, folder (VSCode deep-link)
- **Feedback buttons** — ✓ I know this / ✗ I don't know this (hidden once feedback is recorded)

=== "Docker layer caching (Junior)"
    === "Dark"
        ![Docker layer caching – dark](screenshots/lesson-docker-layer-cache-dark.png)
    === "Light"
        ![Docker layer caching – light](screenshots/lesson-docker-layer-cache-light.png)

=== "PostgreSQL EXPLAIN ANALYZE (Mid)"
    === "Dark"
        ![PostgreSQL EXPLAIN ANALYZE – dark](screenshots/lesson-postgresql-explain-analyze-dark.png)
    === "Light"
        ![PostgreSQL EXPLAIN ANALYZE – light](screenshots/lesson-postgresql-explain-analyze-light.png)

=== "Git interactive rebase (Mid)"
    === "Dark"
        ![Git interactive rebase – dark](screenshots/lesson-git-interactive-rebase-dark.png)
    === "Light"
        ![Git interactive rebase – light](screenshots/lesson-git-interactive-rebase-light.png)

=== "CI/CD pipeline stages (Senior)"
    === "Dark"
        ![CI/CD pipeline stages – dark](screenshots/lesson-ci-cd-pipeline-stages-dark.png)
    === "Light"
        ![CI/CD pipeline stages – light](screenshots/lesson-ci-cd-pipeline-stages-light.png)

=== "Cache stampede (Senior)"
    === "Dark"
        ![Cache stampede – dark](screenshots/lesson-redis-cache-stampede-dark.png)
    === "Light"
        ![Cache stampede – light](screenshots/lesson-redis-cache-stampede-light.png)

---

### Settings (`/settings`)

- **Max per day** — maximum lessons in a 24-hour window (1–20)
- **Min gap** — minimum minutes between lessons (0–1440), input as hours + minutes
- **Export lessons** — download all lessons as JSON
- **Import lessons** — upload a previously exported JSON file
- **Export backup** — full zip (settings + knowledge + lessons)
- **Import backup** — restore from a backup zip

=== "Dark"
    ![Settings – dark theme](screenshots/settings-dark.png)

=== "Light"
    ![Settings – light theme](screenshots/settings-light.png)

---

## Keyboard shortcuts

The web UI has no keyboard shortcuts. Use the CLI for faster access to individual commands.
