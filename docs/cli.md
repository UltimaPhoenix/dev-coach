# CLI reference

## Overview

Running `devcoach` with no arguments prints a help panel listing every available command:

```
devcoach
```

All commands operate on `~/.devcoach/coaching.db`. No network access required.

---

## MCP server

### `devcoach mcp`

Start the stdio MCP server for Claude Code or Claude Desktop. This is what you put in your MCP config:

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

---

## Knowledge map

### `devcoach profile`

Display your full knowledge map grouped by category, sorted by confidence.

```
┌─────────────────────────────────────────────────────────┐
│                     Knowledge Map                       │
├───────────────────┬────────────┬────────────┬───────────┤
│ Topic             │ Group      │ Confidence │ Bar       │
├───────────────────┼────────────┼────────────┼───────────┤
│ docker            │ DevOps     │ 8/10       │ ████████░░│
│ python            │ Languages  │ 7/10       │ ███████░░░│
│ fastapi           │ Backend    │ 5/10       │ █████░░░░░│
└───────────────────┴────────────┴────────────┴───────────┘
```

### `devcoach knowledge-add <topic>`

Add a topic or update its confidence.

```bash
devcoach knowledge-add rust --confidence 3
devcoach knowledge-add kubernetes --confidence 5 --group DevOps
```

Options:
- `--confidence N` — 0-10, default 5
- `--group NAME` — assign to a named group (creates the group if needed)

### `devcoach knowledge-remove <topic>`

Remove a topic from the knowledge map.

```bash
devcoach knowledge-remove old_framework
```

### `devcoach group-add <name>`

Register a new group.

```bash
devcoach group-add "Machine Learning"
```

### `devcoach group-remove <name>`

Delete a group. Topics in the group move to Other.

```bash
devcoach group-remove "Machine Learning"
```

### `devcoach group-assign <topic> <group>`

Move a topic to a group. Use `Other` to ungroup.

```bash
devcoach group-assign pytorch "Machine Learning"
devcoach group-assign deprecated_lib Other
```

---

## Lessons

### `devcoach lessons`

List lessons with optional filters.

```bash
devcoach lessons                              # all lessons, newest first
devcoach lessons --period today               # last 24h
devcoach lessons --period week                # last 7 days
devcoach lessons --period month               # last 30 days
devcoach lessons --period year                # last 365 days
devcoach lessons --category docker            # by category tag
devcoach lessons --level senior               # junior | mid | senior
devcoach lessons --project dev-coach          # fuzzy match on project name
devcoach lessons --repository UltimaPhoenix/dev-coach
devcoach lessons --branch feature/auth        # fuzzy match
devcoach lessons --commit abc123              # fuzzy match on hash prefix
devcoach lessons --starred                    # favourites only
devcoach lessons --feedback dont_know         # need to revisit
devcoach lessons --feedback know              # already mastered
devcoach lessons --feedback none              # no response given yet
devcoach lessons --search "generator"         # full-text search
devcoach lessons --date-from 2026-04-01
devcoach lessons --date-to 2026-04-30
devcoach lessons --date-from 2026-04-25T09:00 --date-to 2026-04-25T18:00
devcoach lessons --sort level --order asc     # sort by difficulty ascending
```

All filters can be combined.

### `devcoach lesson <id>`

Show a single lesson in full detail.

```bash
devcoach lesson lesson-python-generators-001
```

### `devcoach star <id>`

Toggle the starred (favourite) flag on a lesson.

```bash
devcoach star lesson-python-generators-001
# → Lesson lesson-python-generators-001 → ★ starred
```

### `devcoach feedback <id> <value>`

Record whether you understood a lesson. Adjusts knowledge confidence.

```bash
devcoach feedback lesson-python-generators-001 know       # +1 confidence
devcoach feedback lesson-python-generators-001 dont_know  # -1 confidence
devcoach feedback lesson-python-generators-001 clear      # remove feedback
```

---

## Stats

### `devcoach stats`

Overview: lesson counts, rate-limit status, top 5 weakest and strongest topics.

```
┌──────────────────────────────┐
│        Coaching Stats        │
├─────────────────────┬────────┤
│ Total lessons       │     42 │
│ Lessons today (24h) │  1 / 2 │
│ Lessons this week   │      7 │
│ Next lesson         │ Available now │
└─────────────────────┴────────┘

 Weakest topics          Strongest topics
 testing         (3)     docker           (8)
 rust            (3)     git              (7)
 kubernetes      (4)     debugging_mindset(8)
```

---

## Settings

### `devcoach settings`

Show current rate-limit settings.

### `devcoach set <key> <value>`

Update a setting.

```bash
devcoach set max_per_day 3        # 1-20, default 2
devcoach set min_gap_minutes 120  # 0-1440, default 240
```

---

## Setup

### `devcoach setup`

Interactive first-run wizard. Presents three paths:

1. Restore from backup zip
2. Automatic (detect stack from project files)
3. Manual (free-form topic entry)

Followed by optional group assignment and rate-limit settings.

### `devcoach install`

Register the devcoach MCP server (`devcoach mcp`) in Claude's config files.

```bash
devcoach install                  # both Claude Code + Claude Desktop
devcoach install --claude-code    # ~/.claude.json only
devcoach install --claude-desktop # claude_desktop_config.json only
devcoach install --force          # overwrite existing entry
```

---

## Backup & restore

### `devcoach backup [output]`

Export settings + knowledge map + all lessons as a zip archive.

```bash
devcoach backup                          # → devcoach-backup.zip
devcoach backup ~/backups/devcoach.zip   # custom path
```

### `devcoach restore <input>`

Restore from a backup zip. Settings are overwritten; duplicate lessons are skipped.

```bash
devcoach restore devcoach-backup.zip
```

---

## Web UI

### `devcoach ui`

Launch the web dashboard (see [Web UI](web-ui.md)).

```bash
devcoach ui              # http://localhost:7860
devcoach ui --port 8080  # custom port
```
