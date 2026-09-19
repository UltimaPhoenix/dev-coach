# Courses — a step-by-step path from what the user knows to what they couldn't follow

A course is the answer to ❌ *couldn't follow*: instead of another lesson at the same
height, a path that starts where the user actually stands. It is **user-initiated**
("explain this properly", "teach me X step by step", "start a course", `/devcoach:course`,
or a *yes* to the one offer you make after a ❌) and it runs **in chat**; the dashboard is
the viewer (Courses page, the document, the progress). The course itself is ONE rich,
self-contained HTML document that **you write with your file tools** at the path
`create_course` returns — never pasted into the chat.

Never start a course inside a cued turn: resolve the cue first (`log_lesson` or
`skip_lesson`, the hard rules), then begin on the user's next message. While a course is
active the hooks pause lesson cues, so the conversation is yours until it is completed or
abandoned — finish it, or set it `abandoned`, rather than leaving it hanging.

## 1. Seed

- From a lesson: the one the user points at, else the newest `get_lessons({feedback:
  "dont_know", limit: 1})`. Keep its `topic_id`; its `task_context` and git metadata come
  back from `create_course` as `seed_context` — draw examples from that work.
- From a free concept ("teach me logarithms"): pick a `topic_id` as for a lesson.
- Read `get_briefing` once: the profile's confidence on the topic sets the depth of every
  step, and a tracked topic at confidence ≥ 6 is a floor the exploration never digs below.

## 2. Explore the prerequisites — one question per message

Build the chain **top-down**, from the target concept toward the ground the user stands
on, asking ONE yes/no question per message and waiting for the answer:

> To explain **logarithms** I first need **powers**. Do you know what 2³ means? (yes / no / roughly)

- *yes* → stop: that concept is the floor. *roughly* → treat as known but plan a short
  refresher as step 1. *no* → go one level down ("to explain powers I need multiplication…").
- Stop at the first *yes*, at a profile topic with confidence ≥ 6, or at depth 5 — a
  chain longer than that is two courses; say so and start with the lower one.
- Keep it to one question per message, no lecturing between questions, no "great!".
- Record the chain as `[{concept, known}]` top-down, then reflect it back in one line:
  *"So: sums ✓ → multiplication ✗ → powers ✗ → logarithms ✗. I'll start from multiplication."*

## 3. Plan and create

- 3–7 steps, **bottom-up** from the first known concept to the target; each step = one idea.
  Kinds: `concept` (the idea), `example` (worked, from the user's own work when
  `seed_context` allows), `practice` (try it), `check` (a question with a reveal).
- `create_course({title, topic_id, goal, lesson_id?, prerequisites})`. Its result carries
  `course_dir`, `document_path` and `seed_context`.

## 4. Write the document

ONE file at `document_path`, then `add_course_step` per section in order
(`anchor` = the section id). The contract — the viewer serves the file inside a sandboxed
frame with a strict CSP, so anything outside it fails silently:

- **Self-contained**: inline `<style>` and inline `<script>` only. **No external URLs** (no
  CDN, fonts, images from the web), **no `fetch`/XHR**, **no `<form>`** (buttons with click
  handlers instead), **no `alert`/`confirm`/`prompt`**, no `target="_blank"` links out.
- Light + dark via `prefers-color-scheme`, using the dashboard's palette (greys, indigo
  `#4f46e5` accents, rose for warnings). Readable at 720px wide.
- A sticky step nav at the top (links to `#step-N`, the current one highlighted on scroll).
- One `<section id="step-N">` per step, in order, each with: **Goal** (one line) → **The
  idea** (short, one concept, an analogy where it helps) → **Worked example** → **Try it**
  (a live, editable example whenever the subject allows — JS/HTML/CSS/regex/SQL-in-JS run
  in the page; otherwise a fill-the-blank) → **Check yourself** (one question, a *Reveal*
  button, and what a wrong answer usually means).
- Depth from the user's confidence band on the topic; vocabulary introduced before use.

Skeleton (adapt, keep the ids):

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Course title</title>
<style>/* :root + @media (prefers-color-scheme: dark) tokens; nav, section, .try, .check */</style>
</head><body>
<nav><a href="#step-1">1 · Sums</a> … </nav>
<section id="step-1"><h2>1 · Sums</h2><p class="goal">…</p> … <div class="check">…<button>Reveal</button></div></section>
<section id="step-2">…</section>
<script>/* nav highlight, reveal buttons, the live examples */</script>
</body></html>
```

## 5. Teach — one step per message

For each step, in chat: 4–8 lines of the idea in your own words, the pointer *"Step N is on
the dashboard → Courses"*, then the step's check question. Then wait.

- Correct → `update_course_progress({course_id, position, status: "done"})` and the next
  step in the next message.
- Wrong or unsure → re-explain from a different angle (a new example, a smaller piece);
  never advance silently. Two misses → offer to split the step.
- "skip" → `status: "skipped"` and move on. "stop" / "later" → leave it `active`; it
  resumes with `get_courses({status: "active"})` ("continue the course").

## 6. Finish

When every step is done or skipped the course completes itself. Close with two lines: what
the user can now do, and where the document lives. If the course grew from a ❌ lesson,
offer ONCE: *"Want me to mark that lesson as understood now?"* → `submit_feedback(lesson_id,
"understood")` only on a yes. Offer nothing else — no star, no share, no new lesson.
