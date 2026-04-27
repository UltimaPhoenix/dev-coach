"""Rate limit checking and lesson selection logic for devcoach."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta

from devcoach.core.db import (
    count_filtered_lessons,
    count_lessons_since,
    get_all_knowledge,
    get_knowledge_entries,
    get_knowledge_group_list,
    get_last_lesson_timestamp,
    get_settings,
    get_taught_topic_ids,
    set_feedback,
    upsert_knowledge,
)
from devcoach.core.models import Profile, RateLimitResult


def check_rate_limit(conn: sqlite3.Connection) -> RateLimitResult:
    """Determine whether a new lesson can be delivered.

    Rules (evaluated in order):
    1. Count lessons in the last 24h. If >= max_per_day → denied.
    2. Find timestamp of last lesson. If < min_hours_between ago → denied.
    3. Otherwise: allowed.
    """
    try:
        settings = get_settings(conn)
        now = datetime.now(UTC)

        since_24h = (now - timedelta(hours=24)).isoformat()
        count = count_lessons_since(conn, since_24h)
        if count >= settings.max_per_day:
            return RateLimitResult(
                allowed=False,
                reason=f"Daily limit reached ({count}/{settings.max_per_day} lessons in the last 24h)",
            )

        last_ts = get_last_lesson_timestamp(conn)
        if last_ts is not None:
            last_dt = datetime.fromisoformat(last_ts)
            if last_dt.tzinfo is None:
                last_dt = last_dt.replace(tzinfo=UTC)
            elapsed_minutes = (now - last_dt).total_seconds() / 60
            if elapsed_minutes < settings.min_gap_minutes:
                remaining = settings.min_gap_minutes - elapsed_minutes
                gap_h, gap_m = divmod(settings.min_gap_minutes, 60)
                rem_h, rem_m = divmod(int(remaining), 60)
                return RateLimitResult(
                    allowed=False,
                    reason=(
                        f"Too soon: last lesson {elapsed_minutes:.0f}m ago, "
                        f"minimum interval is {gap_h}h {gap_m}m "
                        f"({rem_h}h {rem_m}m remaining)"
                    ),
                )

        return RateLimitResult(allowed=True)

    except Exception as exc:
        return RateLimitResult(allowed=True, reason=f"Rate limit check failed: {exc}")


def get_profile(conn: sqlite3.Connection) -> Profile:
    """Load and return the current user profile."""
    try:
        return Profile(
            knowledge=get_knowledge_entries(conn),
            groups=get_knowledge_group_list(conn),
        )
    except Exception:
        return Profile(knowledge=[], groups=[])


def apply_knowledge_delta(conn: sqlite3.Connection, topic: str, delta: int) -> Profile:
    """Add delta to the current confidence for a topic (clamped 0-10).

    If the topic does not exist it is created with a base confidence of 5.
    """
    try:
        row = conn.execute("SELECT confidence FROM knowledge WHERE topic = ?", (topic,)).fetchone()
        current = row[0] if row else 5
        upsert_knowledge(conn, topic, current + delta)
        return get_profile(conn)
    except Exception:
        return get_profile(conn)


def record_feedback(
    conn: sqlite3.Connection, lesson_id: str, feedback_value: str | None
) -> str | None:
    """Record feedback for a lesson and auto-adjust knowledge confidence by ±1.

    feedback_value: "know" | "dont_know" | None (to clear).
    Returns the topic_id of the updated lesson, or None if lesson not found.
    """
    topic_id = set_feedback(conn, lesson_id, feedback_value)
    if topic_id and feedback_value in ("know", "dont_know"):
        delta = 1 if feedback_value == "know" else -1
        apply_knowledge_delta(conn, topic_id, delta)
    return topic_id


def get_stats(conn: sqlite3.Connection) -> dict:
    """Return aggregate coaching statistics.

    Returns total_lessons, lessons_today (last 24h), lessons_this_week (last 7d),
    weakest_topics (up to 5), and strongest_topics (up to 5).
    """
    try:
        now = datetime.now(UTC)
        total = count_filtered_lessons(conn)
        today_cutoff = (now - timedelta(hours=24)).isoformat()
        week_cutoff = (now - timedelta(days=7)).isoformat()
        lessons_today = count_lessons_since(conn, today_cutoff)
        lessons_week = count_lessons_since(conn, week_cutoff)
        knowledge = get_all_knowledge(conn)
        sorted_k = sorted(knowledge.items(), key=lambda x: x[1])
        weakest = [{"topic": t, "confidence": c} for t, c in sorted_k[:5]]
        strongest = [{"topic": t, "confidence": c} for t, c in sorted_k[-5:][::-1]]
        return {
            "total_lessons": total,
            "lessons_today": lessons_today,
            "lessons_this_week": lessons_week,
            "weakest_topics": weakest,
            "strongest_topics": strongest,
        }
    except Exception as exc:
        return {"error": str(exc)}


def list_taught_topics(conn: sqlite3.Connection) -> list[str]:
    """Return all topic_ids already present in the lesson log."""
    try:
        return get_taught_topic_ids(conn)
    except Exception:
        return []
