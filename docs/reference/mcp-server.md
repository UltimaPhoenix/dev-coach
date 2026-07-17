# MCP server reference

devcoach implements the [Model Context Protocol](https://modelcontextprotocol.io) via the official
[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), served over **stdio**.

The server exposes **tools** (actions), **resources** (read-only data), and a **prompt** (coaching
instructions). Start it with `npx -y devcoach mcp`, or inspect it with:

```bash
npx @modelcontextprotocol/inspector npx -y devcoach mcp
```

## Configuration

```json
{ "mcpServers": { "devcoach": { "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Claude Desktop config file: macOS `~/Library/Application Support/Claude/claude_desktop_config.json` ·
Windows `%APPDATA%\Claude\claude_desktop_config.json` · Linux `~/.config/Claude/claude_desktop_config.json`.

## Tools (15)

| Tool | Purpose | Annotation |
|---|---|---|
| `log_lesson` | Save a delivered lesson (auto-fills git context; elicits inline feedback) | write |
| `skip_lesson` | Decline a lesson cue with a one-line reason; re-arms the pacing counter | write |
| `update_notebook` | Overwrite the coaching notebook (`learning-state.md`) with revised markdown | write |
| `update_knowledge` | Adjust a topic's confidence by a delta (clamped 0–10) | write |
| `get_lessons` | Query lesson history (period, category, level, git, starred, feedback, search, date range) | read-only |
| `star_lesson` | Star / unstar a lesson | write |
| `delete_lesson` | Permanently delete a lesson | **destructive** |
| `submit_feedback` | Record `know` / `dont_know` / `clear`; adjusts confidence ±1 (idempotent) | write |
| `add_topic` | Add/update a topic, optionally in a group | write |
| `remove_topic` | Remove a topic from the knowledge map | **destructive** |
| `add_group` | Create a knowledge group | write |
| `remove_group` | Delete a group (topics move to Other) | **destructive** |
| `update_settings` | Set `max_per_day` (1–20) or `min_gap_minutes` (0–1440) | write |
| `open_ui` | Launch the web dashboard in the background | open-world |
| `complete_onboarding` | Save the initial profile (topics + groups) and mark onboarding done | **destructive** |

Each tool declares a `title` and read-only/destructive hints, validates input with Zod, returns typed
`structuredContent` where applicable, and reports failures as `{ isError: true, … }` with a recovery hint.

## Resources (11)

`devcoach://briefing` · `profile` · `notebook` (text/markdown) · `settings` · `lessons/recent` ·
`stats` · `taught-topics` · `rate-limit` ·
`context` · `onboarding` · `lessons/{lesson_id}` (templated). All return `application/json` and never
throw — on error they return `{ "error": … }`. **`briefing` is the pre-lesson read**: one call
returns onboarding status, rate limit, taught topics, the knowledge profile, and the coaching
notebook — the individual resources remain for the dashboard and targeted queries.

## Prompt

`devcoach_instructions` returns the full coaching instructions (`assets/SKILL.md` plus its reference
files, inlined). MCP prompts are surfaced as user-invocable slash commands (Claude Code, Claude
Desktop) — they are **not** auto-injected into context. In Claude Code, coaching is driven by the
`stop-hook`/`prompt-hook` pair: the Stop cue invokes the devcoach **skill** deterministically (with a
compact self-contained fallback when the skill isn't installed), and the model can decline via
`skip_lesson` when the turn wasn't technical.

## Data models

See [configuration.md](configuration.md) for the SQLite schema. The `Lesson` shape accepted by
`log_lesson` (snake_case, validated by Zod):

```jsonc
{
  "id": "uuid-or-random",
  "timestamp": "2026-01-15T20:30:00Z",   // ISO 8601; normalized to UTC, clamped to now
  "topic_id": "typescript",
  "categories": ["typescript", "performance"],
  "title": "Promise.allSettled vs Promise.all",
  "level": "mid",                          // junior | mid | senior
  "summary": "…",                          // shown in the lesson card
  "body": "…",                             // optional full markdown
  "task_context": "…",                     // optional
  "project": null, "repository": null, "branch": null,
  "commit_hash": null, "folder": null, "repository_platform": null  // auto-detected from git when omitted
}
```
