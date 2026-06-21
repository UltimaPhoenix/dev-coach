# devcoach — Lesson format

How to render a coaching lesson in chat and how to save it via `log_lesson`.
The chat card and the stored record are deliberately different: the card carries
display chrome; the stored body is clean markdown.

## 1. Render in chat (display only)

Append exactly ONE lesson card at the bottom of your reply:

```
### ──────── 🎓 devcoach ────────
> [Category] · Level: [Junior|Mid|Senior]
> **[Title]**
> [3–6 short paragraphs explaining the *why*, tied to the task just completed.
> Include fenced code blocks where useful — keep them inside the blockquote.]
> 💡 *Senior tip:* [one line]
### ──────── [topic] · [level] ────────
```

- The bands are `###` headings made of box-drawing dashes (`─`, U+2500); every
  content line is prefixed with `> `.
- This chrome is **display only** — never store it.

## 2. Save via `log_lesson` (storage)

**Order matters: render the card in chat FIRST, then call `log_lesson`.** `log_lesson`
asks the user *"Did that land?"* (know / dont_know / skip), so the lesson must already be
visible — never call it before the card is printed.

Put each piece in its **own field** and do **not** repeat any of them inside `body`:

- `title`, `topic_id`, `categories`, `level`, `summary` — the structured fields.
- `body` — **only** the lesson prose plus the 💡 Senior tip, as **clean markdown**:
  no card bands, no `> ` blockquote, no title line, no "Category · Level" line.

A clean `body` looks like this (indented here only for illustration):

    You wrapped the parser in try/catch but swallow the error, so a malformed
    input fails silently instead of surfacing the problem…

    [more paragraphs; include fenced code blocks as needed]

    💡 *Senior tip:* keep failures loud — a swallowed exception hides the bug.
