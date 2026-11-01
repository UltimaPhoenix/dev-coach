---
title: Agent API
sidebar_label: Agent API (devcoach api)
description: The devcoach api command — how the coaching skill reads and writes devcoach from your agent's shell. Usage, the JSON envelope, exit codes, the 25 operations, and the one permission rule.
keywords: [devcoach api, devcoach agent api, devcoach operations, Bash(devcoach *), DEVCOACH_COMMAND]
---

# Agent API (`devcoach api`)

Your agent never talks to devcoach through a protocol: the coaching **skill** runs one shell
command per operation, and reads the JSON it prints back. Everything the skill does — read the
briefing, log a lesson, skip a cue, share, import, run a course — is one of the 25 operations
below. The same command is there for you, which is the easiest way to see exactly what the model
sees.

```bash
devcoach api <operation> ['<json>' | -]   # one operation, the input as JSON (default {})
devcoach api                              # the list of operations
devcoach api --json                       # the catalogue: every input as a JSON Schema
```

`-` reads the input from stdin — the skill uses a quoted heredoc for anything that carries a
lesson body or pasted text:

```bash
devcoach api log_lesson - <<'EOF'
{"id":"cache-stampede","topic_id":"redis","categories":["redis","caching"],"title":"Cache stampedes",
 "level":"mid","summary":"…","body":"When a hot key expires…\n\n💡 *Senior tip:* …"}
EOF
```

## The envelope and the exit codes

The command prints exactly **one JSON line** on stdout:

```json
{"ok":true,"result":…}
{"ok":false,"error":"log_lesson: invalid input — ✖ Invalid input: expected string, received number\n  → at id"}
```

| Exit code | Meaning |
|---|---|
| `0` | `ok: true` — `result` is the operation's answer |
| `1` | `ok: false` — the operation refused the input (schema) or the request (a missing lesson, a setting out of range, …); `error` says why and usually how to recover |
| `2` | Usage: an unknown operation, or an input that is not JSON |
| `3` | The database was upgraded by a newer devcoach (`SchemaTooNewError`): reads work, this write was refused — same code as every other CLI write |

A `result` may carry a **`reply_check`**: a sentence addressed to the model about what it must
write back (print the lesson card as the final text of the turn, quote a share code verbatim in a
fenced block, write the course document to a path, …). It exists because devcoach cannot see the
chat — the card the user reads is text the model writes, not something `log_lesson` shows.

## The operations (25)

