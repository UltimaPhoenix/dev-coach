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

**Ask with choices when the answer is a pick; ask in text when the answer must be typed.**
In a client with a question UI (AskUserQuestion in Claude Code) every yes / no / roughly
question, every "which of these" and every offer is presented as selectable options — the
user should never have to type *yes*. A question whose answer is a snippet's output, a value
or an explanation stays free text. Without a question UI (Gemini CLI, Codex CLI) use the
text form with the options in parentheses.

## 1. Seed

- From a lesson: the one the user points at — by id, or **by description**: run
  `get_lessons({search, limit: 5})` with the 2–3 most specific words of what they said
  (`search` covers title, topic, summary and body). One match → it is the seed; say so in
  one line (*"Seed: **HTMX and redirects** · Sep 19"*). Several → offer them as choices
  (title · date · feedback icon) plus a last *"None of these — a free concept"*. None → a
  free concept. No argument at all → the newest `get_lessons({feedback: "dont_know", limit: 1})`,
  else the newest lesson.
- **A course may already exist for that seed**: check `get_courses({lesson_id})` (or
  `get_courses({status: "active"})` for a free concept with the same title). If one does,
  ask before anything else, as choices: **Continue it** (only when active — resume at its
  first `todo` step), **Redo it** (set it `abandoned`, then create a fresh one), **Keep both**
  (a second course, the id gets a `-2` suffix), **Cancel**. Never overwrite a course
  document without this question.
- Keep the lesson's `topic_id`; its `task_context` and git metadata come back from
  `create_course` as `seed_context` — draw examples from that work.
- From a free concept ("teach me logarithms"): pick a `topic_id` as for a lesson.
- Read `get_briefing` once: the profile's confidence on the topic sets the depth of every
  step, and a tracked topic at confidence ≥ 6 is a floor the exploration never digs below.

## 2. Explore the prerequisites — one question per message

Build the chain **top-down**, from the target concept toward the ground the user stands
on, asking ONE question per message and waiting for the answer:

> To explain **logarithms** I first need **powers**. Do you know what 2³ means?

