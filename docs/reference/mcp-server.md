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
{ "mcpServers": { "devcoach": { "type": "stdio", "command": "npx", "args": ["-y", "devcoach", "mcp"] } } }
```

Claude Desktop config file: macOS `~/Library/Application Support/Claude/claude_desktop_config.json` ·
Windows `%APPDATA%\Claude\claude_desktop_config.json` · Linux `~/.config/Claude/claude_desktop_config.json`.

## MCP Registry

devcoach is published in the official [MCP Registry](https://registry.modelcontextprotocol.io) as
**`io.github.UltimaPhoenix/devcoach`** (npm package `devcoach`, stdio transport). Registry-aware
clients can look it up by that name and install it directly; the entry resolves to the same
`npx -y devcoach mcp` command as the manual configuration above, so both paths run the identical
local server.

## Tools (15)

| Tool | Purpose | Annotation |
|---|---|---|
| `log_lesson` | Save a delivered lesson — a **pure save** that never elicits feedback. Auto-fills git context, stamps the timestamp server-side, resets the pacing counters, and returns the saved lesson plus a `reply_check` self-check reminding the model that tool arguments are invisible to the user and the card must be written as the final text of the turn | write |
| `skip_lesson` | Decline a lesson cue with a one-line reason; re-arms the pacing counter | write |
| `preview_deep_scan` | Metadata-only pre-check for Automatic (Deep) onboarding: `months` (1–24, default 3) sets a rolling window; returns `window_months`, `cutoff`, `candidate_count`, `over_soft_limit` (more than 8 candidates — ask the user to narrow the window) and `candidates[]` (`name`, `path`, `last_activity`, `prompt_count`). Reads no conversation text | read-only |
| `update_knowledge` | Adjust a topic's confidence by a delta (clamped 0–10) | write |
| `get_lessons` | Query lesson history (period, category, level, git, starred, feedback, search, date range); `limit` defaults to 10, `0` = all | read-only |
| `star_lesson` | Star / unstar a lesson | write |
| `delete_lesson` | Permanently delete a lesson | **destructive** |
| `submit_feedback` | Record `know` / `dont_know` / `clear`; adjusts confidence ±1 (idempotent) | write |
| `add_topic` | Add/update a topic (confidence 0–10, default 5), optionally in a group | write |
| `remove_topic` | Remove a topic from the knowledge map | **destructive** |
| `add_group` | Create a knowledge group | write |
| `remove_group` | Delete a group (topics move to Other) | **destructive** |
| `update_settings` | Set one setting by key: `max_per_day` (1–20), `min_gap_minutes` (0–1440), `nudge_every` (0–1000) or `nudge_scope` (`session` \| `global`); `value` is always passed as a string | write |
| `open_ui` | Launch the web dashboard in the background on `127.0.0.1` (`port` 1024–65535, default 7860) | open-world |
| `complete_onboarding` | Save the initial profile (topics + groups) and mark onboarding done; guarantees a non-empty notebook placeholder (the model writes the real notebook directly, see [privacy.md](privacy.md)) | **destructive** |

Each tool declares a `title` and read-only/destructive hints, validates input with Zod, returns typed
`structuredContent` where applicable, and reports failures as `{ isError: true, … }` with a recovery hint.
Feedback is never collected inline: the text line under the lesson card is recorded on the *next* turn via
`submit_feedback`.

## Resources (11)

`devcoach://briefing` · `profile` · `notebook` (text/markdown) · `settings` · `lessons/recent` ·
`stats` · `taught-topics` · `rate-limit` ·
`context` · `onboarding` · `lessons/{lesson_id}` (templated). All return `application/json` — except
`notebook`, which is `text/markdown` — and never throw: on error they return `{ "error": … }`.
**`briefing` is the pre-lesson read**: one call returns onboarding status, rate limit, taught topics,
the knowledge profile, and the coaching notebook text — the individual resources remain for the
dashboard and targeted queries. `onboarding` carries the onboarding flags plus the history-wide
`detected_stack`, `detected_projects` provenance (`name`, `topics`, `prompt_count`, `last_activity`,
`memory`), `scanned_projects`, and `default_topics`. Both `briefing` and `onboarding` also carry
`notebook_path` — the resolved absolute path to `learning-state.md` — so the model can
Read/Write/Edit the notebook file directly instead of round-tripping its full markdown through a
tool call.

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
  // timestamp is not an argument — log_lesson always stamps the real current time server-side
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
