# devcoach — CLAUDE.md

## What is this project

`devcoach` is a local MCP server written in Python that acts as a progressive technical
coach. It integrates with Claude Code and Claude Desktop via stdio transport.
Every time Claude completes a technical task, devcoach decides whether to deliver a lesson
based on the user's knowledge map, the rate limit, and what has already been taught.

Repo: https://github.com/UltimaPhoenix/dev-coach
PyPI package name: `devcoach`
End-user command: `uvx devcoach` (CLI) / `uvx devcoach mcp` (MCP server)

---

## Stack

- **Python** 3.11+
- **FastMCP** — MCP framework (not the raw SDK)
- **SQLite** — stdlib `sqlite3`, zero server, single file at `~/.devcoach/coaching.db`
- **Pydantic v2** — model validation
- **uv / uvx** — distribution and launch tool

---

## Project structure

```
dev-coach/
├── CLAUDE.md
├── README.md
├── .gitignore
├── pyproject.toml
└── src/devcoach/
    ├── __init__.py
    ├── server.py      # FastMCP app, tool definitions, MCP prompt, entry point
    ├── db.py          # SQLite schema, migrations, query helpers
    ├── coach.py       # rate limit, lesson selection, knowledge map logic
    ├── models.py      # Pydantic: Lesson, Profile, Settings, KnowledgeUpdate
    ├── prompts.py     # lesson template builder by level (junior/mid/senior)
    └── SKILL.md       # coaching instructions — single source of truth
```

---

## Exposed MCP tools

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `log_lesson` | `Lesson` JSON | `ok` | Save a lesson to the DB |
| `get_profile` | — | `Profile` JSON | Return the current knowledge map |
| `update_knowledge` | `topic: str, delta: int` | Updated `Profile` | Adjust confidence for a topic |
| `check_rate_limit` | — | `{allowed: bool, reason?: str}` | Check whether a lesson can be delivered now |
| `get_lessons` | `period?: today\|week\|month\|year\|all` | `Lesson[]` | Query the lesson history |
| `get_taught_topics` | — | `str[]` | List of already-taught topic IDs |

---

## MCP prompt — auto-injected coaching instructions

The server also exposes a **MCP prompt** named `devcoach_instructions`. Clients that
support MCP prompts (Claude Code, Claude Desktop) load it automatically when connecting
to the server — no separate SKILL.md installation needed.

The prompt is read at runtime directly from `SKILL.md` bundled inside the package.
`SKILL.md` is therefore the **single source of truth** for coaching behaviour: update
it once and both the MCP prompt and any separately installed skill reflect the change.

```python
# server.py
import importlib.resources

@mcp.prompt()
def devcoach_instructions() -> str:
    return importlib.resources.read_text("devcoach", "SKILL.md")
```

`SKILL.md` must be declared as package data in `pyproject.toml`:

```toml
[tool.hatch.build.targets.wheel]
packages = ["src/devcoach"]

[tool.hatch.build.targets.wheel.shared-data]
"src/devcoach/SKILL.md" = "devcoach/SKILL.md"
```

For clients that do **not** support MCP prompts (claude.ai web), install the
`.skill` file generated from the same `SKILL.md` via the Claude.ai Skills settings.

---

## DB schema

