"""Tests for mcp/server.py — tools, resources, prompt, and entry point."""

from __future__ import annotations

import asyncio
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from devcoach.core import db
from devcoach.core.models import Lesson
from devcoach.mcp import server

# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def patch_db_path(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Redirect all db.connection() calls to the seeded test database."""
    monkeypatch.setattr(db, "DB_PATH", db_path)


class _ElicitResult:
    """Minimal elicitation result stub for tests."""

    def __init__(self, feedback: str | None = None):
        self.data = _ElicitData(feedback) if feedback is not None else None


class _ElicitData:
    def __init__(self, feedback: str):
        self.feedback = feedback


@pytest.fixture
def mock_ctx() -> MagicMock:
    """Minimal async Context mock — records info/warning/error calls."""
    ctx = MagicMock()
    ctx.info = AsyncMock()
    ctx.warning = AsyncMock()
    ctx.error = AsyncMock()
    ctx.elicit = AsyncMock(return_value=_ElicitResult(None))  # no response by default
    return ctx


def _run(coro):
    """Run a coroutine synchronously in tests."""
    return asyncio.run(coro)


# ── Tools — log_lesson ─────────────────────────────────────────────────────


class TestLogLesson:
    def _call(self, mock_ctx, **kwargs):
        defaults = dict(
            id="test-log-001",
            timestamp=datetime.now(UTC).isoformat(),
            topic_id="test_topic",
            categories=["test"],
            title="Test lesson",
            level="mid",
            summary="Test summary",
        )
        defaults.update(kwargs)
        return _run(server.log_lesson(mock_ctx, **defaults))

    def test_returns_lesson(self, mock_ctx):
        result = self._call(mock_ctx)
        assert result.id == "test-log-001"
        assert result.topic_id == "test_topic"

    def test_lesson_stored_in_db(self, mock_ctx, db_path):
        self._call(mock_ctx, id="stored-001", topic_id="stored_topic")
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        lesson = db.get_lesson_by_id(c, "stored-001")
        c.close()
        assert lesson is not None
        assert lesson.topic_id == "stored_topic"

    def test_explicit_git_fields_stored(self, mock_ctx, db_path):
        self._call(
            mock_ctx,
            id="git-001",
            branch="feature/test",
            project="my-project",
            repository="org/my-project",
        )
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        lesson = db.get_lesson_by_id(c, "git-001")
        c.close()
        assert lesson.branch == "feature/test"
        assert lesson.project == "my-project"

    def test_git_auto_fill_from_context(self, mock_ctx, db_path):
        """When git fields are omitted, they are auto-filled from git context."""
        with patch("devcoach.mcp.server.detect_git_context") as mock_git:
            mock_git.return_value = {
                "project": "auto-project",
                "repository": "org/auto",
                "branch": "auto-branch",
                "commit_hash": "abc123",
                "folder": "/tmp/auto",
                "repository_platform": "github",
            }
            self._call(mock_ctx, id="auto-001")

        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        lesson = db.get_lesson_by_id(c, "auto-001")
        c.close()
        assert lesson.branch == "auto-branch"
        assert lesson.project == "auto-project"

    def test_auto_fill_logs_info(self, mock_ctx):
        with patch("devcoach.mcp.server.detect_git_context") as mock_git:
            mock_git.return_value = {
                "project": "logged-project",
                "repository": None,
                "branch": "main",
                "commit_hash": "def456",
                "folder": "/tmp",
                "repository_platform": None,
            }
            self._call(mock_ctx, id="log-info-001")
        mock_ctx.info.assert_called_once()

    def test_explicit_fields_not_overwritten_by_git(self, mock_ctx, db_path):
        with patch("devcoach.mcp.server.detect_git_context") as mock_git:
            mock_git.return_value = {
                "project": "git-project",
                "repository": None,
                "branch": "git-branch",
                "commit_hash": None,
                "folder": None,
                "repository_platform": None,
            }
            self._call(
                mock_ctx, id="explicit-001", branch="caller-branch", project="caller-project"
            )

        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        lesson = db.get_lesson_by_id(c, "explicit-001")
        c.close()
        assert lesson.branch == "caller-branch"
        assert lesson.project == "caller-project"

    def test_duplicate_id_returns_lesson(self, mock_ctx):
        # INSERT OR REPLACE — second call should not fail
        self._call(mock_ctx, id="dup-001")
        result = self._call(mock_ctx, id="dup-001")
        assert result.id == "dup-001"


