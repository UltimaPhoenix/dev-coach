---
description: The 25 tools, 11 resources and 1 prompt of devcoach's MCP server, with their arguments, results and errors, and the client entry that starts it.
---

import { Card, Cards } from "@site/src/components/Cards";
import RefTable, { Tag } from "@site/src/components/RefTable";
import ToolFlow from "@site/src/components/ToolFlow";

# MCP server reference

devcoach's MCP server runs on your machine over **stdio**, starts with `devcoach mcp`
([client configuration](#client-configuration)) and is built on the official
[TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) of the
[Model Context Protocol](https://modelcontextprotocol.io).

<Cards columns={3}>
  <Card title="25 tools" label="Actions" to="#tools-25">
    Lessons, feedback and the knowledge map, onboarding, sharing, courses and the dashboard.
  </Card>
  <Card title="11 resources" label="Read-only data" to="#resources-11">
    From the pre-lesson briefing to a single lesson. JSON, except the notebook (markdown).
  </Card>
  <Card title="1 prompt" label="Instructions" to="#prompt">
    `devcoach_instructions`: the devcoach skill as one prompt, for clients without skills.
  </Card>
</Cards>

## Tools (25)

Each tool declares a title and MCP annotations and checks its arguments with a Zod schema. A result
that is an object also comes back as `structuredContent`; `get_lessons` returns its list as JSON text.
One lesson uses three of the tools, in this order, as the devcoach skill runs it
([How it works](../how-it-works.md) explains when a lesson is due):

<ToolFlow
  label="One lesson"
  steps={[
    { tool: "get_briefing", note: "Reads the profile, taught topics, notebook and rate limit in one call" },
    { tool: "log_lesson", note: "Saves the lesson. Nothing is shown yet" },
    { title: "The lesson card", note: "The model writes it as the last text of its reply, with the feedback line under it" },
    { tool: "submit_feedback", when: "Next turn", note: "Records your answer to that line" },
  ]}
  or={{ tool: "skip_lesson", note: "replaces the last three steps when the work just done is not worth a lesson. Nothing is printed." }}
/>

The tag under each tool name below is the annotation the tool declares to your client:

- <Tag kind="calm">read-only</Tag> changes nothing.
- <Tag>write</Tag> changes devcoach's data, or starts or stops the dashboard.
- <Tag kind="warn">destructive</Tag> deletes data; `complete_onboarding` replaces the whole knowledge map.
- <Tag>· open-world</Tag> reaches outside devcoach's database: a web address for `import_lesson`,
  the dashboard process on `127.0.0.1` for `open_ui` and `stop_ui`.

### Lessons

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `log_lesson` | Save a delivered lesson — a **pure save** that never elicits feedback. The body is stored without the chat card: quote markers, the `🎓 devcoach` header, the title line and the feedback line come off. Auto-fills git context, stamps the timestamp server-side, resets the pacing counters, and returns the saved lesson plus a `reply_check` self-check reminding the model that tool arguments are invisible to the user and the card must be written as the final text of the turn | write |
| `skip_lesson` | Decline a lesson cue with a one-line `reason`, which `devcoach doctor` shows. Re-arms the pacing counter | write |
| `get_lessons` | Query lesson history, newest first. Filters combine: `period` (`today`, `week`, `month`, `year`, `all`), `category`, `level`, `project` / `repository` / `branch` / `commit` (partial match), `starred`, `imported`, `shared_by`, `feedback` (or `none`), `search` (every word must match the title, topic, summary, body or sender), `date_from` / `date_to`. `limit` defaults to 10, `0` = all. Returns a JSON list of [lessons](#data-models) | *read-only* |
| `star_lesson` | Star or unstar a lesson. Returns `false` when the id does not exist | write |
| `delete_lesson` | Permanently delete a lesson. Returns `false` when the id does not exist | **destructive** |

</RefTable>

### Feedback and knowledge map

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `submit_feedback` | Record the answer under a lesson card: `know`, `understood`, `dont_know`, or `clear` to remove it. Only `know` moves confidence: +1 when it is set, −1 when it is changed or cleared. Repeating the stored answer changes nothing. Returns `false` when the lesson does not exist | write |
| `update_knowledge` | Add a signed `delta` to a topic's confidence, clamped 0–10. A topic that does not exist starts from 5. Returns the new confidence | write |
| `add_topic` | Add a topic, or set the confidence of one that exists (`confidence` 0–10, default 5). An optional `group` puts it in that group, created if needed | write |
| `remove_topic` | Remove a topic from the knowledge map and from its group. Returns `false` when it did not exist | **destructive** |
| `add_group` | Create an empty knowledge group. Returns `true`, also when the group already exists | write |
| `remove_group` | Delete a group; its topics move to Other. Returns `false` when it did not exist | **destructive** |

</RefTable>

### Onboarding and state

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `get_briefing` | Everything the skill reads before a lesson, in one call: `onboarding` (`knowledge_ready`, `notebook_ready`, `needs_onboarding`), `rate_limit` (`allowed`, `total_lessons`, and `reason` when a lesson is not allowed now), `taught_topics`, `profile`, `compat`, the `notebook` text and `notebook_path`, the file the model edits directly. Same payload as `devcoach://briefing` | *read-only* |
| `get_onboarding` | What onboarding needs: the same three flags; `detected_stack` (`{topic: suggested confidence}`, from the current folder and the 15 most recently active projects in your Claude Code history); `detected_projects` (per project: `name`, `path`, `topics`, `prompt_count`, `last_activity`, and `memory`, an excerpt of its Claude Code memory file); `scanned_projects`; `default_topics`; `context_ready` (a git branch was found); `notebook_path`; `compat`; and `next_step`, what the model should do with this payload (`null` once onboarding is done). Same payload as `devcoach://onboarding` | *read-only* |
| `get_profile` | The knowledge map: `knowledge` (`topic`, `confidence`), `groups` (`name`, `topics`) and `compat`. Same payload as `devcoach://profile` | *read-only* |
| `preview_deep_scan` | Metadata-only pre-check for Automatic (Deep) onboarding. `months` (1–24, default 3) sets a rolling window. Returns `window_months`, `cutoff`, `candidate_count`, `over_soft_limit` (more than 8 candidates; the skill then asks you to narrow the window, go on, or pick projects) and up to 50 `candidates` (`name`, `path`, `last_activity`, `prompt_count`). Uses only project paths and activity timestamps, and returns no prompt text | *read-only* |
| `complete_onboarding` | Replace the whole knowledge map with `topics` (`{topic: 0–10}`) and optional `groups` (`{group: [topics]}`; ungrouped topics go to Other). Every existing topic and group is deleted first. Creates a placeholder notebook if there is none; the model then writes the real one to `notebook_path`. Returns the new profile | **destructive** |

</RefTable>

<details>
<summary>A real `get_briefing` result (demo data)</summary>

```json
{
  "onboarding": {
    "knowledge_ready": true,
    "notebook_ready": true,
    "needs_onboarding": false
  },
  "rate_limit": { "allowed": true, "total_lessons": 6 },
  "taught_topics": [
    "ci_cd_pipeline_design",
    "docker_layer_caching"
    // … 4 more
  ],
  "profile": {
    "knowledge": [
      { "topic": "ci_cd", "confidence": 6 },
      { "topic": "ci_cd_pipeline_design", "confidence": 6 }
      // … 27 more
    ],
    "groups": [
      { "name": "Backend", "topics": ["django", "fastapi", "node_js"] }
      // … 8 more
    ]
  },
  "compat": null,
  "notebook": "# devcoach — Coaching Notebook\n_Last updated: 2026-04-28T12:00:00Z_\n\n## Observations\n…",
  "notebook_path": "~/.devcoach/learning-state.md"
}
```

</details>

<details>
<summary>A real `get_onboarding` result on a computer with no Claude Code history</summary>

```json
{
  "compat": null,
  "knowledge_ready": false,
  "notebook_ready": false,
  "needs_onboarding": true,
  "detected_stack": {},
  "detected_projects": [],
  "scanned_projects": 0,
  "default_topics": {
    "engineering": 8,
    "architecture": 8,
    "patterns": 7
    // … 21 more
  },
  "context_ready": false,
  "notebook_path": "~/.devcoach/learning-state.md",
  "next_step": "Let the user choose how to set up (lead with Automatic, never pick for them). No Claude Code history was found on this machine (detected_stack is empty). That does NOT block Automatic: use default_topics exactly as returned as the starting map — it is devcoach's general developer baseline, not a guess of yours — and tell the user it is a starting point that corrects itself as they work. Do not stop, do not ask again, do not switch to Guided unless they ask. Then save with complete_onboarding and write the notebook to notebook_path, in the same turn. The devcoach skill's references/onboarding.md has the full flow when the skill is available."
}
```

</details>

:::note[When `compat` is not `null`]

`get_briefing`, `get_onboarding` and `get_profile` carry `compat`. It is `null` normally. When another
devcoach install upgraded the database past what this one knows, it is an object (`readOnly`,
`dbSchema`, `appSchema`, `upgradedBy`, `minApp`): devcoach opens the database read-only, reads still
work, and every tool that writes to it fails until you update.

:::

### Sharing

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `share_lesson` | Hand a lesson to another person. `transport`: `text` (default: the card plus one `devcoach:lesson:1:…` line), `link` (a server-less URL on the docs site) or `file` (`.devcoach.md` contents and a `filename`). `include_context: true` adds project, branch, commit and task, and the repository when it is on GitHub, GitLab or Bitbucket; a local folder path never travels. The sender name is `shared_by` when you pass it (an empty string shares anonymously), else the `share_name` setting, else your git `user.name`. Returns the `code`, the chosen form, and a `reply_check` that says how the model must reply for that transport | *read-only* |
| `import_lesson` | Store a lesson someone shared. `payload` is what you were handed, verbatim: the code, the whole card, a share link (decoded on your machine), a web address (downloaded: public hosts only, 5 s, 256 KB, at most 3 redirects), `.devcoach.md` text or a lessons JSON export. Returns `kind`, `inserted`, `duplicated`, `invalid`, `lesson`, `topic_tracked` and a `reply_check`; a duplicate is a normal outcome, not an error. Imported lessons never count against the daily limit | write · open-world |

</RefTable>

### Courses

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `create_course` | Start a [course](../usage/courses.md) from a seed lesson (`lesson_id`) or from a concept, with the prerequisite chain explored with you (`[{concept, known}]`). The id is a slug of the title (`-2`, `-3` on a clash); an unknown `lesson_id` fails. Returns the course, `course_dir`, `document_path` (where the model writes the single HTML document itself), `seed_context` (the seed lesson's task, project, repository and branch) and a `reply_check` | write |
| `add_course_step` | Register a section of the course document as a step: `anchor` is the section's `id` and must already be in the document; `kind` is `concept`, `example`, `practice` or `check`. Appended, or inserted with `after` (`0` = first; the following steps are renumbered). Registering a step, or changing its status, also fills the document's code-highlighter placeholder when the document has code | write |
| `update_course_progress` | With `position`: set that step to `todo`, `done` or `skipped` (the course completes itself once every step is done or skipped). Without it: set the course to `active`, `completed` or `abandoned`. Returns the course with its steps | write |
| `get_courses` | Courses with their steps and `course_dir`, filtered by `course_id`, seed `lesson_id` or `status` | *read-only* |

</RefTable>

### Dashboard and settings

<RefTable>

| Tool | Purpose | Annotation |
|---|---|---|
| `open_ui` | Start the [web dashboard](../usage/web-ui.md) in the background on `port` (1024–65535, default 7860). It listens on `127.0.0.1` only. Replies with the address and opens no browser; says so when a dashboard already runs on that port | write · open-world |
| `stop_ui` | Stop the dashboard on `port` (default 7860), whoever started it. Requests in flight finish first. Returns `stopped: false` when nothing runs there | write · open-world |
| `update_settings` | Set one setting by key: `max_per_day` (1–20), `min_gap_minutes` (0–1440), `nudge_every` (0–1000), `nudge_scope` (`session` \| `global`) or `share_name` (≤ 80 chars, empty clears); `value` is always passed as a string. Returns all seven settings. `ui_theme` and `ui_home` are set on the dashboard | write |

</RefTable>

### When a call fails

- A tool that fails returns `isError: true` with the reason. Invalid arguments come back the same way.
- `get_lessons` and `get_courses` return an empty list when the database cannot be read.
- `open_ui` and `stop_ui` answer a port outside 1024–65535 with a plain `error: …` text, without
  `isError`.
- An id that does not exist is not an error for `star_lesson`, `delete_lesson`, `submit_feedback`,
  `remove_topic` and `remove_group`: they return `false`.

## Resources (11)

:::note[Why the skill reads state through tools]

The devcoach skill reads state through the `get_briefing` / `get_onboarding` / `get_profile` **tools**, which return the same payloads as the resources below: tool names resolve in every client, whereas reading a resource needs the client-specific server name (`plugin:devcoach:devcoach` under the Claude Code plugin, `devcoach` as a plain MCP entry). The resources stay for clients and users that browse them.

:::

Every resource is JSON except `notebook`, which is markdown.

<RefTable wideName>

| Resource | Returns |
|---|---|
| `devcoach://briefing` | The pre-lesson read. Same payload as [`get_briefing`](#onboarding-and-state) |
| `devcoach://onboarding` | Same payload as [`get_onboarding`](#onboarding-and-state) |
| `devcoach://profile` | Same payload as [`get_profile`](#onboarding-and-state) |
| `devcoach://notebook` | The coaching notebook, `learning-state.md`, as markdown. Empty when there is none yet |
| `devcoach://settings` | All seven settings (see [Configuration](configuration.md#settings)) |
| `devcoach://rate-limit` | `allowed`, `total_lessons` (shared lessons included) and `reason` when a lesson is not allowed now (see [How pacing works](configuration.md#rate-limits)) |
| `devcoach://stats` | `total_lessons`; `lessons_today` (last 24 h) and `lessons_this_week` (last 7 days), both counting your own lessons only; `imported_lessons`; and the five `weakest_topics` and five `strongest_topics` (`topic`, `confidence`) |
| `devcoach://taught-topics` | Every `topic_id` that has a lesson, shared lessons included |
| `devcoach://lessons/recent` | Up to 10 lessons from the last 7 days, newest first, shaped like [`get_lessons`](#data-models) |
| `devcoach://lessons/{lesson_id}` | One lesson by id (a URI template) |
| `devcoach://context` | `git`: the project, repository, branch, commit, folder and platform of the server's working directory. `usage_defaults`: your most used project, repository, branch and platform, which `log_lesson` falls back to |

</RefTable>

### When a read fails

No resource read throws. On a failure:

- `briefing`, `onboarding`, `profile`, `settings`, `stats`, `context` and `lessons/{lesson_id}` return
  `{ "error": "…" }` (for an unknown lesson id: `"Lesson '<id>' not found"`);
- `lessons/recent` returns `[{ "error": "…" }]`;
- `taught-topics` returns an empty list, and `notebook` an empty text;
- `rate-limit` returns `{ "allowed": false, "reason": "Rate limit check unavailable: …" }`.

## Prompt

`devcoach_instructions` returns the devcoach skill as one user message: `assets/SKILL.md` with its five
reference files inlined (`onboarding.md`, `calibration.md`, `review.md`, `sharing.md`, `course.md`),
for clients that cannot load the skill from a folder. You pick it from your client's prompt list
(Claude Code lists it as a slash command); clients do not load it on their own.

:::note[Automatic lessons do not use this prompt]

In Claude Code, Gemini CLI and Codex CLI, two hooks decide when a lesson is due and ask the model to
load the devcoach skill ([How it works](../how-it-works.md)). In other clients you ask for a lesson
yourself ([Install](../install/index.md) shows what each agent gets).

:::

## Data models

The database tables are in [Database schema](configuration.md#database-schema-reference). `log_lesson`
takes these arguments (snake_case, checked by Zod):

```json title="log_lesson arguments"
{
  "id": "promise-allsettled-vs-all",  // unique; the skill uses a slug of the title
  // no "timestamp" argument: log_lesson stamps the real current time
  "topic_id": "typescript",
  "categories": ["typescript", "performance"],
  "title": "Promise.allSettled vs Promise.all",
  "level": "mid",                      // junior | mid | senior
  "summary": "…",                      // 1–3 sentences, shown in the card
  "body": "…",                         // required: prose + 💡 tip, clean markdown
  "task_context": "…",                 // optional
  // optional, detected when omitted:
  "project": null, "repository": null, "branch": null,
  "commit_hash": null, "folder": null,
  "repository_platform": null          // github | gitlab | bitbucket | local
}
```

- An `id` that already exists replaces that lesson, its star and feedback included.
- Omitted git fields come from the server's working directory (`folder` is that directory, `project`
  its repository's or folder's name). Where git gives none, `repository`, `branch` and
  `repository_platform` fall back to your most used values.

Lessons returned by `log_lesson`, `get_lessons`, `import_lesson` and the lesson resources add five fields:

<RefTable>

| Field | Meaning |
|---|---|
| `timestamp` | When the lesson was saved or imported (UTC) |
| `starred` | `true` once you star it |
| `feedback` | Your answer under the card: `know`, `understood`, `dont_know`, or `null` |
| `imported` | `true` for a lesson someone shared with you; it never counts against the rate limit |
| `shared_by` | The sender's name; `null` when anonymous or your own |

</RefTable>

<details>
<summary>A real `get_lessons` result for `{"category": "git", "limit": 1}` (demo data)</summary>

```json
[
  {
    "id": "lesson-git-interactive-rebase-001",
    "timestamp": "2026-03-05T11:00:00Z",
    "topic_id": "git_interactive_rebase",
    "categories": ["git"],
    "title": "Interactive rebase — rewriting history before it becomes permanent",
    "level": "mid",
    "summary": "git rebase -i lets you squash, reorder, split, and reword commits before pushing; fixup commits keep the log clean without losing granular checkpoints during development.",
    "body": "`git rebase -i HEAD~N` opens an editor listing the last N commits, each prefixed with an instruction word. …",
    "task_context": "Cleaning up a feature branch before opening a pull request",
    "project": "dev-coach",
    "repository": "developer/dev-coach",
    "branch": "main",
    "commit_hash": "c9068af37dfbc688a9a5fa00209a44f241393f5b",
    "folder": "/home/user/development/claude-projects/dev-coach",
    "repository_platform": "github",
    "starred": true,
    "feedback": null,
    "imported": false,
    "shared_by": null
  }
]
```

</details>

## Client configuration

An MCP client starts devcoach with this entry. [Install](../install/index.md) has the steps and the
config file for each agent.

```json
{
  "mcpServers": {
    "devcoach": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "devcoach", "mcp"]
    }
  }
}
```

Claude Desktop reads it from:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

To try the tools and resources by hand, open the server in the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector npx -y devcoach mcp
```

### MCP Registry

devcoach is listed in the official [MCP Registry](https://registry.modelcontextprotocol.io) as
**`io.github.UltimaPhoenix/devcoach`**: the npm package `devcoach`, run over stdio. If your client
installs servers from the registry, check that the command it writes passes the `mcp` argument, as
the entry above does ([Other MCP agents](../install/other-agents.md#mcp-registry)).
