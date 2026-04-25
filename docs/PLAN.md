# Plan: MCP architecture refactor + onboarding + git auto-detection

## Context

Full re-review of the devcoach MCP server against the official MCP spec
(2025-11-25) and FastMCP 3.x capabilities. Three goals merged:

1. **Align primitives with the MCP spec** — read-only tools become resources
   (unlocks completions via `ref/resource` template params), add MCP logging.
2. **Onboarding with dynamic topic/group definition** — first-run guided setup where
   the user's groups and topics are built through conversation (MCP) or an interactive
   wizard (CLI). No hardcoded catalogue — everything is user-defined.
3. **Git auto-detection + usage defaults** — `log_lesson` fills missing git
   fields automatically, no longer relies on the AI running shell commands.

---

## Spec-driven primitive mapping

Per the MCP 2025-11-25 spec:
- **Tools** — model-controlled, for actions/mutations that change state
- **Resources** — app-controlled read-only data; templates enable completions
- **Prompts** — user-controlled templates injected into context
- **Completions** — only work via `ref/prompt` or `ref/resource` references
- **Logging** — `notifications/message` with RFC 5424 levels (debug → emergency)

### Current tools → target primitives

| Tool | Current | Target | Reason |
|---|---|---|---|
| `log_lesson` | Tool | **Tool** | Mutation — correct |
| `get_profile` | Tool + Resource | **Resource only** | Duplicate; resource `devcoach://profile` already exists — remove the tool, AI reads the resource |
| `update_knowledge` | Tool | **Tool** | Mutation — correct |
| `check_rate_limit` | Tool | **Resource** `devcoach://rate-limit` | Pure read; as resource enables caching and removes AI confusion about when to call it |
| `get_lessons` | Tool | **Tool** | Complex filtering with 12 params; keep as tool |
| `get_lesson` | Tool | **Resource template** `devcoach://lessons/{lesson_id}` | Simple ID lookup; template enables completion on lesson_id |
| `get_stats` | Tool | **Resource** `devcoach://stats` | Read-only aggregate — remove tool, add resource |
| `star_lesson` | Tool | **Tool** | Mutation — correct |
| `submit_feedback` | Tool | **Tool** | Mutation — correct |
| `add_topic` | Tool | **Tool** | Mutation — correct |
| `remove_topic` | Tool | **Tool** | Mutation — correct |
| `add_group` | Tool | **Tool** | Mutation — correct |
| `remove_group` | Tool | **Tool** | Mutation — correct |
| `update_settings` | Tool | **Tool** | Mutation — correct |
| `get_taught_topics` | Tool | **Resource** `devcoach://taught-topics` | Read-only list |
| `open_ui` | Tool | **Tool** | Side-effect launch — correct |
| `get_context` (new) | — | **Resource** `devcoach://context` | Read-only git + usage snapshot |
| `get_onboarding_status` (new) | — | **Resource** `devcoach://onboarding` | Read-only status; AI reads it, not calls it |
| `complete_onboarding` (new) | — | **Tool** | Mutation — correct |
| `devcoach_instructions` | Prompt | **Prompt** | Correct |

---

## Component A — Onboarding state

**File:** `src/devcoach/core/db.py`

- Add `"onboarding_completed": "0"` to `DEFAULT_SETTINGS`
- Add `is_onboarding_complete(conn)` helper
- Add `get_usage_defaults(conn)` — most-used project/repository/branch/platform from lessons

**No static topic catalogue.** Groups and topics are entirely user-defined.

---

## Component B — Git auto-detection

**New file:** `src/devcoach/core/git.py`

`detect_git_context()` — runs `git rev-parse`, `git remote get-url origin` via subprocess
(timeout=3, never raises). Parses GitHub/GitLab/Bitbucket remote URLs.

---

## Component C — Stack auto-detection

**New file:** `src/devcoach/core/detect.py`

`detect_stack(folder)` — scans for manifest files (package.json, pyproject.toml, Dockerfile,
.github/workflows, etc.) and returns `{topic_id: confidence}` as suggestions only.
User confirms/adjusts during onboarding.

---

## Component D — Updated `log_lesson`

Git fields auto-filled: caller value → git auto-detect → usage default → None.
MCP logging via `ctx.info()` when fields are auto-filled.

---

## Component E — Resource refactor

Remove tools: `get_profile`, `get_stats`, `get_taught_topics`, `check_rate_limit`

New resources: `devcoach://stats`, `devcoach://taught-topics`, `devcoach://rate-limit`,
`devcoach://context`, `devcoach://onboarding`, `devcoach://lessons/{lesson_id}`

---

## Component F — `complete_onboarding` tool

```python
complete_onboarding(
    topics: dict[str, int],           # {topic_id: confidence}
    groups: Optional[dict[str, list[str]]] = None,  # {group_name: [topic_ids]}
) -> Profile
```

Wipes default profile, saves user selections, assigns groups dynamically (no static catalogue),
marks `onboarding_completed = "1"`.

---

## Component G — SKILL.md

- Add **level standards** (professional bar, not tutorial level):
  - junior = working developer 1-3y production, learning correct practice
  - mid = ships independently, needs depth on trade-offs
  - senior = architecture/reliability/long-term decisions
- Add **session startup** section: read `devcoach://onboarding`, run flow if needed
- Onboarding flow: import backup OR auto (file detection suggestions) OR manual conversation
- Groups proposed by AI after all topics collected, never during collection

---

## Component H — `devcoach setup` CLI wizard

Import → auto (detect_stack) / manual (free-form) → group assignment → settings

Register as `"setup"` subcommand.

---

## Critical files

| File | Change |
|---|---|
| `src/devcoach/core/git.py` | **New** |
| `src/devcoach/core/detect.py` | **New** |
| `src/devcoach/core/db.py` | Add helpers + DEFAULT_SETTINGS update |
| `src/devcoach/mcp/server.py` | Resource refactor + new tools + log_lesson auto-fill |
| `src/devcoach/cli/commands.py` | Add `cmd_setup` |
| `src/devcoach/SKILL.md` | Level standards + onboarding trigger |
