"""SQLite schema, migrations, and pure query helpers for devcoach."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from devcoach.core.models import Lesson, Settings

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
    "min_hours_between": "4",
}

# Ordered category → topic list mapping for the knowledge map UI.
# Topics not listed here land in "Other".
KNOWLEDGE_CATEGORIES: dict[str, list[str]] = {
    "Engineering Fundamentals": [
        "general_engineering", "software_architecture",
        "design_patterns", "debugging_mindset",
    ],
    "Languages": [
        "python", "javascript", "typescript",
    ],
    "Backend": [
        "node_js", "fastapi", "django",
    ],
    "Frontend": [
        "react", "html_css",
    ],
    "Infrastructure & DevOps": [
        "docker", "docker_compose", "traefik", "coolify", "ci_cd", "linux_cli",
    ],
    "Databases": [
        "postgresql", "redis",
    ],
    "Networking & Security": [
        "networking", "security",
    ],
    "Quality": [
        "testing", "performance_optimization",
    ],
    "Version Control": [
        "git",
    ],
}


# ── Connection ─────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    """Open a connection to the DB, creating the directory if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── Schema init ────────────────────────────────────────────────────────────

def init_schema(conn: sqlite3.Connection) -> None:
    """Create tables and seed defaults if needed. Idempotent."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS lessons (
            id           TEXT PRIMARY KEY,
            timestamp    TEXT NOT NULL,
            topic_id     TEXT NOT NULL,
            categories   TEXT NOT NULL,
            title        TEXT NOT NULL,
            level        TEXT NOT NULL,
            summary      TEXT NOT NULL,
            task_context TEXT
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
    """)
    conn.commit()
    _seed_defaults(conn)


def _seed_defaults(conn: sqlite3.Connection) -> None:
    """Seed knowledge and settings tables on first run. Idempotent."""
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
           (id, timestamp, topic_id, categories, title, level, summary, task_context)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            lesson.id,
            lesson.timestamp,
            lesson.topic_id,
            json.dumps(lesson.categories),
            lesson.title,
            lesson.level,
            lesson.summary,
            lesson.task_context,
        ),
    )
    conn.commit()


def get_lessons(
    conn: sqlite3.Connection,
    period: Optional[str] = None,
    category: Optional[str] = None,
) -> list[Lesson]:
    """Return lessons filtered by period and/or category.

    period: today | week | month | year | all | None (same as all)
    category: exact tag match inside the JSON categories array
    """
    conditions: list[str] = []
    params: list[object] = []

    cutoff = _period_to_cutoff(period)
    if cutoff is not None:
        conditions.append("timestamp >= ?")
        params.append(cutoff)

    if category is not None:
        # JSON array stored as text: match '"<tag>"' anywhere in the string
        conditions.append('categories LIKE ?')
        params.append(f'%"{category}"%')

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = conn.execute(
        f"SELECT * FROM lessons {where} ORDER BY timestamp DESC",
        params,
    ).fetchall()
    return [_row_to_lesson(row) for row in rows]


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


# ── Settings ───────────────────────────────────────────────────────────────

def get_settings(conn: sqlite3.Connection) -> Settings:
    """Load settings from DB, falling back to defaults."""
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    data: dict[str, str] = {row[0]: row[1] for row in rows}
    return Settings(
        max_per_day=int(data.get("max_per_day", DEFAULT_SETTINGS["max_per_day"])),
        min_hours_between=int(data.get("min_hours_between", DEFAULT_SETTINGS["min_hours_between"])),
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
    )
