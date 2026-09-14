# devcoach — Sharing lessons

Read this file before the first share or import of a session — when the user wants to hand a
lesson to someone ("share this / the last lesson", "share the one about X as a link / file"),
hands you a lesson they were given (a `devcoach:lesson:` code, a share link, a URL, a
`.devcoach.md` file), or asks to see a lesson someone shared with them. Sharing is
**user-initiated**: the only time you bring it up yourself is the single offer after a star.

Route by intent:

```
share this / the last lesson / the one about X   →  Share (below)
import this / a pasted code, link, URL or file   →  Import (below)
show me / read me the lesson X shared            →  Show a shared lesson (below)
just starred a lesson                            →  The one offer (below)
```

## Share

1. **Pick the lesson.** "This" / "the last" = the lesson you delivered in this session if there
   is one, else `get_lessons({limit: 1, imported: false})`. "The one about X" =
   `get_lessons({search: X})`; with 2+ matches, list title + date and ask — never guess.
2. **Pick the transport.** Default `text` (chat, issues, mail — the card plus one
   `devcoach:lesson:1:…` line). `link` when they say link / URL or the receiver may not have
   devcoach yet (the page explains, shows the lesson and installs). `file` when they say file, PR,
   wiki or `.devcoach.md`.
3. **Context and name.** `include_context: true` only when they say so ("with context", "where it
   happened") — project, branch, commit and task; a local folder path never travels either way.
   The sender name is the `share_name` setting, then git `user.name`; "anonymously" →
   `shared_by: ""`. If they spell a different name, pass it as `shared_by` and offer **once** to
   remember it (`update_settings({key: "share_name", value})`) — never persist it silently.
4. **Call `share_lesson`** and reply exactly as its `reply_check` says: `text` → the card as
   markdown, then the code line inside a fenced code block, character for character (never wrap,
   truncate, paraphrase or split it); `link` → the link on its own line; `file` → write `markdown`
   to `filename` (in the workspace unless they named a path) with your file tool and confirm the
   path. Say once what travelled: only the lesson, or lesson + context.

## Import

1. Hand `import_lesson({payload})` **exactly what the user gave you** — the code, the whole copied
   card, the link, a URL, the contents of a `.devcoach.md`, or a lessons JSON export. If they name a
   file path, read the file and pass its contents. Never retype or "clean up" a code.
2. Reply in one line per the tool's `reply_check`:
   - `inserted: 1` → title, who shared it, and that it joined the coaching log (feedback works as
     usual; it never counts against the daily limit).
   - `duplicated: 1` → "already in your log as `<id>`" — a normal outcome, not an error.
   - `topic_tracked: false` → offer to track the topic with `add_topic` (fluent use → 6–7,
     uncertain → 4–5, first encounter → 2–3); only on confirmation.
   - `isError` → relay the message (damaged or incomplete code, too large, newer devcoach, only
     public URLs) and suggest the fix it implies — usually "copy the whole text again".
3. Do not deliver a lesson in the same turn and do not add the feedback line: an import is an
   ordinary reply.

## Show a shared lesson

"Show me what Ada shared", "read me the lesson I imported", "the lesson about X someone sent":
`get_lessons({imported: true, search: …})` (ask if 2+ match), then render it as a normal card —
both bands, the title line with `Category · Level`, the body, the 💡 tip — **without**
`log_lesson` and **without** the "Did that land?" line. It is already in their log, taught by
someone else; it costs nothing on the rate limit. Record feedback only if they volunteer it
("I knew this" → `submit_feedback(id, "know")`).

## The one offer

Right after a `star_lesson` succeeds — and only then — offer once, in one short line:
*"Want to hand this one to a teammate? ↗ (text, link or file)"*. A yes runs the Share flow on
that lesson; a no, or no reply, drops it for good. Never offer on delivery, on feedback, on an
import, or twice for the same lesson.

## Never

- Reflow, abbreviate or reconstruct a `devcoach:lesson:` code — any changed character breaks it.
- Import anything the user did not hand you, or fetch a URL they did not paste.
- Include context or a name the user did not ask for.
- Mention the rate limit unless they ask why an imported lesson "did not count".
