# devcoach

[![PyPI](https://img.shields.io/github/v/release/UltimaPhoenix/dev-coach?label=PyPI)](https://pypi.org/project/devcoach/)
[![Python](https://img.shields.io/badge/python-3.12%2B-blue)](https://pypi.org/project/devcoach/)
[![CI](https://github.com/UltimaPhoenix/dev-coach/actions/workflows/ci.yml/badge.svg)](https://github.com/UltimaPhoenix/dev-coach/actions/workflows/ci.yml)
[![Quality Gate](https://sonarcloud.io/api/project_badges/measure?project=UltimaPhoenix_dev-coach&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=UltimaPhoenix_dev-coach)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=UltimaPhoenix_dev-coach&metric=coverage)](https://sonarcloud.io/summary/new_code?id=UltimaPhoenix_dev-coach)
[![Docs](https://img.shields.io/badge/docs-GitHub%20Pages-purple)](https://ultimaphoenix.github.io/dev-coach/)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

**Progressive technical coaching, directly in Claude.** After every task you complete with Claude Code or Claude Desktop, devcoach delivers a short, targeted lesson based on what you already know — no generic tutorials, no repeated topics.

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
```

→ [Full decision flow: session startup · lesson selection · depth calibration](https://ultimaphoenix.github.io/dev-coach/how-it-works/)

Everything runs **locally**. No data leaves your machine. One SQLite file at `~/.devcoach/coaching.db`.

---

## Screenshots

|                       Knowledge map                       | Lesson history | Settings |
|:---------------------------------------------------------:|:---:|:---:|
| ![Knowledge map](docs/screenshots/knowledge-map-dark.png) | ![Lessons](docs/screenshots/lessons-dark.png) | ![Settings](docs/screenshots/settings-dark.png) |

---

## Installation

### Step 1 — Install devcoach

Choose the method that fits your setup:

#### Homebrew (macOS / Linux — recommended)

```bash
brew tap UltimaPhoenix/tap && brew install devcoach
```

Pre-built native binary — no Python required.

#### uvx (no permanent install)

```bash
uvx devcoach mcp   # run the MCP server directly without installing
```

Requires [uv](https://docs.astral.sh/uv/) · Python 3.12+

#### uv tool (permanent install)

```bash
uv tool install devcoach
```

Requires [uv](https://docs.astral.sh/uv/) · Python 3.12+

---

### Step 2 — Register with Claude

Run once after installing to add devcoach to your Claude config:

```bash
devcoach install
```

`devcoach install` auto-detects how it was installed and writes the correct MCP server entry. Use `--mode` to override if needed:

```bash
devcoach install --mode binary    # Homebrew / self-contained binary
devcoach install --mode uv-tool   # uv tool install
devcoach install --mode uvx       # uvx (no permanent install)
```

Restart Claude Code or Claude Desktop after running.

<details>
<summary><strong>Manual setup</strong> (if <code>devcoach install</code> is not available)</summary>

#### Claude Code

**Option A — via `claude mcp` CLI (recommended):**

```bash
# Homebrew or uv tool (devcoach on PATH)
claude mcp add devcoach devcoach -- mcp

# uvx
claude mcp add devcoach uvx -- devcoach mcp

# global scope (all projects)
claude mcp add --scope global devcoach devcoach -- mcp
```

**Option B — edit `~/.claude.json` directly:**

```json
// Homebrew or uv tool
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "devcoach", "args": ["mcp"] } } }

// uvx
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "uvx", "args": ["devcoach", "mcp"] } } }
```

Then add the Stop hooks to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      { "hooks": [{ "type": "command", "command": "devcoach onboard-hook" }] },
      { "hooks": [{ "type": "command", "command": "devcoach lesson-ready" }] }
    ]
  }
}
```

Replace `devcoach` with `uvx devcoach` in the hook commands if using uvx.

#### Claude Desktop

Edit the config file for your platform:

| Platform | Config file |
|----------|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "devcoach": {
      "command": "devcoach",
      "args": ["mcp"]
    }
  }
}
```

Use `"command": "uvx", "args": ["devcoach", "mcp"]` if using uvx.

</details>

### Uninstallation

**1. Remove the binary**

```bash
brew uninstall devcoach && brew untap UltimaPhoenix/tap   # Homebrew
uv tool uninstall devcoach                                  # uv tool
# uvx: nothing to remove
```

**2. Remove from Claude Code**

```bash
claude mcp remove devcoach   # via CLI (recommended)
```

Or manually remove the `devcoach` entry from `~/.claude.json` → `mcpServers`, and remove the two devcoach hook entries from `~/.claude/settings.json` → `hooks.Stop`.

**3. Remove from Claude Desktop**

Edit the config file for your platform (paths in the [Manual setup](#manual-setup-if-devcoach-install-is-not-available) section above) and delete the `devcoach` key from `mcpServers`.

**4. Delete all devcoach data**

```bash
rm -rf ~/.devcoach
```

This removes the coaching database, knowledge map, lessons, settings, and notebook. It cannot be undone — take a backup first if needed (`devcoach backup`).

---

## Quick start

### 1. Install and register

```bash
# Pick one:
brew tap UltimaPhoenix/tap && brew install devcoach   # Homebrew
uv tool install devcoach                               # uv tool

devcoach install          # auto-detects install method, writes MCP config
# Restart Claude Code / Claude Desktop
```

### 2. Onboarding (first session)

Open Claude and start a task. devcoach will detect that setup is needed and guide you through:

- **Import** — restore from an existing backup zip, or
- **Auto-detect** — Claude scans your project files and proposes your tech stack, or
- **Manual** — you describe what you work with in plain conversation

Claude then proposes logical groups (Languages, Backend, DevOps, etc.) for your topics, and saves your knowledge map.

### 3. Work normally

```
You: Refactor this function to use async/await.
Claude: [does the work]

---
🎓 devcoach · Python · Level: Mid

**Structured concurrency with asyncio.TaskGroup**

TaskGroup (Python 3.12+) is the modern replacement for bare gather() calls.
Unlike gather(), it cancels sibling tasks automatically when one raises...
```

### 4. Give feedback

Use the web dashboard or CLI to record whether you understood the lesson:

```bash
devcoach feedback lesson-python-taskgroup-001 know      # understood — +1 confidence
devcoach feedback lesson-python-taskgroup-001 dont_know # need to revisit — −1 confidence
```

---

## CLI reference

| Command | Description |
|---------|-------------|
| `devcoach` | Show all available commands |
| `devcoach mcp` | Start the MCP server (stdio) for Claude Code / Claude Desktop |
| `devcoach setup` | Run the onboarding wizard in the terminal |
| `devcoach install` | Register with Claude Code / Claude Desktop |
| `devcoach profile` | Show your knowledge map with confidence bars |
| `devcoach stats` | Overview: lesson counts, weakest/strongest topics |
| `devcoach lessons` | Browse lesson history with filters |
| `devcoach lesson <id>` | Show a single lesson in full |
| `devcoach star <id>` | Mark a lesson as starred (favourite) |
| `devcoach unstar <id>` | Remove the starred mark from a lesson |
| `devcoach feedback <id> <know\|dont_know\|clear>` | Record comprehension |
| `devcoach set max_per_day <n>` | Max lessons in a 24-hour window (default 2) |
| `devcoach set min_gap_minutes <n>` | Minimum minutes between lessons (default 240) |
| `devcoach ui` | Open the web dashboard at http://localhost:7860 |
| `devcoach backup [output.zip]` | Export knowledge + lessons + settings |
| `devcoach restore <backup.zip>` | Restore from a backup |

Full reference: [docs/cli.md](docs/cli.md)

---

## Web dashboard

```bash
devcoach ui
```

Opens at `http://localhost:7860`. Pages:

- **Knowledge map** — confidence bars for all your topics, edit mode for adjustments
- **Lessons** — filterable, sortable table of your full lesson history
- **Settings** — rate limits, import/export, backup

Full reference: [docs/web-ui.md](docs/web-ui.md)

---

## MCP server (for Claude integration)

devcoach implements the [MCP 2025-11-25 spec](https://modelcontextprotocol.io/specification/2025-11-25/server) via [FastMCP](https://github.com/jlowin/fastmcp).

Run `devcoach install` to register automatically, or see [Manual setup](#manual-setup-if-devcoach-install-is-not-available) in the Installation section above for per-install-method JSON snippets.

Full MCP reference (tools, resources, data models): [docs/mcp-server.md](docs/mcp-server.md)

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting started](docs/getting-started.md) | Installation, onboarding, first lesson |
| [CLI reference](docs/cli.md) | All commands with examples |
| [MCP server reference](docs/mcp-server.md) | Tools, resources, data models |
| [Web UI](docs/web-ui.md) | Dashboard pages and controls |
| [Configuration](docs/configuration.md) | Rate limits, data location, schema, backup |

---

## Configuration

```bash
devcoach set max_per_day 3        # up to 3 lessons per day
devcoach set min_gap_minutes 120  # at least 2 hours between lessons
```

Settings are stored in `~/.devcoach/coaching.db`. See [docs/configuration.md](docs/configuration.md) for all options.

---

## Publishing a new release

Tag a commit with `v*` to trigger the CI/CD pipeline:

```bash
git tag v1.2.3
git push origin v1.2.3
```

The pipeline will lint, test across Python 3.12–3.13, build, publish to PyPI via OIDC Trusted Publishing, and create a GitHub Release automatically.

> **First-time PyPI setup:** configure a Trusted Publisher on PyPI for `UltimaPhoenix/dev-coach` (environment: `pypi`, workflow: `ci.yml`). No API token required after that.

---

## License

Copyright 2026 [UltimaPhoenix](https://github.com/UltimaPhoenix)

Licensed under the [Apache License, Version 2.0](LICENSE).

**What this means for you:**

- Free to use, modify, and distribute
- **Commercial use and modifications must:**
  - Include a copy of this license
  - State any changes made to the files
  - Retain all copyright and attribution notices
  - Include the `NOTICE` file in any derivative distribution
- You may **not** use the `devcoach` name or branding to endorse derived products without permission

See [NOTICE](NOTICE) for third-party attributions.
