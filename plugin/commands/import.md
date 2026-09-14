---
description: Import a lesson someone shared (code, link, URL or .devcoach.md text)
argument-hint: <devcoach:lesson code | share link | URL | pasted card | path to .devcoach.md>
allowed-tools: mcp__plugin_devcoach_devcoach__import_lesson, mcp__devcoach__import_lesson, mcp__plugin_devcoach_devcoach__add_topic, mcp__devcoach__add_topic
---

Import a shared devcoach lesson. Call the devcoach `import_lesson` tool with `payload` set to
$ARGUMENTS **verbatim** — a `devcoach:lesson:1:…` code, a share link, a URL, or the whole pasted
card. If $ARGUMENTS is a path to a `.devcoach.md` file, read the file and pass its contents
instead. Reply in one line as the tool's `reply_check` says: the title, who shared it, and that it
joined the coaching log without counting against the daily limit; "already in your log" for a
duplicate. If `topic_tracked` is false, offer to track the topic with `add_topic` — only on
confirmation. Relay tool errors as they are (damaged code, too large, only public URLs). Do nothing
else.
