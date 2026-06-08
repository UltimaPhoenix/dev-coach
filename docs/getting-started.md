# Getting started

devcoach is an AI-integrated coaching tool — it lives inside your agent (Claude Code, Cursor, Windsurf, etc.) and delivers lessons automatically as you work. There is no separate app to open and no workflow to change.

---

## Prerequisites

- Claude Code, Claude Desktop, or another MCP-compatible agent
- [uv](https://docs.astral.sh/uv/) (for uvx / uv tool installs) · Python 3.12+
- No Python required for Homebrew installs

---

## 1. Install

| Method | Command |
|--------|---------|
| **Homebrew** (macOS / Linux — recommended) | `brew tap UltimaPhoenix/tap && brew install devcoach` |
| **uv tool** (permanent) | `uv tool install devcoach` |
| **uvx** (no install) | used directly in MCP config — see Step 2 |

---

## 2. Connect to your agent

### Claude Code / Claude Desktop

Run once after installing:

```bash
devcoach install
```

Sample output:

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

**Restart Claude Code / Claude Desktop** after running.

### Manual registration (Claude Code)

```bash
# via claude CLI
claude mcp add devcoach devcoach -- mcp          # uv tool / Homebrew
claude mcp add devcoach uvx -- devcoach mcp      # uvx
claude mcp add --scope global devcoach devcoach -- mcp  # global scope
```

Or edit `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "devcoach": { "type": "stdio", "command": "devcoach", "args": ["mcp"] }
  }
}
```

Add Stop hooks to `~/.claude/settings.json`:

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

### Manuel registration (Claude Desktop)

Edit the config file for your platform:

| Platform | Config file |
|----------|-------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

```json
{
  "mcpServers": {
    "devcoach": { "command": "devcoach", "args": ["mcp"] }
  }
}
```

### Other MCP-compatible agents (Cursor, Windsurf, Cline, Continue, Zed)

Add the server entry to the agent's config file:

```json
{
  "mcpServers": {
    "devcoach": { "command": "devcoach", "args": ["mcp"] }
  }
}
```

| Agent | Config file |
|-------|-------------|
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** (VS Code) | VS Code Settings → `cline.mcpServers` |
| **Continue.dev** | `~/.continue/config.json` → `mcpServers` |
| **Zed** | `.zed/settings.json` → `context_servers` |

> Stop hooks (automatic lesson delivery) are Claude Code-specific. Other agents can invoke coaching manually by prompting their agent or calling the MCP tools directly.

**Claude.ai web** is not supported — it does not implement the MCP protocol that devcoach requires.

### Backup and restore

Export your full profile before switching machines:

```bash
devcoach backup                    # → devcoach-backup.zip
devcoach restore devcoach-backup.zip
```

The backup includes your knowledge map, all lessons, settings, and coaching notebook.

---

## 3. Onboarding

The first time your agent connects to devcoach, it detects that your profile isn't set up and walks you through it inline — no separate command needed.

### Phase 1 — Choose setup mode

```
devcoach: Your knowledge profile isn't set up yet.

Do you have an existing devcoach backup to restore?
If yes, provide the file path — otherwise I'll help you build
your profile from scratch.
```

**Option A — restore from backup:** Provide the path to your backup zip. Your full profile (knowledge map, lessons, settings) is imported instantly and you skip the rest of onboarding.

**Option B — build from scratch:** Choose between automatic detection or a guided conversation.

---

### Phase 2A — Automatic stack detection (recommended)

devcoach scans your project files and proposes your stack:

```
I detected these technologies in your project:

  python         → confidence 6  (keep? or enter 0–10 to adjust)
  docker         → confidence 7  (keep? or enter 0–10 to adjust)
  github_actions → confidence 6  (keep? or enter 0–10 to adjust)
  fastapi        → confidence 5  (keep? or enter 0–10 to adjust)

Anything I missed? List any tools, languages, or practices
you work with regularly.
```

You confirm, adjust confidence scores, or add topics the scan missed. Then devcoach proposes logical groups and saves your profile.

---

### Phase 2B — Guided conversation

If you prefer to describe your stack manually:

```
devcoach: Tell me about the technologies you work with day-to-day.
          For each one I'll ask how confident you are:
          1–3 = still learning · 4–6 = comfortable · 7–9 = strong · 10 = expert

You: I mostly do Node.js and TypeScript backend, some React, PostgreSQL,
     Docker. About 3 years experience.

devcoach: Got it. Let me go through each:

  Node.js — you said mostly. I'd say 7. Sound right?
  TypeScript — comfortable or strong?
  React — how often, and how deep?
  PostgreSQL — raw SQL or mostly ORM?
  Docker — day-to-day or just deployment?
```

devcoach probes until you're done, then proposes groupings.

---

### Phase 3 — Groups and save

```
Here's how I'd organise your topics:

  Languages  → python, typescript, javascript
  Backend    → fastapi, node, django
  DevOps     → docker, github_actions
  Databases  → postgresql, redis

Does this look right? Any changes?
```

When you confirm:

```
✓ Profile saved — 24 topics across 6 groups.

From now on I'll deliver a short lesson after technical tasks,
calibrated to your current confidence on each topic.
```

---

## 4. CLI alternative

Run the onboarding wizard in your terminal instead of through your agent:

```bash
devcoach setup
```

---

## 5. Your first lesson

Work on any technical task with your agent. After the response, devcoach appends a lesson:

```
You: Refactor this endpoint to handle concurrent requests properly.

[agent refactors the code]

---
🎓 devcoach · Python · Level: Mid

**asyncio.TaskGroup — structured concurrency without gather() surprises**

asyncio.gather() swallows exceptions from sibling tasks by default. If one
coroutine fails, the others keep running and the exception is only raised
after all of them complete — or silently dropped if return_exceptions=True.

TaskGroup (Python 3.11+) is the fix: it cancels all sibling tasks the moment
one raises, and re-raises immediately. No silent failures, no leaked coroutines.

    async with asyncio.TaskGroup() as tg:
        task_a = tg.create_task(fetch_user(user_id))
        task_b = tg.create_task(fetch_orders(user_id))

💡 Senior tip: TaskGroup also makes collecting results trivial — read
   task.result() after the block, no zip() gymnastics needed.

Did that land?  ✅ know · ❌ don't know · ⏭ skip
```

Responding adjusts your confidence on that topic and shapes future lessons.

---

## 6. Track your progress

### Web dashboard

```bash
devcoach ui   # → http://localhost:7860
```

| Page | What you can do |
|------|-----------------|
| **Knowledge map** | See all topics with confidence bars; adjust scores directly |
| **Lessons** | Browse and filter your full lesson history; star lessons to revisit |
| **Settings** | Change rate limits, import/export your profile, take a backup |

### CLI

```bash
devcoach stats          # overview + weakest/strongest topics
devcoach lessons        # full history
devcoach profile        # knowledge map with confidence bars
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
