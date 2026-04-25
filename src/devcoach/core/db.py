"""SQLite schema, migrations, and pure query helpers for devcoach."""

from __future__ import annotations

import io
import json
import sqlite3
import zipfile
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Generator, Optional

from devcoach.core.models import KnowledgeEntry, KnowledgeGroup, Lesson, Settings

# ── Constants ──────────────────────────────────────────────────────────────

DB_PATH = Path.home() / ".devcoach" / "coaching.db"

DEFAULT_PROFILE: dict[str, int] = {
    "general_engineering": 8, "software_architecture": 8,
    "design_patterns": 7, "debugging_mindset": 8,
    "node_js": 7, "javascript": 7, "typescript": 6,
    "python": 4, "django": 3, "fastapi": 4,
    "docker": 8, "docker_compose": 8, "traefik": 7,
    "coolify": 7, "postgresql": 6, "redis": 6,
    "git": 7, "ci_cd": 6, "security": 5,
    "performance_optimization": 6, "testing": 5,
    "linux_cli": 7, "networking": 6, "react": 5, "html_css": 5,
}

DEFAULT_SETTINGS: dict[str, str] = {
    "max_per_day": "2",
    "min_gap_minutes": "240",  # replaces min_hours_between
}

# Ordered category → topic list mapping for the knowledge map UI.
# Topics not listed here land in "Other".

# ── Connection ─────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """Open a connection to the DB, creating the directory if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_initialized_connection() -> sqlite3.Connection:
    """Open a connection, run schema init, and return it ready to use."""
    conn = get_connection()
    init_schema(conn)
    return conn


@contextmanager
def connection() -> Generator[sqlite3.Connection, None, None]:
    """Context manager that opens an initialized connection and guarantees close."""
    conn = get_initialized_connection()
    try:
        yield conn
    finally:
        conn.close()


# ── Schema init ────────────────────────────────────────────────────────────

def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables, indexes, and seed defaults if needed. Idempotent."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS lessons (
            id                  TEXT PRIMARY KEY,
            timestamp           TEXT NOT NULL,
            topic_id            TEXT NOT NULL,
            categories          TEXT NOT NULL,
            title               TEXT NOT NULL,
            level               TEXT NOT NULL,
            summary             TEXT NOT NULL,
            task_context        TEXT,
            project             TEXT,
            repository          TEXT,
            branch              TEXT,
            commit_hash         TEXT,
            folder              TEXT,
            feedback            TEXT,
            repository_platform TEXT,
            starred             INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS knowledge (
            topic       TEXT PRIMARY KEY,
            confidence  INTEGER NOT NULL DEFAULT 5,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Named groups registry — exists independently of topic assignments.
        CREATE TABLE IF NOT EXISTS knowledge_group_names (
            group_name TEXT PRIMARY KEY
        );

        -- Maps topics to named groups for the knowledge map display.
        -- Topics not present here appear under "Other".
        CREATE TABLE IF NOT EXISTS knowledge_groups (
            group_name TEXT NOT NULL,
            topic      TEXT NOT NULL,
            PRIMARY KEY (group_name, topic)
        );

        -- Period/date-range filters, rate-limit count, get_last_lesson_timestamp,
        -- and the default ORDER BY timestamp DESC all benefit from this index.
        CREATE INDEX IF NOT EXISTS idx_lessons_timestamp
            ON lessons (timestamp);

        -- Starred filter combined with timestamp sort (common listing pattern).
        CREATE INDEX IF NOT EXISTS idx_lessons_starred_ts
            ON lessons (starred, timestamp);

        -- Feedback equality filter (feedback = ? / IS NULL) and ORDER BY feedback.
        CREATE INDEX IF NOT EXISTS idx_lessons_feedback
            ON lessons (feedback);

        -- get_taught_topics uses SELECT DISTINCT topic_id; also covers ORDER BY topic_id.
        CREATE INDEX IF NOT EXISTS idx_lessons_topic_id
            ON lessons (topic_id);
    """)
    conn.commit()
    _seed_defaults(conn)


def _migrate(conn: sqlite3.Connection) -> None:
    """Placeholder for future schema migrations. No-op while schema is current."""
    pass


def _seed_defaults(conn: sqlite3.Connection) -> None:
    """Seed knowledge and settings tables on the first run. Idempotent."""
    row = conn.execute("SELECT COUNT(*) FROM knowledge").fetchone()
    if row[0] == 0:
        now = datetime.now(timezone.utc).isoformat()
        conn.executemany(
            "INSERT INTO knowledge (topic, confidence, updated_at) VALUES (?, ?, ?)",
            [(topic, confidence, now) for topic, confidence in DEFAULT_PROFILE.items()],
        )

    for key, value in DEFAULT_SETTINGS.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )

    conn.commit()


# ── Lessons ────────────────────────────────────────────────────────────────

def insert_lesson(conn: sqlite3.Connection, lesson: Lesson) -> None:
    """Insert or replace a lesson record."""
    conn.execute(
        """INSERT OR REPLACE INTO lessons
           (id, timestamp, topic_id, categories, title, level, summary,
            task_context, project, repository, branch, commit_hash, folder,
            repository_platform, starred, feedback)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            lesson.id,
            lesson.timestamp_iso,
            lesson.topic_id,
            json.dumps(lesson.categories),
            lesson.title,
            lesson.level,
            lesson.summary,
            lesson.task_context,
            lesson.project,
            lesson.repository,
            lesson.branch,
            lesson.commit_hash,
            lesson.folder,
            lesson.repository_platform,
            1 if lesson.starred else 0,
            lesson.feedback,
        ),
    )
    conn.commit()


