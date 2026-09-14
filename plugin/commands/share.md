---
description: Share a lesson as copyable text, a link or a .devcoach.md file
argument-hint: [last | <lesson id> | about <topic>] [as link|file] [with context] [anonymously]
allowed-tools: mcp__plugin_devcoach_devcoach__share_lesson, mcp__devcoach__share_lesson, mcp__plugin_devcoach_devcoach__get_lessons, mcp__devcoach__get_lessons
---

Share one devcoach lesson. Resolve it from $ARGUMENTS: empty or `last` → the newest own lesson
(`get_lessons` with `limit: 1`, `imported: false`); a lesson id → that id; `about <topic>` →
`get_lessons` with `search` — if more than one matches, list title + date and ask which one.
Then call the devcoach `share_lesson` tool with `lesson_id` and: `transport` = `link` for
"as link", `file` for "as file", otherwise `text`; `include_context: true` only for "with
context"; `shared_by: ""` for "anonymously". Reply exactly as the tool's `reply_check` says
(text: the card, then the `devcoach:lesson:1:…` line in a fenced code block, verbatim; link: on
its own line; file: write `markdown` to `filename` and confirm the path). Do nothing else.