# ── Tools — update_knowledge ───────────────────────────────────────────────


class TestUpdateKnowledge:
    def test_returns_new_confidence(self, mock_ctx, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        before = db.get_all_knowledge(c).get("python", 5)
        c.close()
        result = _run(server.update_knowledge(mock_ctx, "python", 1))
        assert isinstance(result, int)
        assert result == min(10, before + 1)

    def test_confidence_increases(self, mock_ctx, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        before = db.get_all_knowledge(c).get("python", 5)
        c.close()

        _run(server.update_knowledge(mock_ctx, "python", 1))

        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        after = db.get_all_knowledge(c).get("python", 5)
        c.close()
        assert after == min(10, before + 1)

    def test_creates_new_topic(self, mock_ctx, db_path):
        _run(server.update_knowledge(mock_ctx, "brand_new_topic", 3))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        knowledge = db.get_all_knowledge(c)
        c.close()
        assert "brand_new_topic" in knowledge


# ── Tools — get_lessons ────────────────────────────────────────────────────


class TestGetLessons:
    def test_returns_all_without_filter(self):
        lessons = server.get_lessons()
        assert len(lessons) == 3

    def test_filter_by_project(self):
        lessons = server.get_lessons(project="devcoach")
        assert len(lessons) == 2

    def test_filter_by_category(self):
        lessons = server.get_lessons(category="python")
        assert len(lessons) == 3

    def test_filter_starred(self):
        lessons = server.get_lessons(starred=True)
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"

    def test_filter_feedback(self):
        lessons = server.get_lessons(feedback="know")
        assert len(lessons) == 1

    def test_returns_empty_list_for_no_match(self):
        lessons = server.get_lessons(project="nonexistent")
        assert lessons == []


class TestGetLessonsLimit:
    """Tests for the limit parameter on get_lessons."""

    @pytest.fixture(autouse=True)
    def _seed_extra(self, db_path: Path) -> None:
        """Insert 12 lessons so the DB has more than the default limit of 10."""
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        for i in range(12):
            lesson = Lesson(
                id=f"limit-test-lesson-{i:03d}",
                timestamp=f"2026-01-{i + 1:02d}T10:00:00Z",
                topic_id=f"limit_topic_{i}",
                categories=["test"],
                title=f"Limit test lesson {i}",
                level="mid",
                summary=f"Summary {i}",
            )
            db.insert_lesson(c, lesson)
        c.close()

    def test_default_limit_returns_at_most_ten(self):
        lessons = server.get_lessons()
        assert len(lessons) <= 10

    def test_explicit_limit_returns_at_most_n(self):
        lessons = server.get_lessons(limit=3)
        assert len(lessons) <= 3

    def test_limit_zero_returns_all(self):
        lessons = server.get_lessons(limit=0)
        assert len(lessons) >= 12  # 12 extra + 3 from conftest


# ── Tools — star_lesson ────────────────────────────────────────────────────


class TestStarLesson:
    def test_star_returns_true(self, mock_ctx):
        result = _run(server.star_lesson(mock_ctx, "lesson-sqlite3-row-factory-001", starred=True))
        assert result is True

    def test_unstar_found_returns_true(self, mock_ctx):
        result = _run(
            server.star_lesson(mock_ctx, "lesson-sqlite-upsert-patterns-001", starred=False)
        )
        assert result is True  # lesson found and updated

    def test_not_found_returns_false(self, mock_ctx):
        result = _run(server.star_lesson(mock_ctx, "nonexistent-lesson", starred=True))
        assert result is False

    def test_idempotent_star(self, mock_ctx):
        _run(server.star_lesson(mock_ctx, "lesson-sqlite3-row-factory-001", starred=True))
        result = _run(server.star_lesson(mock_ctx, "lesson-sqlite3-row-factory-001", starred=True))
        assert result is True

    def test_idempotent_unstar(self, mock_ctx):
        _run(server.star_lesson(mock_ctx, "lesson-sqlite-upsert-patterns-001", starred=False))
        result = _run(
            server.star_lesson(mock_ctx, "lesson-sqlite-upsert-patterns-001", starred=False)
        )
        assert result is True  # still found


# ── Tools — submit_feedback ────────────────────────────────────────────────


class TestSubmitFeedback:
    def test_know_returns_true(self, mock_ctx):
        result = _run(server.submit_feedback(mock_ctx, "lesson-sqlite3-row-factory-001", "know"))
        assert result is True

    def test_dont_know_returns_true(self, mock_ctx):
        result = _run(
            server.submit_feedback(mock_ctx, "lesson-sqlite3-row-factory-001", "dont_know")
        )
        assert result is True

    def test_not_found_returns_false(self, mock_ctx):
        result = _run(server.submit_feedback(mock_ctx, "nonexistent-lesson", "know"))
        assert result is False

    def test_idempotent_same_feedback(self, mock_ctx, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        before = db.get_all_knowledge(c).get("sqlite_upsert_patterns", 5)
        c.close()
        # lesson-sqlite-upsert-patterns-001 already has feedback="know" in fixture
        result = _run(server.submit_feedback(mock_ctx, "lesson-sqlite-upsert-patterns-001", "know"))
        assert result is True
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        after = db.get_all_knowledge(c).get("sqlite_upsert_patterns", 5)
        c.close()
        assert after == before  # confidence unchanged — idempotent

    def test_clear_removes_feedback(self, mock_ctx, db_path):
        _run(server.submit_feedback(mock_ctx, "lesson-sqlite-upsert-patterns-001", "clear"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        lesson = db.get_lesson_by_id(c, "lesson-sqlite-upsert-patterns-001")
        c.close()
        assert lesson.feedback is None

    def test_know_bumps_confidence(self, mock_ctx, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        before = db.get_all_knowledge(c).get("sqlite3_row_factory", 5)
        c.close()

        _run(server.submit_feedback(mock_ctx, "lesson-sqlite3-row-factory-001", "know"))

        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        after = db.get_all_knowledge(c).get("sqlite3_row_factory", 5)
        c.close()
        assert after == min(10, before + 1)


# ── Tools — add_topic / remove_topic ──────────────────────────────────────


class TestTopicTools:
    def test_add_topic_returns_true(self, mock_ctx, db_path):
        result = _run(server.add_topic(mock_ctx, "rust", 7))
        assert result is True
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "rust" in db.get_all_knowledge(c)
        c.close()

    def test_add_topic_with_group(self, mock_ctx, db_path):
        _run(server.add_topic(mock_ctx, "rust", 7, group="Languages"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "rust" in groups.get("Languages", [])

    def test_remove_topic_returns_true(self, mock_ctx, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "python", 7)
        c.close()
        result = _run(server.remove_topic(mock_ctx, "python"))
        assert result is True
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "python" not in db.get_all_knowledge(c)
        c.close()

    def test_remove_nonexistent_topic_returns_false(self, mock_ctx):
        result = _run(server.remove_topic(mock_ctx, "does_not_exist"))
        assert result is False


# ── Tools — add_group / remove_group ──────────────────────────────────────


class TestGroupTools:
    def test_add_group_returns_true(self, mock_ctx, db_path):
        result = _run(server.add_group(mock_ctx, "DevOps"))
        assert result is True
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "DevOps" in db.get_knowledge_groups(c)
        c.close()

    def test_add_group_idempotent(self, mock_ctx, db_path):
        _run(server.add_group(mock_ctx, "DevOps"))
        result = _run(server.add_group(mock_ctx, "DevOps"))
        assert result is True  # already exists but still ok

    def test_add_group_strips_whitespace(self, mock_ctx, db_path):
        _run(server.add_group(mock_ctx, "  Languages  "))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "Languages" in groups

    def test_remove_group_returns_true(self, mock_ctx, db_path):
        _run(server.add_group(mock_ctx, "Temp"))
        result = _run(server.remove_group(mock_ctx, "Temp"))
        assert result is True
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "Temp" not in db.get_knowledge_groups(c)
        c.close()

    def test_remove_nonexistent_group_returns_false(self, mock_ctx):
        result = _run(server.remove_group(mock_ctx, "DoesNotExist"))
        assert result is False


# ── Tools — update_settings ────────────────────────────────────────────────


class TestUpdateSettings:
    def test_update_max_per_day(self):
        result = server.update_settings("max_per_day", "5")
        assert result.max_per_day == 5

    def test_update_min_gap_minutes(self):
        result = server.update_settings("min_gap_minutes", "120")
        assert result.min_gap_minutes == 120

    def test_non_integer_value_raises(self):
        with pytest.raises(ValueError, match="integer"):
            server.update_settings("max_per_day", "not_a_number")

    def test_out_of_range_max_per_day_raises(self):
        with pytest.raises(ValueError, match="max_per_day"):
            server.update_settings("max_per_day", "100")

    def test_out_of_range_min_gap_minutes_raises(self):
        with pytest.raises(ValueError, match="min_gap_minutes"):
            server.update_settings("min_gap_minutes", "9999")


# ── Tools — open_ui ────────────────────────────────────────────────────────


class TestOpenUi:
    def test_valid_port_returns_message(self):
        with patch("devcoach.mcp.server.subprocess.Popen"):
            result = server.open_ui(7860)
        assert "7860" in result
        assert "localhost" in result

    def test_invalid_port_returns_error(self):
        result = server.open_ui(80)
        assert "error" in result

    def test_port_out_of_range_high(self):
        result = server.open_ui(99999)
        assert "error" in result

    def test_popen_called_with_port(self):
        with patch("devcoach.mcp.server.subprocess.Popen") as mock_popen:
            server.open_ui(8000)
        mock_popen.assert_called_once()
        cmd = mock_popen.call_args[0][0]
        assert "8000" in cmd


# ── Tools — complete_onboarding ────────────────────────────────────────────


class TestCompleteOnboarding:
    def test_saves_topics(self, mock_ctx, db_path):
        profile = _run(
            server.complete_onboarding(
                mock_ctx,
                topics={"python": 7, "git": 8},
            )
        )
        topics = {e.topic: e.confidence for e in profile.knowledge}
        assert topics.get("python") == 7
        assert topics.get("git") == 8

    def test_clears_existing_knowledge(self, mock_ctx, db_path):
        _run(server.complete_onboarding(mock_ctx, topics={"only_topic": 5}))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        knowledge = db.get_all_knowledge(c)
        c.close()
        # Only the topics passed to complete_onboarding should remain
        assert set(knowledge.keys()) == {"only_topic"}

    def test_groups_assigned(self, mock_ctx, db_path):
        _run(
            server.complete_onboarding(
                mock_ctx,
                topics={"python": 7, "git": 8},
                groups={"Languages": ["python"], "Version Control": ["git"]},
            )
        )
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "python" in groups.get("Languages", [])
        assert "git" in groups.get("Version Control", [])

    def test_marks_onboarding_complete(self, mock_ctx, db_path):
        _run(server.complete_onboarding(mock_ctx, topics={"python": 7}))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.is_onboarding_complete(c)["knowledge_ready"] is True
        c.close()

    def test_confidence_clamped(self, mock_ctx, db_path):
        _run(server.complete_onboarding(mock_ctx, topics={"python": 99, "go": -5}))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        knowledge = db.get_all_knowledge(c)
        c.close()
        assert knowledge["python"] == 10
        assert knowledge["go"] == 0

    def test_logs_info_on_success(self, mock_ctx):
        _run(server.complete_onboarding(mock_ctx, topics={"python": 7}))
        mock_ctx.info.assert_called_once()

    def test_exception_returns_empty_profile(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.complete_onboarding(mock_ctx, topics={"python": 7}))
        assert result.knowledge == []
        assert result.groups == []


# ── Resources ──────────────────────────────────────────────────────────────


class TestResources:
    def test_profile_resource_returns_dict(self):
        data = server.profile_resource()
        assert "knowledge" in data
        assert "groups" in data

    def test_settings_resource_returns_dict(self):
        data = server.settings_resource()
        assert "max_per_day" in data
        assert "min_gap_minutes" in data

    def test_recent_lessons_resource_returns_list(self):
        data = server.recent_lessons_resource()
        assert isinstance(data, list)
        assert len(data) == 3  # all seeded with today's date (within the week)

    def test_stats_resource_returns_dict(self):
        data = server.stats_resource()
        assert "total_lessons" in data
        assert data["total_lessons"] == 3

    def test_taught_topics_resource_returns_list(self):
        data = server.taught_topics_resource()
        assert isinstance(data, list)
        assert "sqlite3_row_factory" in data

    def test_rate_limit_resource_returns_dict(self):
        data = server.rate_limit_resource()
        assert "allowed" in data

    def test_context_resource_returns_dict(self):
        data = server.context_resource()
        assert "git" in data
        assert "usage_defaults" in data

    def test_onboarding_resource_returns_dict(self):
        data = server.onboarding_resource()
        assert "needs_onboarding" in data
        assert "detected_stack" in data
        assert "context_ready" in data

    def test_onboarding_needs_onboarding_true_by_default(self):
        data = server.onboarding_resource()
        assert data["needs_onboarding"] is True

    def test_onboarding_needs_onboarding_false_after_complete(self, mock_ctx, db_path):
        _run(server.complete_onboarding(mock_ctx, topics={"python": 7}))
        data = server.onboarding_resource()
        assert data["needs_onboarding"] is False

    def test_lesson_resource_returns_dict(self):
        data = server.lesson_resource("lesson-sqlite-upsert-patterns-001")
        assert data["topic_id"] == "sqlite_upsert_patterns"

    def test_lesson_resource_not_found(self):
        data = server.lesson_resource("nonexistent-id")
        assert "error" in data


# ── Prompt ─────────────────────────────────────────────────────────────────


class TestPrompt:
    def test_devcoach_instructions_returns_string(self):
        result = server.devcoach_instructions()
        assert isinstance(result, str)
        assert len(result) > 0

    def test_devcoach_instructions_contains_coaching_content(self):
        result = server.devcoach_instructions()
        # SKILL.md contains coaching rules — at minimum it should mention lessons or coaching
        assert any(word in result.lower() for word in ("lesson", "coach", "devcoach", "knowledge"))


# ── Tools — delete_lesson ─────────────────────────────────────────────────


class TestDeleteLesson:
    def test_found_returns_true(self, mock_ctx):
        result = _run(server.delete_lesson(mock_ctx, "lesson-sqlite3-row-factory-001"))
        assert result is True

    def test_not_found_returns_false_and_logs_warning(self, mock_ctx):
        result = _run(server.delete_lesson(mock_ctx, "nonexistent-id"))
        assert result is False
        mock_ctx.warning.assert_called_once()

    def test_exception_returns_false_and_logs_error(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.delete_lesson(mock_ctx, "any-id"))
        assert result is False
        mock_ctx.error.assert_called_once()


# ── log_lesson elicitation feedback ───────────────────────────────────────


class TestLogLessonFeedback:
    def _call(self, mock_ctx, **kwargs):
        defaults = dict(
            id="elicit-test-001",
            timestamp=datetime.now(UTC).isoformat(),
            topic_id="elicit_topic",
            categories=["test"],
            title="Elicit test",
            level="mid",
            summary="Elicit summary",
        )
        defaults.update(kwargs)
        return _run(server.log_lesson(mock_ctx, **defaults))

    def test_feedback_know_updates_knowledge(self, mock_ctx, db_path):
        mock_ctx.elicit = AsyncMock(return_value=_ElicitResult("know"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "elicit_topic", 3)
        c.close()

        lesson = self._call(mock_ctx)

        assert lesson.feedback == "know"
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_all_knowledge(c).get("elicit_topic", 3) == 4  # +1 delta
        assert db.get_lesson_by_id(c, "elicit-test-001").feedback == "know"
        c.close()

    def test_feedback_dont_know_updates_knowledge(self, mock_ctx, db_path):
        mock_ctx.elicit = AsyncMock(return_value=_ElicitResult("dont_know"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "elicit_topic", 5)
        c.close()

        lesson = self._call(mock_ctx)

        assert lesson.feedback == "dont_know"
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_all_knowledge(c).get("elicit_topic", 5) == 4  # -1 delta
        c.close()

    def test_feedback_skip_no_update(self, mock_ctx, db_path):
        mock_ctx.elicit = AsyncMock(return_value=_ElicitResult("skip"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "elicit_topic", 5)
        c.close()

        lesson = self._call(mock_ctx)

        assert lesson.feedback is None
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_all_knowledge(c).get("elicit_topic", 5) == 5  # unchanged
        c.close()

    def test_elicitation_exception_graceful(self, mock_ctx, db_path):
        mock_ctx.elicit = AsyncMock(side_effect=RuntimeError("not supported"))

        lesson = self._call(mock_ctx)

        assert lesson.id == "elicit-test-001"
        assert lesson.feedback is None
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_lesson_by_id(c, "elicit-test-001") is not None
        c.close()


# ── Exception paths ────────────────────────────────────────────────────────


class TestExceptionPaths:
    """Cover all exception-handler branches that return safe fallbacks."""

    def test_log_lesson_usage_defaults_exception_falls_back(self, mock_ctx):
        with patch(
            "devcoach.core.db.get_usage_defaults", side_effect=sqlite3.OperationalError("err")
        ):
            result = _run(
                server.log_lesson(
                    mock_ctx,
                    id="exc-log-001",
                    timestamp=datetime.now(UTC).isoformat(),
                    topic_id="exc_topic",
                    categories=["test"],
                    title="Exc test",
                    level="mid",
                    summary="exc summary",
                )
            )
        assert result.id == "exc-log-001"

    def test_update_knowledge_exception_raises_and_logs_error(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            with pytest.raises(sqlite3.OperationalError):
                _run(server.update_knowledge(mock_ctx, "python", 1))
        mock_ctx.error.assert_called_once()

    def test_get_lessons_exception_returns_empty_list(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.get_lessons()
        assert result == []

    def test_star_lesson_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.star_lesson(mock_ctx, "any-id", starred=True))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_submit_feedback_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.submit_feedback(mock_ctx, "any-id", "know"))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_add_topic_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.add_topic(mock_ctx, "new_topic", 5))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_remove_topic_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.remove_topic(mock_ctx, "python"))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_add_group_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.add_group(mock_ctx, "SomeGroup"))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_remove_group_exception_returns_false(self, mock_ctx):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = _run(server.remove_group(mock_ctx, "SomeGroup"))
        assert result is False
        mock_ctx.error.assert_called_once()

    def test_profile_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.profile_resource()
        assert "error" in result

    def test_settings_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.settings_resource()
        assert "error" in result

    def test_recent_lessons_resource_exception_returns_error_list(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.recent_lessons_resource()
        assert isinstance(result, list)
        assert "error" in result[0]

    def test_stats_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.stats_resource()
        assert "error" in result

    def test_taught_topics_resource_exception_returns_empty_list(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.taught_topics_resource()
        assert result == []

    def test_rate_limit_resource_exception_returns_not_allowed(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.rate_limit_resource()
        assert result["allowed"] is False

    def test_context_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.context_resource()
        assert "error" in result

    def test_onboarding_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.onboarding_resource()
        assert "error" in result

    def test_lesson_resource_exception_returns_error_dict(self):
        with patch.object(db, "connection", side_effect=sqlite3.OperationalError("err")):
            result = server.lesson_resource("any-id")
        assert "error" in result

    def test_devcoach_instructions_exception_returns_fallback(self):
        with patch(
            "devcoach.mcp.server.importlib.resources.files", side_effect=Exception("not found")
        ):
            result = server.devcoach_instructions()
        assert "unavailable" in result


# ── Entry point ────────────────────────────────────────────────────────────


class TestMain:
    def test_delegates_to_run_cli(self, monkeypatch):
        with patch("devcoach.cli.commands.run_cli") as mock_cli:
            server.main()
        mock_cli.assert_called_once()

    def test_mcp_subcommand_starts_server(self, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["devcoach", "mcp"])
        with patch("devcoach.mcp.server.mcp.run") as mock_run:
            import argparse

            from devcoach.cli.commands import cmd_mcp

            cmd_mcp(argparse.Namespace())
        mock_run.assert_called_once_with(transport="stdio")
