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
knowledge_ready = false  →  run Steps 1–4 (topic collection + save)
notebook_ready  = false  →  run the notebook-composition part of Step 4 only
both ready               →  proceed normally
```

This means a user who restores from backup has their knowledge automatically, so
only the notebook step runs. On-demand re-setup ("redo onboarding", "reset my topics")
always re-runs Steps 1–4 regardless of `knowledge_ready`.

## Step 1 — Ask how to set up (strongly recommend Automatic; never pick for the user)

Read `devcoach://onboarding` FIRST — its `detected_stack`, `detected_projects`,
`scanned_projects`, and `notebook_path` come from a scan of the user's **full Claude
Code history** (every project Claude has worked in, ranked by recent activity), not
just the current folder. Keep `notebook_path` in scope — Step 4 needs it and there is
no reason to re-read this resource later in the same flow.

Then present a single choice using the client's question UI (e.g. AskUserQuestion in
Claude Code). Offer exactly four options, in this order:

- **Automatic (Strongly recommended)** — build the profile from the detected
  history-wide stack; cites the real evidence — name the project count and 2–3
  detected topics with where they were seen, e.g. *"I scanned 9 of your Claude Code
  projects and found TypeScript (dev-coach), Java (discordbot, over-night-runner),
  Swift (blueprince) — I can build your profile from that."* Builds and saves
  everything in one pass — you review the result afterward, not before.
- **Automatic (Deep)** — like Automatic, but also reads the real conversation content
  from your local Claude Code session history (not just file/activity metadata), for
  the most accurate, personalized profile and notebook it can produce. Be transparent
  about what this means, don't bury it: *"This reads actual conversation text from your
  local sessions, not just file and activity metadata — more accurate, but it means
  sharing more of your own local history with the model, as a one-time setup step on
  this machine. Everything else works the same."*
- **Guided** — a step-by-step conversation to map knowledge, confidence levels, and
  topic groups (thorough, interactive).
- **Import backup** — restore knowledge, lessons, and settings from an existing
  backup file.

When the scan found nothing (`scanned_projects` 0 or an empty `detected_stack`),
present Automatic without the evidence sentence — it falls back to the current
project's files (Automatic (Deep) stays available regardless — its value doesn't
depend on `scanClaudeHistory`'s metadata scan). Do **not** default to Automatic
silently — surface the choice and wait for the user's answer before proceeding.

**If Import backup:** ask for the file path and call `restore` (CLI) with it. Restore
brings back knowledge entries automatically — no further DB steps needed. Re-read
`devcoach://onboarding` after restore; if `knowledge_ready` is now true, skip to the
notebook-composition part of Step 4. If `notebook_ready` is also true, proceed normally.

## Step 2 — Build the topic list for the chosen mode

**Automatic mode:** build the merged topic list yourself, in one pass, no questions
asked — `detected_stack` (history-wide, already merged with the current project)
enriched with relevant entries from `default_topics` (the project's default knowledge
map), weighted by `prompt_count` and `last_activity` from `detected_projects` (a stack
the user works in daily deserves more topics than a one-off experiment). Do not ask the
user to confirm, adjust, or list anything else first — that happens after saving, in
Step 5.

