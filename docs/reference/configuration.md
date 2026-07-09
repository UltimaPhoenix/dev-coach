# Configuration

## Rate limits

devcoach has two rate-limit settings to prevent lesson overload:

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `max_per_day` | 2 | 1–20 | Maximum lessons in a rolling 24-hour window |
| `min_gap_minutes` | 240 | 0–1440 | Minimum minutes between consecutive lessons |

**Examples:**

```bash
# Aggressive learning: up to 5 lessons/day, no minimum gap
devcoach set max_per_day 5
devcoach set min_gap_minutes 0

# Conservative: 1 lesson/day, must be at least 8 hours apart
devcoach set max_per_day 1
devcoach set min_gap_minutes 480

# Disable rate limiting entirely (not recommended)
devcoach set max_per_day 20
devcoach set min_gap_minutes 0
```

Via MCP tool:

```json
{ "key": "max_per_day", "value": "3" }
{ "key": "min_gap_minutes", "value": "120" }
```

Via web UI: `devcoach ui` → Settings page.

---

## Lesson pacing (nudge)

Beyond the rate limits, devcoach paces the *coaching cue* itself — the hook signal that
asks the agent to deliver a lesson. This keeps coaching deliberately quiet: short
sessions may produce no lesson at all, by design.

| Setting | Default | Values | Description |
|---------|---------|--------|-------------|
| `nudge_every` | 10 | 0–∞ | Interactions (agent stops) between lesson cues. `0` = cue on every eligible stop |
| `nudge_scope` | `session` | `session` \| `global` | Count interactions per chat session, or across all sessions |

How the counter behaves:

- **Plan-mode turns don't count** — planning isn't coachable work.
- **Rate-limited stops keep accumulating**, so the cue fires at the first allowed stop.
- **When a cue fires, the counter resets** — no cue storms after the threshold.
- **A resolution restarts the window**: both `log_lesson` (lesson delivered) and
  `skip_lesson` (explicit decline) reset the counters.
- **An unresolved cue retries sooner**: if the agent neither logs a lesson (`log_lesson`)
  nor declines explicitly (`skip_lesson`), the next cue comes after
  `min(3, nudge_every)` further stops instead of the full threshold.
- **The card is enforced**: the stop after `log_lesson` verifies the lesson card is
  visible in the reply and reprints it once if it isn't.

`devcoach doctor` prints the live counters and explains whether the next stop would cue.

---

## Data location

```
~/.devcoach/coaching.db   — SQLite database
```

The database is created automatically on first run. All data is local — nothing is sent to any server.

---

## Database schema (reference)

```sql
-- Delivered lessons
lessons (
  id                  TEXT PRIMARY KEY,
  timestamp           TEXT NOT NULL,   -- ISO 8601 UTC
  topic_id            TEXT NOT NULL,
  categories          TEXT NOT NULL,   -- JSON array
  title               TEXT NOT NULL,
  level               TEXT NOT NULL,   -- junior | mid | senior
  summary             TEXT NOT NULL,
  task_context        TEXT,
  project             TEXT,
  repository          TEXT,
  branch              TEXT,
  commit_hash         TEXT,
  folder              TEXT,
  feedback            TEXT,            -- know | dont_know | NULL
  repository_platform TEXT,            -- github | gitlab | bitbucket | local
  starred             INTEGER NOT NULL DEFAULT 0
)

-- Knowledge map
knowledge (
  topic       TEXT PRIMARY KEY,
  confidence  INTEGER NOT NULL DEFAULT 5,   -- 0-10
  updated_at  TEXT NOT NULL
)

-- Named groups
knowledge_group_names (group_name TEXT PRIMARY KEY)
knowledge_groups (group_name TEXT, topic TEXT, PRIMARY KEY (group_name, topic))

-- Settings
settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)

-- Runtime-only pacing state (never included in backups)
nudge_state (session_id TEXT PRIMARY KEY, interactions INTEGER, updated_at TEXT)
cue_state (id INTEGER PRIMARY KEY CHECK (id = 1), pending INTEGER,
           last_cue_at TEXT, last_skip_reason TEXT)
```

---

## Backup strategy

devcoach stores everything in a single SQLite file. Recommended backup approach:

```bash
# Daily cron / scheduled task
devcoach backup ~/Dropbox/devcoach-$(date +%Y%m%d).zip

# Before a major change
devcoach backup devcoach-before-reset.zip
```

The backup zip contains four files:
- `settings.json` — rate-limit settings
- `knowledge.json` — topics, confidence scores, and group assignments
- `lessons.json` — full lesson history
- `learning-state.md` — the coaching notebook (when present)

All of them are restored by `devcoach restore <zip>`.

---

## Reset

To start fresh while keeping your lesson history:

```bash
# Save current knowledge before clearing
devcoach backup devcoach-before-reset.zip

# Re-run the onboarding flow
devcoach setup
```

To reset everything including lessons, delete the database:

```bash
rm ~/.devcoach/coaching.db
devcoach setup   # re-creates it
```
