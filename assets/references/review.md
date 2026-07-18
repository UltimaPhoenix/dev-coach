# devcoach — Review & rebuild flows

Read this file when the user asks to review or rebuild their coaching setup:
"review my notebook", "review my profile", "rebuild my notebook", "refresh my
profile from my projects", "any new tech I should track?". These flows are
**incremental and non-destructive** — the only destructive path is a full redo,
which lives in `references/onboarding.md`.

Route by intent:

```
review my profile / notebook      →  Review (below)
rebuild / refresh my notebook     →  Rebuild notebook (below)
new tech to track?                →  New tech check (below)
redo onboarding / reset topics    →  references/onboarding.md, Steps 1–3 (confirm first — it wipes)
```

## Review

1. Read `devcoach://briefing` — one silent read returns the profile, the taught
   topics, and the notebook.
2. Walk the user through the profile **grouped, not topic-by-topic**: show each
   group with its topics and confidences, and ask what looks wrong. Apply
   changes as they come: `update_knowledge` (confidence), `add_topic` /
   `remove_topic` (membership).
3. Then show the notebook section by section (Observations, Recurring patterns,
   Recommended focus, Open hypotheses). Ask what is stale or wrong. Fold the
   edits into a revised full markdown and save it with ONE `update_notebook`
   call at the end — never one call per edit.
4. Close with the New tech check below.

## Rebuild notebook

Re-derive the notebook from real data; the knowledge map is untouched.

1. Read `devcoach://onboarding` — `detected_projects` carries the history-wide
   evidence: per-project stacks, activity volume and recency, and auto-memory
   excerpts. Read `devcoach://briefing` for the current notebook and profile,
   and `get_lessons({period: "all"})` for feedback history (`dont_know` lessons
   are open gaps).
2. Compose a fresh notebook (structure in `references/onboarding.md`, Step 4):
   cite real cross-project observations — project names, stacks, what recurs,
   what the memories reveal about how the user works. Preserve prior notes that
   are still true; drop the stale ones. Never quote prompt text — it is not in
   the data, by design.
3. Show the draft, adjust to taste, save with `update_notebook`.

## New tech check (keep the profile curated)

Compare `detected_stack` + `detected_projects` (from `devcoach://onboarding`)
against the current profile:

- Candidate = a detected topic **absent from the profile** that appears in **2+
  scanned projects** or in the current project.
- Propose **at most 5** candidates, each with its evidence ("seen in discordbot
  and over-night-runner") and a suggested starting confidence (the detected
  value). Use the client's question UI; `add_topic` ONLY for the ones the user
  confirms — never add silently.
- Also surface retirement candidates: profile topics at confidence ≤ 3 that
  appear in **no** scanned project. Offer `remove_topic`; keeping them is fine.
- Nothing qualifies → say so in one line and stop. An overcrowded topic list
  dilutes lesson choice — fewer, real topics beat completeness.