Offer the three answers as choices — **Yes** ("I can explain it") · **Roughly** ("seen it,
a refresher would help") · **No** ("new to me") — or, without a question UI, end the line
with *(yes / no / roughly)*.

- *yes* → stop: that concept is the floor. *roughly* → treat as known but plan a short
  refresher as step 1. *no* → go one level down ("to explain powers I need multiplication…").
- Stop at the first *yes*, at a profile topic with confidence ≥ 6, or at depth 5 — a
  chain longer than that is two courses; say so and start with the lower one.
- Keep it to one question per message, no lecturing between questions, no "great!".
- Record the chain as `[{concept, known}]` top-down, then reflect it back in one line:
  *"So: sums ✓ → multiplication ✗ → powers ✗ → logarithms ✗. I'll start from multiplication."*

## 3. Plan and create

- 3–7 steps, **bottom-up** from the first known concept to the target; each step = one idea
  that fits in working memory — a step the reader finishes in a few minutes beats a
  complete one. Kinds: `concept` (the idea), `example` (worked, from the user's own work
  when `seed_context` allows), `practice` (try it), `check` (a question with a reveal).
- `create_course({title, topic_id, goal, lesson_id?, prerequisites})`. Its result carries
  `course_dir`, `document_path` and `seed_context`.

## 4. Write the document

ONE file at `document_path`, then `add_course_step` per section in order
(`anchor` = the section id). The viewer serves the file inside a sandboxed frame with a
strict CSP, and the same file must read well opened on its own — so the contract:

**Self-contained.** Inline `<style>` and inline `<script>` only. **No external URLs** (no CDN,
fonts, images from the web), **no `fetch`/XHR**, **no `<form>`** (buttons with click handlers
instead), **no `alert`/`confirm`/`prompt`**, no `target="_blank"` links out. Anything outside
this fails silently in the viewer.

**One step at a time.** A left **step menu** (`<nav class="steps">`: numbered entries, the
current one highlighted) and a content pane that shows **exactly one `<section id="step-N">`**;
under 900 px the menu becomes a strip above the content. Routing by `location.hash`
(`#step-N`, no hash → step 1): on `hashchange` show that section, scroll to the top. Every
section ends with *← Previous · Next →* buttons and the line *"Stuck? Ask in the chat — that's
where the course is being taught."* Mark `:root[data-embedded] nav.steps { display: none }`:
the dashboard injects `data-embedded`, has its own step list, makes the canvas transparent and
lifts the `max-width` of `.course`, `section` and `header.intro` to use the width it has — so
keep those class names.

**Each section**, in order: **Goal** (one line) → **The idea** (short, one concept, an analogy
where it helps) → **Worked example** → **Try it** (see the ladder below) → **Check yourself**
(one question, a *Reveal* button; the reveal says what each wrong answer usually means). Depth
from the user's confidence band on the topic; vocabulary introduced before use. Quiz options
have the same length and no formatting hint — the wording carries no clue.

**Try it — a ladder by language.** The code is in the **seed's language** (the lesson's
`categories` / `seed_context`: Java, C#, Rust, Go, Python, Swift, Kotlin, SQL…) and is never
translated into JS just to make it runnable:

1. JS, TS-as-JS, HTML, CSS, regex, SQL-in-JS → an **editable box that really runs**:
   `new Function(code)` inside `try/catch` (the viewer's CSP allows eval), errors rendered
   into the page, output captured through a local `log()` — never `console` alone.
2. Any other language → the snippet stays read-only and highlighted in that language, and
   the interaction is one of: a **JS simulation of the concept** (toggles and buttons driving
   a model of the semantics — labelled *simulation*, never a fake "Run"), **predict the
   output** (typed or picked, then Reveal), **fill the blank**, or **spot the bug** (3–4
   candidates). No button may pretend to execute Java, Rust or Go.

**Design.** One measure (~68ch), generous spacing, quiet Tufte-like typography; light + dark
using the dashboard's palette (greys, indigo `#4f46e5` accents, rose for warnings). It must
also pass as a Claude artifact page: `<title>` is a 2–4 word name (the long title is the
`<h1>`), colour tokens live on `:root`, dark tokens are set under
`@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])` and again
under `:root[data-theme="dark"]`, `body` has an explicit background, 16 px side gutters at
phone width, no horizontal page scroll.

Skeleton (adapt, keep the ids and the class names):

```html
<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Node error events</title>
<style>
  :root { --bg:#f8fafc; --panel:#fff; --text:#0f172a; --muted:#64748b; --line:#e2e8f0; --accent:#4f46e5; --accent-soft:#eef2ff; --warn:#e11d48; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0b1220; --panel:#111a2e; --text:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --accent:#818cf8; --accent-soft:#1e1b4b; --warn:#fb7185; } }
  :root[data-theme="dark"] { --bg:#0b1220; --panel:#111a2e; --text:#e2e8f0; --muted:#94a3b8; --line:#1e293b; --accent:#818cf8; --accent-soft:#1e1b4b; --warn:#fb7185; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.6 system-ui, sans-serif; }
  .course { display:grid; grid-template-columns:16rem minmax(0,1fr); gap:24px; max-width:1100px; margin:0 auto; padding:24px 16px; }
  nav.steps { position:sticky; top:16px; align-self:start; } nav.steps a { display:block; padding:6px 10px; border-radius:8px; color:var(--muted); text-decoration:none; }
  nav.steps a.current { background:var(--accent-soft); color:var(--accent); }
  :root[data-embedded] nav.steps { display:none } :root[data-embedded] .course { grid-template-columns:minmax(0,1fr); }
  section { display:none; max-width:68ch; } section.current { display:block; }
  @media (max-width: 900px) { .course { grid-template-columns:minmax(0,1fr); } nav.steps { position:static; display:flex; flex-wrap:wrap; gap:4px; } }
  /* .goal, .try, .check, .pager, buttons … */
</style></head><body>
<div class="course">
  <nav class="steps"><a href="#step-1">1 · Sums</a><a href="#step-2">2 · Powers</a></nav>
  <main>
    <section id="step-1"><h2>1 · Sums</h2><p class="goal">…</p> … <div class="check">…<button>Reveal</button></div>
      <div class="pager"><a href="#step-1">← Previous</a><a href="#step-2">Next →</a></div>
      <p class="ask">Stuck? Ask in the chat — that's where the course is being taught.</p></section>
    <section id="step-2">…</section>
  </main>
</div>
<script>
  // show one section: on load + hashchange, toggle .current on the section and its nav link, scrollTo(0,0)
  // reveal buttons; the live examples (new Function inside try/catch) or the simulations
</script></body></html>
```

### 4b. Share as an artifact — an offer, nothing more

After the last `add_course_step`, **if the Artifact tool is available**, offer ONCE, as a
choice: *"Publish this course as a Claude artifact too? (private until you share the
link)"* — **Yes** → publish `document_path` as it is (`icon: "course"`, `description` = the
goal) and reply with the link in one line; **No**, or no Artifact tool → nothing. The local
file stays the course; the artifact is a copy for sharing, and the user can ask for it again
any time ("publish the course as an artifact"). Never store the link anywhere.

## 5. Teach — one step per message

For each step, in chat: 4–8 lines of the idea in your own words, the pointer *"Step N is on
the dashboard → Courses"*, then the step's check question. Then wait.

Classify the check before asking: a **pick** (the order of N lines, yes/no, which of 3–4
candidates, spot the bug) is offered as choices with a last *"Not sure"*; a **typed** answer
(write the output, name the value, explain why) is asked as text. The re-check after a miss
follows the same rule.

- Correct → `update_course_progress({course_id, position, status: "done"})` and the next
  step in the next message.
- Wrong or unsure → re-explain from a different angle (a new example, a smaller piece);
  never advance silently. Two misses → offer to split the step: add the new `<section>` to
  the document right after the current one (update the nav and the pagers) and register it
  with `add_course_step({…, after: <current position>})` so the order matches.
- "skip" → `status: "skipped"` and move on. "stop" / "later" → leave it `active`; it
  resumes with `get_courses({status: "active"})` ("continue the course").

## 6. Finish

When every step is done or skipped the course completes itself. Close with two lines: what
the user can now do, and where the document lives. If the course grew from a ❌ lesson,
offer ONCE, as a **Yes / No** choice: *"Want me to mark that lesson as understood now?"* →
`submit_feedback(lesson_id, "understood")` only on a yes. Offer nothing else — no star, no
share, no new lesson.
