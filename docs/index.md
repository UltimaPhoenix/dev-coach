# devcoach

**Progressive technical coaching, directly in Claude.** After every task you complete with Claude Code or Claude Desktop, devcoach delivers a short, targeted lesson based on what you already know — no generic tutorials, no repeated topics.

Everything runs **locally**. No data leaves your machine. One SQLite file at `~/.devcoach/coaching.db`.

---

## How it works

```mermaid
flowchart TD
    A([Task completed]) --> B[Check rate limit]
    B -->|denied| Z([Silent])
    B -->|allowed| D

    subgraph loop["coaching loop"]
        D[Select topic & depth]
        E[Compose & deliver]
        G[log_lesson]
    end

    D -->|nothing| Z
    D -->|found| E
    E --> G
    G --> F([Done])
    G -.->|prompts| U(["You: ✅ ❌ ⏭"])

    style loop fill:none,stroke:#AAAAAA,stroke-dasharray:5 5,color:#757575
    classDef action fill:#D4E4D8,stroke:#8BAF96,color:#1E1E1E
    classDef term   fill:#E8E8E4,stroke:#AAAAAA,color:#1E1E1E
    classDef user   fill:#F5EDE3,stroke:#D4A27F,color:#1E1E1E

    class B,D,E,G action
    class A,F,Z term
    class U user
```

→ [Full decision flow: session startup · lesson selection · depth calibration](how-it-works.md)

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
