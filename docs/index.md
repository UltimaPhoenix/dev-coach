# devcoach

**Progressive technical coaching, directly in Claude.** After every task you complete with Claude Code or Claude Desktop, devcoach delivers a short, targeted lesson based on what you already know — no generic tutorials, no repeated topics.

Everything runs **locally**. No data leaves your machine. One SQLite file at `~/.devcoach/coaching.db`.

---

## How it works

| Step | What happens |
|------|-------------|
| You complete a task with Claude | Claude finishes the work as normal |
| devcoach checks your knowledge map | Finds a topic where you have room to grow, related to what you just did |
| A lesson appears at the end of the response | Calibrated to your level (junior / mid / senior), never repeated |
| You mark it know / don't know | Confidence scores update, shaping future lessons |

---

## Screenshots

### Knowledge map

=== "Dark"
    ![Knowledge map – dark theme](screenshots/knowledge-map-dark.png)

=== "Light"
    ![Knowledge map – light theme](screenshots/knowledge-map-light.png)

### Lesson history

=== "Dark"
    ![Lessons – dark theme](screenshots/lessons-dark.png)

=== "Light"
    ![Lessons – light theme](screenshots/lessons-light.png)

### Settings

=== "Dark"
    ![Settings – dark theme](screenshots/settings-dark.png)

=== "Light"
    ![Settings – light theme](screenshots/settings-light.png)

### Lesson detail

=== "Dark"
    ![Lesson detail – dark theme](screenshots/lesson-redis-cache-stampede-dark.png)

=== "Light"
    ![Lesson detail – light theme](screenshots/lesson-redis-cache-stampede-light.png)

---

## Quick install

```bash
uv tool install devcoach
devcoach install   # registers with Claude Code / Claude Desktop
```

Restart Claude and you're ready. See [Getting started](getting-started.md) for the full onboarding walkthrough.
