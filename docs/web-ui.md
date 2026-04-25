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

---

### Lesson detail (`/lessons/<id>`)

Full lesson content with title, summary, level, categories, git metadata, star and feedback state.

---

### Settings (`/settings`)

- **Max per day** — maximum lessons in a 24-hour window (1–20)
- **Min gap** — minimum minutes between lessons (0–1440), input as hours + minutes
- **Export lessons** — download all lessons as JSON
- **Import lessons** — upload a previously exported JSON file
- **Export backup** — full zip (settings + knowledge + lessons)
- **Import backup** — restore from a backup zip

---

## Keyboard shortcuts

The web UI has no keyboard shortcuts. Use the CLI for faster access to individual commands.
