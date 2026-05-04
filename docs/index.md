# devcoach

**Progressive technical coaching, directly in Claude.** After every task you complete with Claude Code or Claude Desktop, devcoach delivers a short, targeted lesson based on what you already know — no generic tutorials, no repeated topics.

Everything runs **locally**. No data leaves your machine. One SQLite file at `~/.devcoach/coaching.db`.

---

## How it works

```mermaid
sequenceDiagram
    actor User
    participant Claude as Claude (AI)
    participant devcoach as devcoach (MCP)

    User->>+Claude: Complete a technical task
    Claude-->>User: Work completed normally

    Claude->>devcoach: check rate-limit + profile + taught topics
    devcoach-->>Claude: knowledge map · lesson history · coaching notebook

    Claude->>Claude: select topic · calibrate depth · compose lesson

    Claude->>devcoach: log_lesson(id, topic, level, body, …)
    Claude-->>-User: Response + 🎓 lesson at the bottom

    User->>+Claude: ✅ know · ❌ don't know · ⏭ skip
    Claude->>devcoach: submit_feedback → confidence ±1
    Claude->>Claude: update coaching notebook if warranted
    Claude-->>-User: acknowledged
```

See [How it works](how-it-works.md) for the full decision flow.

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
