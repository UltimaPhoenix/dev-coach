---
description: Share a lesson as copyable text, a link or a .devcoach.md file
argument-hint: [last | <lesson id> | about <topic>] [as link|file] [with context] [anonymously]
allowed-tools: Bash(devcoach *)
---

Share one devcoach lesson. Resolve it from $ARGUMENTS with the Bash tool: empty or `last` → the
newest own lesson (`devcoach api get_lessons '{"limit":1,"imported":false}'`); a lesson id → that
id; `about <topic>` → `devcoach api get_lessons '{"search":"<topic>"}'` — if more than one
matches, list title + date and ask which one. Then run `devcoach api share_lesson` with a JSON
input carrying `lesson_id` and: `transport` = `link` for "as link", `file` for "as file",
otherwise `text`; `include_context: true` only for "with context"; `shared_by: ""` for
"anonymously" (e.g. `devcoach api share_lesson '{"lesson_id":"<id>","transport":"link"}'`).
Reply exactly as `result.reply_check` says (text: the card, then the `devcoach:lesson:1:…` line
in a fenced code block, verbatim; link: on its own line; file: write `markdown` to `filename`
and confirm the path). Do nothing else.