| Operation | Purpose | Kind |
|---|---|---|
| `get_briefing` | Everything needed before a lesson, in one call: onboarding status, rate limit, taught topics, the knowledge profile, the coaching notebook text and its `notebook_path` | read |
| `get_onboarding` | Onboarding status, the stack detected across the full Claude Code history with per-project provenance, `default_topics`, `notebook_path` and `next_step` (what to do with the payload — an empty scan never blocks Automatic) | read |
| `get_profile` | The current knowledge map — topics, confidence 0–10, groups; `compat` is non-null when the database is newer than this devcoach | read |
| `preview_deep_scan` | Metadata-only pre-check for Automatic (Deep) onboarding: `months` (1–24, default 3) sets a rolling window; returns the candidate projects and `over_soft_limit`. Reads no conversation text | read |
| `complete_onboarding` | Save the initial profile (`topics` + `groups`) and mark onboarding done; guarantees a non-empty notebook placeholder — the model writes the real notebook to `notebook_path` itself | **destructive** |
| `log_lesson` | Save a delivered lesson — a pure save that never asks anything. Git context is auto-detected, the timestamp is always devcoach's clock, the pacing counters reset; returns the lesson plus a `reply_check` (write the card as the final text; never twice) | write |
| `skip_lesson` | Decline a lesson cue with a one-line `reason`; re-arms the pacing counter | write |
| `get_lessons` | Query the lesson history: `period`, `category`, `level`, git fields, `starred`, `imported`, `shared_by`, `feedback`, `search`, a date range; `limit` defaults to 10, `0` = all | read |
| `star_lesson` | Star / unstar a lesson (`starred`) | write |
| `delete_lesson` | Permanently delete a lesson | **destructive** |
| `submit_feedback` | Record `know` / `understood` / `dont_know` / `clear` under a lesson; only `know` moves confidence (+1, undone on change; idempotent) | write |
| `update_knowledge` | Adjust a topic's confidence by `delta` (clamped 0–10) | write |
| `add_topic` | Add or update a topic (`confidence` 0–10, default 5), optionally in a `group` | write |
| `remove_topic` | Remove a topic from the knowledge map | **destructive** |
| `add_group` | Create a knowledge group | write |
| `remove_group` | Delete a group (its topics move to Other) | **destructive** |
| `update_settings` | Set one setting by `key`: `max_per_day` (1–20), `min_gap_minutes` (0–1440), `nudge_every` (0–1000), `nudge_scope` (`session` \| `global`) or `share_name` (≤ 80 chars, empty clears); `value` is always a string | write |
| `share_lesson` | Hand a lesson to someone: `transport` `text` (the card plus one `devcoach:lesson:1:…` line), `link` (a server-less URL on the docs site) or `file` (`.devcoach.md` contents + `filename`); `include_context` adds project / branch / commit / task (a local folder path never travels); `shared_by` overrides the `share_name` setting (empty = anonymous) | read |
| `import_lesson` | Store a lesson someone shared — `payload` is whatever the user handed over, verbatim: the code, the whole card, a share link, a URL (fetched, public hosts only), `.devcoach.md` text or a lessons JSON export. A duplicate is a normal outcome; imported lessons never count against the daily limit | write |
| `open_ui` | Start the web dashboard in the background on `127.0.0.1` (`port` 1024–65535, default 7860) and return its `url`; `already_running` when one answers there | write |
| `stop_ui` | Stop the dashboard on `port`, whoever started it — graceful; `stopped: false` when nothing runs there | write |
| `create_course` | Start a [course](../usage/courses.md) from a lesson or a concept with the explored prerequisite chain; returns `course_dir` and `document_path` — the model writes the single HTML document there itself | write |
| `add_course_step` | Register a section of the course document (`anchor` = its `id`) as a step, appended or inserted `after` a position; the section must already exist | write |
| `update_course_progress` | A step's `todo` / `done` / `skipped` (the course completes itself once every step is done or skipped), or the course's `active` / `completed` / `abandoned` | write |
| `get_courses` | Courses with their steps, filtered by `course_id`, seed `lesson_id` or `status` | read |

Every operation validates its input with a schema (`devcoach api --json` prints them, each field
described) and never throws: a failure is `{"ok":false,"error":…}` with a recovery hint.
Feedback is never collected by `log_lesson`: the text line under the card is recorded on the
*next* turn with `submit_feedback`.

## Where the command comes from

The skill runs the bare `devcoach`. It resolves because:

- a **Homebrew** or **npm** install puts `devcoach` on your PATH, which the agent's shell inherits;
- the **Claude Code plugin** ships `bin/devcoach`, and Claude Code puts a plugin's `bin/` on the
  Bash tool's PATH while the plugin is enabled — so the skill works the same with or without a
  global install;
- the **Gemini extension** has nothing on the PATH: its launcher sets **`DEVCOACH_COMMAND`**
  (`node "<extension>/scripts/launch.mjs"`) and the hook cues spell that command out, so the model
  runs it instead of `devcoach`. You can set `DEVCOACH_COMMAND` yourself to make the hooks name any
  other command.

When the shell cannot find it at all, the skill falls back to `npx -y devcoach api …`.
`devcoach doctor` says whether the command resolves and points at an MCP registration a 2.x
devcoach left behind.

## The permission rule

Claude Code asks before running a shell command unless a rule allows it. The skill and the plugin
commands pre-approve exactly what they need for the turn that invokes them, with one rule:

```
Bash(devcoach *)
```

Add it to your own settings (`permissions.allow` in `~/.claude/settings.json`) to never be asked
about a devcoach command again. Keep it that narrow: a rule such as `Bash(node */launch.mjs *)`
would allow **every** `node` command, because everything before the first `*` is the prefix.

Version 3.0 replaced the MCP server with this command: the hooks cue the turn, the skill drives it,
and the model needs nothing but its shell. `devcoach mcp` still exists, hidden, only to say so
(it exits 1 with the reason) when an agent is still configured with the old registration —
`devcoach install` removes it.
