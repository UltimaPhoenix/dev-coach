# devcoach — Dynamic calibration

Read this file when the hook cue marks the lesson as a notebook checkpoint (every
10 lessons — never count yourself), then run the four steps below.

## Step 1 — Fetch the window

Call `get_lessons()` (default `limit=10`, newest first) to get the last 10 lessons.
Read `devcoach://profile` for the current knowledge map.

## Step 2 — Per-topic signal analysis

Group the 10 lessons by `topic_id`. For each topic that appeared:

| Signal | Condition | Action |
|---|---|---|
| Consistent mastery | All feedback `know`, no `dont_know` | `update_knowledge(topic, +1)` if confidence < 9 |
| Persistent gap | 2+ lessons on same topic, any `dont_know` | `update_knowledge(topic, -1)` if confidence > 1 |
| Recurring topic | 3+ lessons on same topic, mixed or no feedback | no confidence change — note in notebook |
| New topic | `topic_id` absent from `devcoach://profile` | `add_topic` — see Step 3 |

Apply at most **one** `update_knowledge` call per topic per calibration run.
Never call `update_knowledge` on a topic with confidence 10 (already mastered).

## Step 3 — New topic discovery

For each lesson whose `topic_id` is not in `devcoach://profile`:
- 2+ lessons share this `topic_id` in the window → call `add_topic(topic_id, confidence=5)`;
  assign it to the same group as the closest related existing topic, or `"Other"` if unclear.
- Only 1 lesson on this `topic_id` → note under **Open hypotheses** in the notebook; do not add yet.

## Step 4 — Update the coaching notebook

Read `devcoach://briefing` for the current notebook text and its `notebook_path` — one
resource covers both. Merge findings into the relevant sections and write the complete
revised markdown directly to `notebook_path` (your own Write/Edit tool), overwriting the
file in one go:

- **Recurring patterns** — append any `topic_id` that appeared 3+ times, with its count
  and whether feedback was positive, negative, or absent.
- **Recommended focus** — replace or append topics that had 2+ `dont_know` in the window.
- **Open hypotheses** — add single-occurrence new topics not yet in the profile;
  remove hypotheses confirmed (topic added) or disproved (not seen in 20+ subsequent lessons).

Always update `_Last updated` to the current ISO timestamp.
Never delete prior entries — integrate new observations alongside existing ones.

Notebook observations can **raise or lower** the effective teaching angle
independently of the numeric score:

- "User absorbs theory but struggles to apply it" → favour worked examples over concepts
- "User tends to over-engineer" → anchor the lesson to concrete failure modes
- "Hypothesis: low confidence stems from bad early habits, not ignorance" → teach correction, not introduction
