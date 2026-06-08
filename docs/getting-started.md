# Getting started

## Prerequisites

- Claude Code or Claude Desktop
- [uv](https://docs.astral.sh/uv/) (for uvx / uv tool installs) · Python 3.12+
- No Python required for Homebrew installs

---

## 1. Install

### Homebrew (macOS / Linux — recommended)

```bash
brew tap UltimaPhoenix/tap && brew install devcoach
```

Pre-built native binary. No Python required.

### uvx — no permanent install needed

```bash
uvx devcoach mcp   # run directly without installing
```

### uv tool — permanent install

```bash
uv tool install devcoach
```

---

## 2. Register with Claude

Run once after installing:

```bash
devcoach install
```

`devcoach install` auto-detects how it was installed and produces output like:

```
Setting up devcoach  (uv tool (auto-detected) · devcoach mcp)

Claude Code
  MCP server…  ✓ Registered via `claude mcp add` (scope: user)
  Stop hooks…  ✓ Stop hooks installed into ~/.claude/settings.json

Tip: run devcoach backup to export your profile, lessons and settings.
     run devcoach restore <file> to import a backup on a new machine.
```

Use `--mode` if auto-detection picks the wrong method:

```bash
devcoach install --mode binary    # Homebrew / self-contained binary
devcoach install --mode uv-tool   # uv tool install
devcoach install --mode uvx       # uvx (no permanent install)
```

Other flags:

| Flag | Effect |
|------|--------|
| `--claude-code` | Register in Claude Code only |
| `--claude-desktop` | Register in Claude Desktop only |
| `--global` | Use global scope instead of user scope (Claude Code) |
| `--force` | Overwrite an existing devcoach entry |
| `--skip-hook` | Register MCP server only, skip Stop hooks |

**Restart Claude Code / Claude Desktop** after running.

### Manual registration (if `devcoach install` is not available)

**Claude Code** — add to `~/.claude.json` → `mcpServers`:

```json
{
  "mcpServers": {
    "devcoach": {
      "type": "stdio",
      "command": "devcoach",
      "args": ["mcp"]
    }
  }
}
```

Use `"command": "uvx", "args": ["devcoach", "mcp"]` if using uvx.

Add to `~/.claude/settings.json` → `hooks.Stop`:

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

Replace `devcoach` with `uvx devcoach` in hook commands if using uvx.

**Claude Desktop** — edit the config file for your platform:

| Platform | Config file |
|----------|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

**Claude.ai web (skill copy)** — Claude.ai does not support MCP servers. Copy the content of
[`src/devcoach/SKILL.md`](../src/devcoach/SKILL.md) into **Settings → Custom instructions**.
Lesson logging and profile tracking will not work without the MCP server.

> **Keep the skill up to date.** When using Claude Code or Claude Desktop, the coaching skill
> is served automatically via the MCP prompt and is always current with the installed version.
> If you copied it manually to Claude.ai, re-paste the latest `SKILL.md` after each devcoach update.

### Backup and restore

Export your full profile before switching machines:

```bash
devcoach backup                    # → devcoach-backup.zip
devcoach restore devcoach-backup.zip
```

The backup includes your knowledge map, all lessons, settings, and coaching notebook.

---

## 3. Onboarding

On your first Claude session after connecting devcoach, Claude will detect that onboarding is needed and guide you through:

### Option A — restore from backup

If you have a previous devcoach backup:

```
Do you have an existing devcoach backup to restore? Path: ~/devcoach-backup.zip
```

Claude calls the restore tool and your full profile (knowledge map + lessons + settings) is imported.

### Option B — automatic stack detection

Claude scans your current project directory for manifest files and proposes topics:

```
I detected these technologies in your project:
  python         → confidence 6  (keep? or enter 0-10)
  docker         → confidence 7  (keep? or enter 0-10)
  github_actions → confidence 6  (keep? or enter 0-10)

Anything I missed?
```

You confirm, adjust, or skip each one. Then add anything else you work with.

### Option C — manual

A free-form conversation:

```
Tell me about the technologies you work with day-to-day.
For each one, how confident are you?
  1–3 = still learning  ·  4–6 = comfortable  ·  7–9 = strong  ·  10 = expert
```

### Group proposal

After your topics are finalised, Claude proposes groupings:

```
Here's how I'd organise these:

  Languages       → python, typescript
  Backend         → fastapi, django
  DevOps          → docker, docker_compose, github_actions
  Version Control → git

Does this look right?
```

Groups are always proposed by Claude — never asked about during topic collection.

### Completing setup

Claude calls `complete_onboarding` and saves everything. From this point on, lessons start after every technical task.

---

## 4. CLI alternative

Run the wizard in your terminal instead of through Claude:

```bash
devcoach setup
```

---

## 5. Your first lesson

Work on any technical task with Claude. After the response you'll see something like:

```
---
🎓 **devcoach** · Python · Level: Mid

**Generator expressions vs list comprehensions**

Generators are lazy: they yield one item at a time without loading everything
into memory. A list comprehension builds the entire result up front...

💡 *Senior tip:* Prefer generators any time you're chaining multiple
transformations — `sum(x*x for x in data)` never builds an intermediate list.
```

---

## 6. Track your progress

```bash
devcoach stats          # overview + weakest/strongest topics
devcoach lessons        # full history
devcoach profile        # knowledge map with confidence bars
```

Or open the web dashboard:

```bash
devcoach ui
```

---

## 7. Uninstall

```bash
brew uninstall devcoach && brew untap UltimaPhoenix/tap   # Homebrew
uv tool uninstall devcoach                                  # uv tool

claude mcp remove devcoach      # remove from Claude Code
rm -rf ~/.devcoach               # delete all data (irreversible — backup first)
```

For Claude Desktop, remove the `devcoach` key from `mcpServers` in the platform config file listed above.
