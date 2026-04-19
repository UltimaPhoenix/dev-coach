"""Rate limit checking and lesson selection logic for devcoach."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from devcoach.core.db import (
    count_lessons_since,
    get_all_knowledge,
    get_last_lesson_timestamp,
    get_settings,
    get_taught_topic_ids,
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
        now = datetime.now(timezone.utc)

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
                last_dt = last_dt.replace(tzinfo=timezone.utc)
            elapsed_hours = (now - last_dt).total_seconds() / 3600
            if elapsed_hours < settings.min_hours_between:
                remaining = settings.min_hours_between - elapsed_hours
                return RateLimitResult(
                    allowed=False,
                    reason=(
                        f"Too soon: last lesson {elapsed_hours:.1f}h ago, "
                        f"minimum interval is {settings.min_hours_between}h "
                        f"({remaining:.1f}h remaining)"
                    ),
                )

        return RateLimitResult(allowed=True)

    except Exception as exc:
        return RateLimitResult(allowed=True, reason=f"Rate limit check failed: {exc}")


def get_profile(conn: sqlite3.Connection) -> Profile:
    """Load and return the current user profile."""
    try:
        return Profile(knowledge=get_all_knowledge(conn))
    except Exception:
        return Profile(knowledge={})


def apply_knowledge_delta(
    conn: sqlite3.Connection, topic: str, delta: int
) -> Profile:
    """Add delta to the current confidence for a topic (clamped 0-10).

    If the topic does not exist it is created with a base confidence of 5.
    """
    try:
        knowledge = get_all_knowledge(conn)
        current = knowledge.get(topic, 5)
        upsert_knowledge(conn, topic, current + delta)
        return get_profile(conn)
    except Exception:
        return get_profile(conn)


def list_taught_topics(conn: sqlite3.Connection) -> list[str]:
    """Return all topic_ids already present in the lesson log."""
    try:
        return get_taught_topic_ids(conn)
    except Exception:
        return []