```sql
-- Delivered lessons
CREATE TABLE lessons (
    id           TEXT PRIMARY KEY,
    timestamp    TEXT NOT NULL,
    topic_id     TEXT NOT NULL,
    category     TEXT NOT NULL,
    title        TEXT NOT NULL,
    level        TEXT NOT NULL,  -- junior|mid|senior
    summary      TEXT NOT NULL,
    task_context TEXT
);

-- Per-topic knowledge map
CREATE TABLE knowledge (
    topic       TEXT PRIMARY KEY,
    confidence  INTEGER NOT NULL DEFAULT 5,  -- 0-10
    updated_at  TEXT NOT NULL
);

-- User settings
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

---

## Default profile

Loaded automatically on first run if the `knowledge` table is empty:

```python
DEFAULT_PROFILE = {
    "general_engineering": 8, "software_architecture": 8,
    "design_patterns": 7, "debugging_mindset": 8,
    "node_js": 7, "javascript": 7, "typescript": 6,
    "python": 4, "django": 3, "fastapi": 4,
    "docker": 8, "docker_compose": 8, "traefik": 7,
    "coolify": 7, "postgresql": 6, "redis": 6,
    "git": 7, "ci_cd": 6, "security": 5,
    "performance_optimization": 6, "testing": 5,
    "linux_cli": 7, "networking": 6, "react": 5, "html_css": 5,
}
```

---

## Default settings

```python
DEFAULT_SETTINGS = {
    "max_per_day": "2",
    "min_hours_between": "4",
}
```

---

## Rate limit logic (coach.py)

```
1. Count lessons with a timestamp in the last 24h → if >= max_per_day: denied
2. Find the timestamp of the last lesson → if < min_hours_between ago: denied
3. Otherwise: allowed
```

---

## Lesson selection logic (coach.py)

Descending priority:
1. Pitfall or antipattern in the current task + low confidence on that topic
2. Interesting pattern used + confidence < 6
3. Related concept not yet mastered + confidence < 5
4. Deep-dive on a topic the user is building toward + confidence 4–6

Never teach a `topic_id` already present in `get_taught_topics()`.

---

## Lesson format

The `log_lesson` tool accepts this schema:

```json
{
  "id": "uuid-or-random-string",
  "timestamp": "2025-01-15T20:30:00Z",
  "topic_id": "python",
  "category": "python",
  "title": "Generator expressions vs list comprehensions",
  "level": "mid",
  "summary": "Generators are lazy: they yield one item at a time without loading everything into memory.",
  "task_context": "Optimising a loop over a large dataset"
}
```

---

## pyproject.toml — key points

```toml
[project]
name = "devcoach"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastmcp>=2.0",
    "pydantic>=2.0",
]

[project.scripts]
devcoach = "devcoach.server:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

---

## Local testing

```bash
# Install in dev mode
uv pip install -e .

# Start the server (stdio)
devcoach

# Or with uvx directly from the repo
uvx --from . devcoach

# Test with MCP Inspector
npx @modelcontextprotocol/inspector devcoach
```

---

## Claude Code / Claude Desktop configuration

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "uvx",
      "args": ["devcoach", "mcp"]
    }
  }
}
```

---

## Development conventions

- Follow **Uncle Bob's Clean Code** principles
- Follow **PEP** standards
- Linting and formatting enforced by **ruff** — run `uv run ruff check src/ tests/` and `uv run ruff format src/ tests/` before committing. **All ruff checks must pass before committing.**
- Test coverage must stay **at or above 80%** — run `uv run pytest --cov=src/devcoach --cov-fail-under=80` to verify. Do not merge code that drops total coverage below this threshold.
- No external dependencies beyond `fastmcp` and `pydantic`
- `db.py` exposes only pure functions — no business logic
- `coach.py` never imports from `server.py` (one-way dependency)
- DB errors: always `try/except` with graceful fallback, never crash the server
- DB path: always `Path.home() / ".devcoach" / "coaching.db"`, never hardcoded

---

## Recommended development order

1. `pyproject.toml` + `.gitignore` + folder structure
2. `models.py` — Pydantic models
3. `db.py` — schema + init + query helpers
4. `coach.py` — rate limit + lesson selection
5. `server.py` — FastMCP app + tool wiring + MCP prompt (`devcoach_instructions`)
6. `SKILL.md` — coaching instructions (read by the MCP prompt at runtime)
7. `prompts.py` — lesson templates (optional for MVP)
8. Test with MCP Inspector
9. README.md
10. Publish to PyPI with `uv publish`
