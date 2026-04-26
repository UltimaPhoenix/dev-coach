"""Tests for coach.py — rate limit, stats, knowledge delta, feedback."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from devcoach.core import coach, db
from devcoach.core.models import Lesson

# ── Helpers ────────────────────────────────────────────────────────────────


def _insert_lesson_at(conn, minutes_ago: int, topic_id: str = "test_topic") -> None:
    ts = (datetime.now(UTC) - timedelta(minutes=minutes_ago)).isoformat()
    lesson = Lesson(
        id=f"lesson-{minutes_ago}-{topic_id}",
        timestamp=ts,
        topic_id=topic_id,
        categories=["test"],
        title="Test lesson",
        level="mid",
        summary="Test",
    )
    db.insert_lesson(conn, lesson)


# ── Fixture: fresh DB with no lessons ────────────────────────────────────


@pytest.fixture
def fresh_conn(tmp_path):
    """An initialized DB with no lessons — rate limit tests need a clean slate."""
    path = tmp_path / "fresh.db"
    c = sqlite3.connect(str(path))
    c.row_factory = sqlite3.Row
    db.init_schema(c)
    yield c
    c.close()


# ── check_rate_limit ────────────────────────────────────────────────────────


class TestCheckRateLimit:
    def test_allowed_on_empty_db(self, fresh_conn):
        result = coach.check_rate_limit(fresh_conn)
        assert result.allowed is True

    def test_denied_when_daily_limit_reached(self, fresh_conn):
        db.set_setting(fresh_conn, "max_per_day", "2")
        _insert_lesson_at(fresh_conn, 30, "topic_a")
        _insert_lesson_at(fresh_conn, 60, "topic_b")
        result = coach.check_rate_limit(fresh_conn)
        assert result.allowed is False
        assert "Daily limit" in result.reason

    def test_denied_when_gap_too_short(self, fresh_conn):
        db.set_setting(fresh_conn, "min_gap_minutes", "240")
        db.set_setting(fresh_conn, "max_per_day", "10")
        _insert_lesson_at(fresh_conn, 30, "recent_topic")
        result = coach.check_rate_limit(fresh_conn)
        assert result.allowed is False
        assert "Too soon" in result.reason

    def test_allowed_when_gap_elapsed(self, fresh_conn):
        db.set_setting(fresh_conn, "min_gap_minutes", "60")
        db.set_setting(fresh_conn, "max_per_day", "10")
        _insert_lesson_at(fresh_conn, 120, "old_topic")
        result = coach.check_rate_limit(fresh_conn)
        assert result.allowed is True

    def test_reason_is_none_when_allowed(self, fresh_conn):
        result = coach.check_rate_limit(fresh_conn)
        assert result.reason is None


# ── get_stats ──────────────────────────────────────────────────────────────


class TestGetStats:
    def test_returns_expected_keys(self, conn):
        stats = coach.get_stats(conn)
        assert "total_lessons" in stats
        assert "lessons_today" in stats
        assert "lessons_this_week" in stats
        assert "weakest_topics" in stats
        assert "strongest_topics" in stats

    def test_total_matches_inserted(self, conn):
        stats = coach.get_stats(conn)
        assert stats["total_lessons"] == 3  # seeded by conftest

    def test_today_count_matches(self, conn):
        stats = coach.get_stats(conn)
        assert stats["lessons_today"] == 3  # all seeded with today's date

    def test_weakest_and_strongest_are_lists(self, conn):
        stats = coach.get_stats(conn)
        assert isinstance(stats["weakest_topics"], list)
        assert isinstance(stats["strongest_topics"], list)


# ── apply_knowledge_delta ──────────────────────────────────────────────────


class TestApplyKnowledgeDelta:
    def test_increases_confidence(self, conn):
        before = db.get_all_knowledge(conn).get("python", 5)
        coach.apply_knowledge_delta(conn, "python", 1)
        after = db.get_all_knowledge(conn)["python"]
        assert after == min(10, before + 1)

    def test_decreases_confidence(self, conn):
        before = db.get_all_knowledge(conn).get("python", 5)
        coach.apply_knowledge_delta(conn, "python", -1)
        after = db.get_all_knowledge(conn)["python"]
        assert after == max(0, before - 1)

    def test_creates_topic_if_missing(self, conn):
        coach.apply_knowledge_delta(conn, "brand_new_topic", 3)
        knowledge = db.get_all_knowledge(conn)
        assert "brand_new_topic" in knowledge
        assert knowledge["brand_new_topic"] == 8  # 5 + 3

    def test_clamps_at_ten(self, conn):
        db.upsert_knowledge(conn, "test_topic", 10)
        coach.apply_knowledge_delta(conn, "test_topic", 5)
        assert db.get_all_knowledge(conn)["test_topic"] == 10

    def test_clamps_at_zero(self, conn):
        db.upsert_knowledge(conn, "test_topic", 0)
        coach.apply_knowledge_delta(conn, "test_topic", -5)
        assert db.get_all_knowledge(conn)["test_topic"] == 0


# ── list_taught_topics ─────────────────────────────────────────────────────


class TestListTaughtTopics:
    def test_returns_all_taught_topics(self, conn):
        topics = coach.list_taught_topics(conn)
        assert set(topics) == {
            "sqlite3_row_factory",
            "sqlite_upsert_patterns",
            "sqlite_pragma_introspection",
        }

    def test_returns_empty_on_fresh_db(self, tmp_path):
        import sqlite3

        path = tmp_path / "fresh.db"
        c = sqlite3.connect(str(path))
        c.row_factory = sqlite3.Row
        db.init_schema(c)
        assert coach.list_taught_topics(c) == []
        c.close()