**Automatic (Deep) mode:** run the "Automatic (Deep) procedure" below to get an
evidence-based `topics`/`groups`/`notebook` result, then skip straight to Step 4 (Deep's
subagent already decides groups and composes the notebook — don't redo Step 3 for it).

**Guided mode (unchanged — stays fully interactive):**
- Have a free-form conversation: *"Tell me about the technologies you work with
  day-to-day. For each one I'll ask how confident you are:
  1–3 = still learning · 4–6 = comfortable · 7–9 = strong · 10 = expert."*
- Use `default_topics` as a domain checklist: probe areas the user hasn't mentioned
  (languages, frameworks, databases, infrastructure, version control, CI/CD, testing,
  architecture patterns, etc.). Keep probing until the user says they're done.

### Automatic (Deep) procedure

1. Call `preview_deep_scan({months: 3})` — cheap, metadata-only, no prompt text read.
2. If `over_soft_limit` is false, go straight to step 4 below — no question asked.
3. If `over_soft_limit` is true, surface `candidate_count` and ask (three options):
   *narrow the window* (re-call `preview_deep_scan` with a smaller `months`, loop back
   to step 2); *proceed with all of them anyway* (cap what you hand the subagent at the
   25 most-recently-active `candidates`, and say so if you truncated); *pick specific
   projects* (show `candidates` — name, last_activity, prompt_count — as a plain bullet
   list and ask which to include by name, since an arbitrary-length list doesn't fit a
   multiple-choice UI).
4. Spawn a subagent (the `Agent` tool, a general-purpose subagent) with the confirmed
   project paths. Give it a fully self-contained prompt — it has its own Bash/Read/Glob
   tools and does not inherit devcoach's MCP tools, so instruct it explicitly:
   - For each project path, compute its escaped directory name
     (`path.replace(/[^a-zA-Z0-9]/g, "-")` — the same rule devcoach uses for its own
     memory index) and Glob `~/.claude/projects/<escaped>/*.jsonl` for that project's
     session transcripts.
   - Read a bounded sample per project (at most the 5 most-recent sessions — this is a
     sample for signal, not an exhaustive audit) — each line is JSON with a `type`
     (`user`/`assistant`) and a `message.content` field holding real conversation text.
     Cross-reference `memory/MEMORY.md` in the same project directory if present.
   - This is a deliberate, user-approved, one-time exception to devcoach's normal
     metadata-only rule — make that explicit in the subagent's instructions so it
     doesn't second-guess reading the content. Even so, tell it to favor synthesized
     observations over verbatim quotes in what it writes back, and to keep the raw
     transcript content out of its final answer — only a compact result crosses back to
     the parent conversation, never full transcript dumps.
   - Instruct it to return **only** a single fenced ` ```json ` block, nothing else,
     shaped:
     ```json
     {
       "topics": { "topic_id": 7 },
       "groups": { "Group Name": ["topic_id"] },
       "provenance": { "topic_id": "short evidence phrase, e.g. seen in discordbot + a retry-logic debugging session" },
       "notebook": "# devcoach — Coaching Notebook\n...full markdown per the template below..."
     }
     ```
5. Parse the subagent's JSON. If it's missing, malformed, or the subagent failed, fall
   back to plain Automatic mode's topic list (`detected_stack`/`default_topics`) instead
   of blocking onboarding — say nothing about the fallback, just proceed.

## Step 3 — Groups

**Automatic / Automatic (Deep):** groups are already decided as part of Step 2's
one-pass build (or came from the Deep subagent's `groups` field) — no confirmation gate
here. Pick logical group names the same way Guided does (Languages, Backend, Frontend,
Databases, DevOps, Version Control, Testing, or whatever fits what was actually found).

**Guided mode (unchanged — stays interactive):** once the full topic list is agreed —
- **Suggest logical groups** based on what was collected. These names emerge from the
  conversation — there is no fixed list.
- Show the proposed grouping: *"Here's how I'd organise these — does this look
  right? Any changes?"*

**Rule (all modes):** never ask about groups during topic collection in Guided mode —
propose them only after all topics are known.

## Step 4 — Save everything, then write the notebook directly

For **all three modes**, once topics and groups are decided (immediately for both
Automatic tiers; after the user confirms in Guided mode):

1. Call the MCP tool `complete_onboarding` with `topics` and `groups` only — there is no
   `notebook` argument. It guarantees `learning-state.md` exists and is non-empty (a
   placeholder if needed) the instant it saves the profile.
   ```json
   { "topics": { "lang_a": 7, "tool_b": 8 }, "groups": { "Languages": ["lang_a"], "DevOps": ["tool_b"] } }
   ```
2. **Immediately after**, write the real personalized notebook markdown directly to
   `notebook_path` (from Step 1's `devcoach://onboarding` read) using your own file
   tools — overwrite the placeholder right away, don't leave it standing. If
   `notebook_path` already has real content (re-onboarding, or restoring), read it first
   and fold prior notes in rather than discarding them.
3. Do not deliver a lesson in this turn — the rate-limit clock starts after onboarding.

### Notebook composition

Make it **personalized**: draw on everything you know about *this* user — the
onboarding conversation (Guided) or the real cross-project data in `detected_projects`
(Automatic) or the subagent's synthesis (Automatic (Deep)) — per-project stacks,
activity volume and recency, and each project's auto-`memory` excerpt (distilled facts
about how the user actually works). Cite project names and observed habits. Generic
boilerplate is a failure; write specific, real notes. In Automatic/Guided modes, never
quote prompt text (it is not in the data, by design) — Automatic (Deep) is the one
exception, and even there prefer synthesized observations over verbatim quotes. Use
this structure:

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

## Step 5 — Show the setup summary

After saving (or after a restore), show the user a concise summary of what was set up
— for the Automatic tiers, this is the FIRST time they see it, so this is also their
chance to ask for changes, not a formality: the topics with their confidences,
organised under their groups, as one `###` heading per group with a plain bullet list
underneath (no table, no prose paragraph):
```markdown
### Languages
- **python** — 7/10
- **typescript** — 5/10

### DevOps
- **docker** — 8/10
```
Topics with no group go under a trailing `### Other` heading, same bullet shape.

Then tell the user **how to change any of it later**, across all three surfaces:
- **In chat** — just ask, e.g. *"set my Python confidence to 7"*, *"add Rust at 4"*,
  or *"redo onboarding"*. (Backed by the `update_knowledge`, `add_topic`, and
  `add_group` tools.)
- **CLI** — `devcoach profile` to view; `devcoach knowledge-add <topic> <0-10>
  [--group <Group>]` to add/update; `devcoach knowledge-remove <topic>` to remove;
  `devcoach group-add` / `devcoach group-assign` to organise groups.
- **UI** — `devcoach ui` (web dashboard at http://localhost:7860), or ask me to open
  it (the `open_ui` tool).
