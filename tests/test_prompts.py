"""Tests for core/prompts.py — lesson formatting and prompt building."""

from __future__ import annotations

from datetime import UTC, datetime

from devcoach.core.models import Lesson
from devcoach.core.prompts import build_prompt_for_level, format_lesson_for_display


def _make_lesson(**kwargs) -> Lesson:
    defaults = dict(
        id="test-001",
        timestamp=datetime.now(UTC).isoformat(),
        topic_id="python_generators",
        categories=["python"],
        title="Generator expressions vs list comprehensions",
        level="mid",
        summary="Generators are lazy: they yield one item at a time.",
    )
    defaults.update(kwargs)
    return Lesson(**defaults)


# ── format_lesson_for_display ──────────────────────────────────────────────


class TestFormatLessonForDisplay:
    def test_contains_title(self):
        lesson = _make_lesson()
        output = format_lesson_for_display(lesson)
        assert "Generator expressions vs list comprehensions" in output

    def test_contains_summary(self):
        lesson = _make_lesson()
        output = format_lesson_for_display(lesson)
        assert "Generators are lazy" in output

    def test_contains_category(self):
        lesson = _make_lesson(categories=["python", "performance"])
        output = format_lesson_for_display(lesson)
        assert "python" in output
        assert "performance" in output

    def test_contains_level(self):
        lesson = _make_lesson(level="senior")
        output = format_lesson_for_display(lesson)
        assert "Senior" in output

    def test_starts_with_separator(self):
        lesson = _make_lesson()
        output = format_lesson_for_display(lesson)
        assert output.startswith("---")

    def test_task_context_included_when_present(self):
        lesson = _make_lesson(task_context="Refactoring a large data pipeline")
        output = format_lesson_for_display(lesson)
        assert "Refactoring a large data pipeline" in output
        assert "Context:" in output

    def test_task_context_absent_when_none(self):
        lesson = _make_lesson(task_context=None)
        output = format_lesson_for_display(lesson)
        assert "Context:" not in output

    def test_multiple_categories_joined_with_dot(self):
        lesson = _make_lesson(categories=["python", "asyncio", "concurrency"])
        output = format_lesson_for_display(lesson)
        assert "python · asyncio · concurrency" in output


# ── build_prompt_for_level ────────────────────────────────────────────────


class TestBuildPromptForLevel:
    def test_confidence_0_returns_junior_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 0)
        assert "beginner" in prompt.lower()
        assert "generators" in prompt

    def test_confidence_3_returns_junior_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 3)
        assert "beginner" in prompt.lower()

    def test_confidence_4_returns_mid_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 4)
        assert (
            "intermediate" in prompt.lower()
            or "tradeoff" in prompt.lower()
            or "why" in prompt.lower()
        )

    def test_confidence_6_returns_mid_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 6)
        assert (
            "intermediate" in prompt.lower()
            or "tradeoff" in prompt.lower()
            or "why" in prompt.lower()
        )

    def test_confidence_7_returns_senior_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 7)
        assert (
            "senior" in prompt.lower()
            or "edge case" in prompt.lower()
            or "production" in prompt.lower()
        )

    def test_confidence_9_returns_senior_prompt(self):
        prompt = build_prompt_for_level("generators", "data pipeline", 9)
        assert (
            "senior" in prompt.lower()
            or "edge case" in prompt.lower()
            or "production" in prompt.lower()
        )

    def test_confidence_10_returns_empty_string(self):
        assert build_prompt_for_level("generators", "data pipeline", 10) == ""

    def test_context_included_in_prompt(self):
        prompt = build_prompt_for_level("generators", "large CSV import", 5)
        assert "large CSV import" in prompt

    def test_topic_included_in_prompt(self):
        prompt = build_prompt_for_level("asyncio_taskgroup", "background tasks", 5)
        assert "asyncio_taskgroup" in prompt