def _lesson_where(
    period: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit: Optional[str] = None,
    starred: Optional[bool] = None,
    search: Optional[str] = None,
    feedback: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> tuple[str, list[object]]:
    """Build the WHERE clause and params list for lesson queries."""
    conditions: list[str] = []
    params: list[object] = []

    if date_from is not None or date_to is not None:
        if date_from is not None:
            conditions.append("timestamp >= ?")
            params.append(date_from)
        if date_to is not None:
            conditions.append("timestamp <= ?")
            params.append(date_to + "T23:59:59")
    else:
        cutoff = _period_to_cutoff(period)
        if cutoff is not None:
            conditions.append("timestamp >= ?")
            params.append(cutoff)

    if category is not None:
        conditions.append("categories LIKE ?")
        params.append(f'%"{category}"%')
    if level is not None:
        conditions.append("level = ?")
        params.append(level)
    if project is not None:
        conditions.append("project LIKE ?")
        params.append(f"%{project}%")
    if repository is not None:
        conditions.append("repository LIKE ?")
        params.append(f"%{repository}%")
    if branch is not None:
        conditions.append("branch LIKE ?")
        params.append(f"%{branch}%")
    if commit is not None:
        conditions.append("commit_hash LIKE ?")
        params.append(f"%{commit}%")
    if starred is not None:
        conditions.append("starred = ?")
        params.append(1 if starred else 0)
    if search is not None:
        conditions.append("(title LIKE ? OR topic_id LIKE ? OR summary LIKE ?)")
        like = f"%{search}%"
        params.extend([like, like, like])
    if feedback == "none":
        conditions.append("feedback IS NULL")
    elif feedback is not None:
        conditions.append("feedback = ?")
        params.append(feedback)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    return where, params


def count_filtered_lessons(
    conn: sqlite3.Connection,
    **kwargs: object,
) -> int:
    """Return the total number of lessons matching the given filters."""
    where, params = _lesson_where(**kwargs)  # type: ignore[arg-type]
    row = conn.execute(f"SELECT COUNT(*) FROM lessons {where}", params).fetchone()
    return int(row[0])


_SORT_COLUMNS = frozenset({"timestamp", "level", "topic_id", "title", "feedback"})


def get_lessons(
    conn: sqlite3.Connection,
    period: Optional[str] = None,
    category: Optional[str] = None,
    level: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit: Optional[str] = None,
    starred: Optional[bool] = None,
    search: Optional[str] = None,
    feedback: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    sort: str = "timestamp",
    order: str = "desc",
    page: Optional[int] = None,
    per_page: int = 25,
) -> list[Lesson]:
    """Return lessons filtered by period, category, level, git metadata, starred flag, and/or search text.

    period: today | week | month | year | all | None (same as all)
    category: exact tag match inside the JSON categories array
    level: junior | mid | senior
    project, repository, branch: fuzzy match on metadata columns
    commit: fuzzy match on commit_hash
    starred: True for starred only, False for unstarred only, None for all
    search: fuzzy match across title, topic_id, and summary
    date_from / date_to: ISO date strings (YYYY-MM-DD); take precedence over period when set
    page / per_page: if page is given, apply LIMIT/OFFSET pagination
    """
    where, params = _lesson_where(
        period=period, category=category, level=level, project=project,
        repository=repository, branch=branch, commit=commit,
        starred=starred, search=search, feedback=feedback,
        date_from=date_from, date_to=date_to,
    )
    col = sort if sort in _SORT_COLUMNS else "timestamp"
    direction = "ASC" if order.lower() == "asc" else "DESC"
    query = f"SELECT * FROM lessons {where} ORDER BY {col} {direction}"
    if page is not None:
        query += " LIMIT ? OFFSET ?"
        params = list(params) + [per_page, (page - 1) * per_page]
    rows = conn.execute(query, params).fetchall()
    return [_row_to_lesson(row) for row in rows]


def toggle_star(conn: sqlite3.Connection, lesson_id: str) -> bool:
    """Flip the starred flag on a lesson. Returns the new starred state."""
    conn.execute(
        "UPDATE lessons SET starred = CASE WHEN starred=1 THEN 0 ELSE 1 END WHERE id = ?",
        (lesson_id,),
    )
    conn.commit()
    row = conn.execute("SELECT starred FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    return bool(row["starred"]) if row else False


def set_feedback(
    conn: sqlite3.Connection, lesson_id: str, feedback: Optional[str]
) -> Optional[str]:
    """Set feedback ('know'/'dont_know'/None) on a lesson. Returns topic_id for knowledge update."""
    conn.execute(
        "UPDATE lessons SET feedback = ? WHERE id = ?",
        (feedback or None, lesson_id),
    )
    conn.commit()
    row = conn.execute("SELECT topic_id FROM lessons WHERE id = ?", (lesson_id,)).fetchone()
    return row["topic_id"] if row else None


def export_lessons(conn: sqlite3.Connection) -> list[dict]:
    """Return all lessons as a list of plain dicts, suitable for JSON serialisation."""
    rows = conn.execute("SELECT * FROM lessons ORDER BY timestamp DESC").fetchall()
    return [_row_to_lesson(row).model_dump(mode="json") for row in rows]


def import_lessons(conn: sqlite3.Connection, records: list[dict]) -> tuple[int, int, int]:
    """Insert lessons from a list of dicts.

    Validates each record through the Lesson model (normalizes timestamps, enums, etc.).
    Returns (inserted, duplicated, invalid).
    """
    inserted = 0
    duplicated = 0
    invalid = 0
    for r in records:
        try:
            lesson = Lesson(**r)
        except Exception:
            invalid += 1
            continue
        cur = conn.execute(
            """INSERT OR IGNORE INTO lessons
               (id, timestamp, topic_id, categories, title, level, summary,
                task_context, project, repository, branch, commit_hash, folder,
                repository_platform, starred, feedback)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                lesson.id,
                lesson.timestamp_iso,
                lesson.topic_id,
                json.dumps(lesson.categories) if isinstance(lesson.categories, list) else lesson.categories,
                lesson.title,
                lesson.level,
                lesson.summary,
                lesson.task_context,
                lesson.project,
                lesson.repository,
                lesson.branch,
                lesson.commit_hash,
                lesson.folder,
                lesson.repository_platform,
                1 if lesson.starred else 0,
                lesson.feedback,
            ),
        )
        if cur.rowcount:
            inserted += 1
        else:
            duplicated += 1
    conn.commit()
    return inserted, duplicated, invalid


def create_backup_zip(conn: sqlite3.Connection) -> bytes:
    """Return a zip archive (bytes) containing settings.json, lessons.json, knowledge.json."""
    settings = get_settings(conn)
    lessons = export_lessons(conn)

    entries = get_knowledge_entries(conn)
    groups = get_knowledge_group_list(conn)
    topic_group: dict[str, str] = {t: g.name for g in groups for t in g.topics}
    knowledge_data = {
        "groups": [g.name for g in groups],
        "topics": [
            {
                "topic": e.topic,
                "confidence": e.confidence,
                "group": topic_group.get(e.topic),
            }
            for e in entries
        ],
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("settings.json", json.dumps(settings.model_dump(), indent=2))
        zf.writestr("lessons.json", json.dumps(lessons, indent=2, ensure_ascii=False))
        zf.writestr("knowledge.json", json.dumps(knowledge_data, indent=2))
    return buf.getvalue()


def restore_backup_zip(conn: sqlite3.Connection, data: bytes) -> dict[str, int]:
    """Restore from a backup zip.

    Returns a dict with counts: {"settings": 1, "topics": N, "lessons": N, "skipped": N, "invalid": N}.
    Settings are overwritten; knowledge entries are upserted; duplicate lessons are skipped.
    """
    result: dict[str, int] = {"settings": 0, "topics": 0, "groups": 0, "lessons": 0, "skipped": 0, "invalid": 0}

    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        names = zf.namelist()

        if "settings.json" in names:
            s = json.loads(zf.read("settings.json"))
            if "max_per_day" in s:
                set_setting(conn, "max_per_day", str(s["max_per_day"]))
            if "min_gap_minutes" in s:
                set_setting(conn, "min_gap_minutes", str(s["min_gap_minutes"]))
            result["settings"] = 1

        if "knowledge.json" in names:
            knowledge = json.loads(zf.read("knowledge.json"))
            if isinstance(knowledge, dict) and "topics" in knowledge:
                # Current format: {"groups": [...], "topics": [{topic, confidence, group}, ...]}
                groups_added = 0
                for g in knowledge.get("groups", []):
                    cur = conn.execute(
                        "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)",
                        (g.strip(),),
                    )
                    groups_added += cur.rowcount
                for item in knowledge.get("topics", []):
                    upsert_knowledge(conn, item["topic"], item["confidence"])
                    group = item.get("group")
                    if group and group != "Other":
                        cur = conn.execute(
                            "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)",
                            (group.strip(),),
                        )
                        groups_added += cur.rowcount
                        assign_topic_to_group(conn, item["topic"], group)
                result["topics"] = len(knowledge.get("topics", []))
                result["groups"] = groups_added
            else:
                # Legacy format: {"topic": confidence, ...}
                for topic, confidence in knowledge.items():
                    upsert_knowledge(conn, topic, confidence)
                result["topics"] = len(knowledge)

        if "lessons.json" in names:
            lessons_data = json.loads(zf.read("lessons.json"))
            inserted, duplicated, invalid = import_lessons(conn, lessons_data)
            result["lessons"] = inserted
            result["skipped"] = duplicated
            result["invalid"] = invalid

    return result


def get_distinct_column(conn: sqlite3.Connection, column: str) -> list[str]:
    """Return sorted distinct non-null values for a metadata column."""
    rows = conn.execute(
        f"SELECT DISTINCT {column} FROM lessons WHERE {column} IS NOT NULL ORDER BY {column}"
    ).fetchall()
    return [row[0] for row in rows]


def get_lesson_by_id(conn: sqlite3.Connection, lesson_id: str) -> Optional[Lesson]:
    """Return a single lesson by id, or None if not found."""
    row = conn.execute(
        "SELECT * FROM lessons WHERE id = ?", (lesson_id,)
    ).fetchone()
    return _row_to_lesson(row) if row else None


def get_all_categories(conn: sqlite3.Connection) -> list[str]:
    """Return a distinct sorted list of all category tags across all lessons."""
    rows = conn.execute("SELECT categories FROM lessons").fetchall()
    seen: set[str] = set()
    for row in rows:
        try:
            tags: list[str] = json.loads(row[0])
            seen.update(tags)
        except (json.JSONDecodeError, TypeError):
            pass
    return sorted(seen)


def get_taught_topic_ids(conn: sqlite3.Connection) -> list[str]:
    """Return all distinct topic_ids already taught."""
    rows = conn.execute("SELECT DISTINCT topic_id FROM lessons").fetchall()
    return [row[0] for row in rows]


def count_lessons_since(conn: sqlite3.Connection, since: str) -> int:
    """Count lessons delivered since a given ISO 8601 timestamp."""
    row = conn.execute(
        "SELECT COUNT(*) FROM lessons WHERE timestamp >= ?", (since,)
    ).fetchone()
    return row[0]


def get_last_lesson_timestamp(conn: sqlite3.Connection) -> Optional[str]:
    """Return the ISO 8601 timestamp of the most recent lesson, or None."""
    row = conn.execute(
        "SELECT timestamp FROM lessons ORDER BY timestamp DESC LIMIT 1"
    ).fetchone()
    return row[0] if row else None


# ── Knowledge ──────────────────────────────────────────────────────────────

def get_all_knowledge(conn: sqlite3.Connection) -> dict[str, int]:
    """Return the full knowledge map as {topic: confidence}."""
    rows = conn.execute("SELECT topic, confidence FROM knowledge").fetchall()
    return {row[0]: row[1] for row in rows}


def get_knowledge_entries(conn: sqlite3.Connection) -> list[KnowledgeEntry]:
    """Return every knowledge topic as a typed list, ordered by topic name."""
    rows = conn.execute(
        "SELECT topic, confidence FROM knowledge ORDER BY topic"
    ).fetchall()
    return [KnowledgeEntry(topic=row[0], confidence=row[1]) for row in rows]


def get_knowledge_group_list(conn: sqlite3.Connection) -> list[KnowledgeGroup]:
    """Return all named groups (including empty ones) as a typed list."""
    names = [
        row[0]
        for row in conn.execute(
            "SELECT group_name FROM knowledge_group_names ORDER BY group_name"
        ).fetchall()
    ]
    assignments: dict[str, list[str]] = {}
    for row in conn.execute(
        "SELECT group_name, topic FROM knowledge_groups ORDER BY group_name, topic"
    ).fetchall():
        assignments.setdefault(row[0], []).append(row[1])
    return [KnowledgeGroup(name=n, topics=assignments.get(n, [])) for n in names]


def upsert_knowledge(
    conn: sqlite3.Connection, topic: str, confidence: int
) -> None:
    """Insert or update a knowledge entry, clamping confidence to 0-10."""
    clamped = max(0, min(10, confidence))
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """INSERT INTO knowledge (topic, confidence, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(topic) DO UPDATE SET confidence = excluded.confidence,
                                            updated_at = excluded.updated_at""",
        (topic, clamped, now),
    )
    conn.commit()


def delete_knowledge(conn: sqlite3.Connection, topic: str) -> bool:
    """Remove a topic from the knowledge map and all groups. Returns True if it existed."""
    cur = conn.execute("DELETE FROM knowledge WHERE topic = ?", (topic,))
    conn.execute("DELETE FROM knowledge_groups WHERE topic = ?", (topic,))
    conn.commit()
    return cur.rowcount > 0


# ── Knowledge groups ───────────────────────────────────────────────────────

def get_knowledge_groups(conn: sqlite3.Connection) -> dict[str, list[str]]:
    """Return all named groups as {group_name: [topic, ...]} (empty groups included)."""
    groups: dict[str, list[str]] = {
        row[0]: []
        for row in conn.execute(
            "SELECT group_name FROM knowledge_group_names ORDER BY group_name"
        ).fetchall()
    }
    for row in conn.execute(
        "SELECT group_name, topic FROM knowledge_groups ORDER BY group_name, topic"
    ).fetchall():
        if row[0] in groups:
            groups[row[0]].append(row[1])
    return groups


def add_group(conn: sqlite3.Connection, group_name: str) -> None:
    """Register a new named group (persists even when empty)."""
    name = group_name.strip()
    if not name:
        raise ValueError("Group name must not be empty")
    conn.execute(
        "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)", (name,)
    )
    conn.commit()


def delete_group(conn: sqlite3.Connection, group_name: str) -> int:
    """Remove a group and its topic assignments. Topics become ungrouped (Other).

    Returns the number of topic assignments removed.
    """
    cur = conn.execute(
        "DELETE FROM knowledge_groups WHERE group_name = ?", (group_name,)
    )
    conn.execute(
        "DELETE FROM knowledge_group_names WHERE group_name = ?", (group_name,)
    )
    conn.commit()
    return cur.rowcount


def assign_topic_to_group(
    conn: sqlite3.Connection, topic: str, group_name: str
) -> None:
    """Assign a topic to a group, replacing any previous group assignment."""
    conn.execute(
        "INSERT OR IGNORE INTO knowledge_group_names (group_name) VALUES (?)", (group_name,)
    )
    conn.execute("DELETE FROM knowledge_groups WHERE topic = ?", (topic,))
    conn.execute(
        "INSERT OR IGNORE INTO knowledge_groups (group_name, topic) VALUES (?, ?)",
        (group_name, topic),
    )
    conn.commit()


def unassign_topic_from_group(conn: sqlite3.Connection, topic: str) -> None:
    """Remove a topic from its group (it will appear under Other)."""
    conn.execute("DELETE FROM knowledge_groups WHERE topic = ?", (topic,))
    conn.commit()


# ── Settings ───────────────────────────────────────────────────────────────

def get_settings(conn: sqlite3.Connection) -> Settings:
    """Load settings from DB, falling back to defaults. Migrates old min_hours_between."""
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    data: dict[str, str] = {row[0]: row[1] for row in rows}
    if "min_gap_minutes" in data:
        gap = int(data["min_gap_minutes"])
    elif "min_hours_between" in data:
        gap = int(data["min_hours_between"]) * 60  # migrate hours → minutes
    else:
        gap = int(DEFAULT_SETTINGS["min_gap_minutes"])
    return Settings(
        max_per_day=int(data.get("max_per_day", DEFAULT_SETTINGS["max_per_day"])),
        min_gap_minutes=gap,
    )


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    """Insert or update a single setting."""
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


# ── Private helpers ────────────────────────────────────────────────────────

def _period_to_cutoff(period: Optional[str]) -> Optional[str]:
    """Convert a period string to an ISO 8601 cutoff timestamp, or None for all."""
    now = datetime.now(timezone.utc)
    if period == "today":
        cutoff = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        cutoff = now - timedelta(days=7)
    elif period == "month":
        cutoff = now - timedelta(days=30)
    elif period == "year":
        cutoff = now - timedelta(days=365)
    else:
        return None
    return cutoff.isoformat()


def _row_to_lesson(row: sqlite3.Row) -> Lesson:
    """Convert a sqlite3.Row to a Lesson model."""
    try:
        categories: list[str] = json.loads(row["categories"])
    except (json.JSONDecodeError, TypeError):
        categories = []
    return Lesson(
        id=row["id"],
        timestamp=row["timestamp"],
        topic_id=row["topic_id"],
        categories=categories,
        title=row["title"],
        level=row["level"],
        summary=row["summary"],
        task_context=row["task_context"],
        project=row["project"],
        repository=row["repository"],
        branch=row["branch"],
        commit_hash=row["commit_hash"],
        folder=row["folder"],
        repository_platform=row["repository_platform"],
        starred=bool(row["starred"]) if row["starred"] is not None else False,
        feedback=row["feedback"],
    )
