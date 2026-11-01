---
description: Import a lesson someone shared (code, link, URL or .devcoach.md text)
argument-hint: <devcoach:lesson code | share link | URL | pasted card | path to .devcoach.md>
allowed-tools: Bash(devcoach *)
---

Import a shared devcoach lesson. Run `devcoach api import_lesson -` with the Bash tool, the JSON
`{"payload": …}` on stdin through a quoted heredoc (`<<'EOF'`), `payload` = $ARGUMENTS
**verbatim** — a `devcoach:lesson:1:…` code, a share link, a URL, or the whole pasted card. If
$ARGUMENTS is a path to a `.devcoach.md` file, read the file and pass its contents instead.
Reply in one line as `result.reply_check` says: the title, who shared it, and that it joined the
coaching log without counting against the daily limit; "already in your log" for a duplicate.
If `topic_tracked` is false, offer to track the topic with `devcoach api add_topic` — only on
confirmation. Relay an `ok: false` error as it is (damaged code, too large, only public URLs).
Do nothing else.
