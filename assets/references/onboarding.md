# devcoach — Onboarding flow

Read this file when `devcoach://onboarding` reports `knowledge_ready: false` or
`notebook_ready: false`, or when the user explicitly asks to (re-)initialise their
profile ("setup devcoach", "redo onboarding", "reset my topics").

The onboarding flow runs inline, immediately before delivering a lesson, whenever
it is needed. There is no separate session startup phase — this makes the skill
robust to context compaction and plan-mode transitions.

Check `knowledge_ready` and `notebook_ready` from `devcoach://onboarding` independently
— each step can run alone:

```
knowledge_ready = false  →  run Steps 1–3 (topic collection + complete_onboarding)
notebook_ready  = false  →  run Step 4  (notebook initialisation)
both ready               →  proceed normally
```

This means a user who restores from backup has their knowledge automatically, so
only Step 4 runs. On-demand re-setup ("redo onboarding", "reset my topics") always
re-runs Steps 1–3 regardless of `knowledge_ready`.

## Step 1 — Ask how to set up (always ask; never pick for the user)

Present a single choice using the client's question UI (e.g. AskUserQuestion in
Claude Code). Offer exactly three options and mark **Automatic** as recommended:

- **Automatic (Recommended)** — detect the tech stack from this project and build a
  profile from it.
- **Guided** — a step-by-step conversation to map knowledge, confidence levels, and
  topic groups (thorough, interactive).
- **Import backup** — restore knowledge, lessons, and settings from an existing
  backup file.

Do **not** default to Automatic silently — surface the choice and wait for the user's
answer before proceeding.

**If Import backup:** ask for the file path and call `restore` (CLI) with it. Restore
brings back knowledge entries automatically — no further DB steps needed. Re-read
`devcoach://onboarding` after restore; if `knowledge_ready` is now true, skip to
Step 4. If `notebook_ready` is also true, proceed normally.

## Step 2 — Collect topics for the chosen mode

**Automatic mode:**
- Read `devcoach://onboarding` and present a merged topic list: `detected_stack`
  (auto-detected from project files) enriched with relevant entries from
  `default_topics` (the project's default knowledge map).
- Show each topic with its suggested confidence. Ask the user to confirm, adjust,
  or remove each: *"Looks right? Or enter 1–10 to change it."*
- After the list, ask: *"Anything else I missed? List any tools, languages,
  frameworks, or practices you work with regularly."* — add each with a confidence.

**Guided mode:**
- Have a free-form conversation: *"Tell me about the technologies you work with
  day-to-day. For each one I'll ask how confident you are:
  1–3 = still learning · 4–6 = comfortable · 7–9 = strong · 10 = expert."*
- Use `default_topics` as a domain checklist: probe areas the user hasn't mentioned
  (languages, frameworks, databases, infrastructure, version control, CI/CD, testing,
  architecture patterns, etc.). Keep probing until the user says they're done.

## Step 3 — Propose groups and save

Once the full topic list is agreed:
- **Suggest logical groups** based on what was collected. Examples:
  Languages, Backend, Frontend, Databases, DevOps, Version Control, Testing.
  These names emerge from the conversation — there is no fixed list.
- Show the proposed grouping: *"Here's how I'd organise these — does this look
  right? Any changes?"*
- When confirmed, call the MCP tool `complete_onboarding`, including the personalized
  `notebook` markdown you compose in Step 4 (so the profile and notebook are saved
  together):
  ```json
  {
    "topics": { "lang_a": 7, "tool_b": 8, "practice_c": 7 },
    "groups": { "Languages": ["lang_a"], "DevOps": ["tool_b"], "Version Control": ["practice_c"] },
    "notebook": "# devcoach — Coaching Notebook\n_Last updated: …_\n\n## Observations\n…"
  }
  ```
- Do not deliver a lesson in this turn — the rate-limit clock starts after onboarding.

**Rule:** Never ask about groups during topic collection. Propose them only in
Step 3 after all topics are known.

### Step 3b — Show the setup summary

After saving (or after a restore), show the user a concise summary of what was set up:
- The topics with their confidences, organised under their groups.

Then tell the user **how to change any of it later**, across all three surfaces:
- **In chat** — just ask, e.g. *"set my Python confidence to 7"*, *"add Rust at 4"*,
  or *"redo onboarding"*. (Backed by the `update_knowledge`, `add_topic`, and
  `add_group` tools.)
- **CLI** — `devcoach profile` to view; `devcoach knowledge-add <topic> <0-10>
  [--group <Group>]` to add/update; `devcoach knowledge-remove <topic>` to remove;
  `devcoach group-add` / `devcoach group-assign` to organise groups.
- **UI** — `devcoach ui` (web dashboard at http://localhost:7860), or ask me to open
  it (the `open_ui` tool).

## Step 4 — Compose the coaching notebook (pass it to `complete_onboarding`)

Do **not** write `learning-state.md` yourself — compose its full markdown and pass it
as the `notebook` field of the `complete_onboarding` call in Step 3. The tool saves it
to `~/.devcoach/learning-state.md` atomically with the profile (so it is never empty
and never created before the user finishes).

Make it **personalized**: draw on everything you know about *this* user — not only this
onboarding conversation, but how they work across **all their projects** (languages and
tools they reach for, recurring habits, strengths, and gaps you have observed elsewhere).
Generic boilerplate is a failure; write specific, real notes. Use this structure:

```markdown
# devcoach — Coaching Notebook
_Last updated: [ISO timestamp]_

## Observations
[Specific, real notes about this user: background, how they work across their
projects, confidence style, gaps. Personalized — never generic.]

## Recurring patterns
[Patterns you have noticed in how they build, debug, or structure work.]

## Recommended focus
[Topics the user flagged as priorities or areas of uncertainty.]

## Open hypotheses
[Things to watch for and confirm in future sessions.]
```

If re-onboarding or returning, fold prior notes into the markdown you pass —
`complete_onboarding` overwrites the file with exactly what you provide.
