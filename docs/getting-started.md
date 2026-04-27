# Getting started

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- Python 3.12+
- Claude Code or Claude Desktop

---

## 1. Install

### One-time run (no permanent install)

```bash
uvx devcoach mcp
```

### Permanent install

```bash
uv tool install devcoach
```

---

## 2. Register with Claude

```bash
devcoach install
```

This writes the MCP server entry into both Claude Code (`~/.claude.json`) and Claude Desktop config. Pass `--claude-code` or `--claude-desktop` to target one only, or `--force` to overwrite an existing entry.

**Restart Claude Code / Claude Desktop** after installing.

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
  python        → confidence 6  (keep? or enter 0-10)
  docker        → confidence 7  (keep? or enter 0-10)
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
  Version Control → git, git_rebase, conventional_commits

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
