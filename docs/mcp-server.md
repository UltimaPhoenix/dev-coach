# MCP server reference

devcoach implements the [MCP 2025-11-25 spec](https://modelcontextprotocol.io/specification/2025-11-25/server) via [FastMCP](https://github.com/jlowin/fastmcp).

The server exposes **tools** (mutations), **resources** (read-only data), and a **prompt** (coaching instructions).

---

## Connection

```json
{
  "mcpServers": {
    "devcoach": {
      "type": "stdio",
      "command": "uvx",
      "args": ["devcoach"]
    }
  }
}
```

---

## Tools (mutations)

### `log_lesson`

Save a delivered lesson to the coaching log. Git metadata is auto-detected from the workspace — you only need to supply the required fields.

**Required:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique lesson ID (e.g. UUID or slug) |
| `timestamp` | string | ISO 8601 datetime (UTC) |
| `topic_id` | string | snake_case topic identifier |
| `categories` | string[] | Category tags (e.g. `["python", "async"]`) |
| `title` | string | Short lesson title |
| `level` | `"junior" \| "mid" \| "senior"` | Difficulty level |
| `summary` | string | One-line description of what was taught |

**Optional (auto-detected if omitted):**

| Parameter | Type | Description |
|-----------|------|-------------|
| `task_context` | string | Brief description of the triggering task |
| `project` | string | Project name |
| `repository` | string | `org/repo` for remote; absolute path for local |
| `branch` | string | Current git branch |
| `commit_hash` | string | Full commit SHA |
| `folder` | string | Absolute path to cwd |
| `repository_platform` | `"github" \| "gitlab" \| "bitbucket" \| "local"` | VCS platform |

Returns `"ok"` on success, `"error: <message>"` on failure.

---

### `update_knowledge`

Adjust confidence for a topic by delta. Creates the topic at confidence 5 if it doesn't exist.

```json
{ "topic": "python_generators", "delta": 1 }
```

Returns the updated `Profile`.

---

### `complete_onboarding`

Save the user's initial knowledge profile and mark onboarding complete. Called at the end of the onboarding flow.

```json
{
  "topics": {
    "python": 7,
    "docker": 8,
    "git": 7,
    "github_actions": 6
  },
  "groups": {
    "Languages": ["python"],
    "DevOps": ["docker", "github_actions"],
    "Version Control": ["git"]
  }
}
```

Wipes any default-seeded profile and saves the user's selections. Returns the updated `Profile`.

---

### `get_lessons`

Query the lesson history with filters.

```json
{
  "period": "week",
  "category": "python",
  "level": "mid",
  "starred": true,
  "search": "generator"
}
```

All parameters are optional and combinable. Returns `Lesson[]`.

---

### `star_lesson`

Toggle the starred flag. Returns `"starred"` or `"unstarred"`.

```json
{ "lesson_id": "lesson-python-generators-001" }
```

---

### `submit_feedback`

Record comprehension feedback. Adjusts knowledge confidence.

```json
{ "lesson_id": "lesson-python-generators-001", "feedback": "know" }
```

`feedback`: `"know"` (+1 confidence) | `"dont_know"` (-1) | `"clear"` (remove only)

Returns the updated `Profile`.

---

### `add_topic` / `remove_topic`

Add or remove a topic from the knowledge map.

```json
{ "topic": "rust_lifetimes", "confidence": 3, "group": "Languages" }
```

---

### `add_group` / `remove_group`

Create or delete a named group.

```json
{ "name": "Machine Learning" }
```

---

### `update_settings`

Update a rate-limit setting.

```json
{ "key": "max_per_day", "value": "3" }
```

Valid keys: `max_per_day` (1–20), `min_gap_minutes` (0–1440).

---

### `open_ui`

Launch the web dashboard in the background.

```json
{ "port": 7860 }
```

---

## Resources (read-only)

Resources are read by the AI without the user requesting it — they are app-controlled.

| URI | Description |
|-----|-------------|
| `devcoach://profile` | Full knowledge map (topics, confidence, groups) |
| `devcoach://stats` | Lesson counts, rate-limit state, weakest/strongest topics |
| `devcoach://rate-limit` | `{allowed, reason}` — check before delivering a lesson |
| `devcoach://taught-topics` | All topic_ids already taught |
| `devcoach://context` | Current workspace git context + usage defaults |
| `devcoach://onboarding` | Onboarding status + auto-detected stack for first run |
| `devcoach://settings` | Current rate-limit settings |
| `devcoach://lessons/recent` | Last 10 lessons from the current week |
| `devcoach://lessons/{lesson_id}` | Single lesson by ID (resource template) |

### `devcoach://onboarding`

```json
{
  "needs_onboarding": true,
  "detected_stack": {
    "python": 6,
    "docker": 7,
    "github_actions": 6
  },
  "context_ready": true
}
```

`detected_stack` is scanned from the server's `cwd`. Values are suggestions — the user confirms them during the onboarding conversation.

### `devcoach://context`

```json
{
  "git": {
    "project": "dev-coach",
    "repository": "UltimaPhoenix/dev-coach",
    "branch": "main",
    "commit_hash": "abc123...",
    "folder": "/Users/phoenix/dev-coach",
    "repository_platform": "github"
  },
  "usage_defaults": {
    "project": "dev-coach",
    "repository": "UltimaPhoenix/dev-coach",
    "branch": "main",
    "repository_platform": "github"
  }
}
```

---

## Prompt

### `devcoach_instructions`

Returns the full content of `SKILL.md` — the coaching behaviour guidelines loaded by Claude at session start. This is the single source of truth for how devcoach behaves.

---

## Data models

### `Lesson`

```typescript
{
  id: string
  timestamp: string          // ISO 8601 UTC
  topic_id: string
  categories: string[]
  title: string
  level: "junior" | "mid" | "senior"
  summary: string
  task_context?: string
  project?: string
  repository?: string
  branch?: string
  commit_hash?: string
  folder?: string
  repository_platform?: "github" | "gitlab" | "bitbucket" | "local"
  starred: boolean
  feedback?: "know" | "dont_know"
}
```

### `Profile`

```typescript
{
  knowledge: Array<{ topic: string, confidence: number }>   // confidence 0-10
  groups: Array<{ name: string, topics: string[] }>
}
```
