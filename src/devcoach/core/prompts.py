"""Lesson template builders by knowledge level for devcoach."""

from __future__ import annotations

from devcoach.core.models import Lesson


def format_lesson_for_display(lesson: Lesson) -> str:
    """Format a Lesson as the markdown block appended to a coaching response."""
    level_label = lesson.level.capitalize()
    category_str = " · ".join(lesson.categories)
    lines = [
        "---",
        f"🎓 **devcoach** · {category_str} · Level: {level_label}",
        "",
        f"**{lesson.title}**",
        "",
        lesson.summary,
    ]
    if lesson.task_context:
        lines += ["", f"*Context: {lesson.task_context}*"]
    return "\n".join(lines)


def build_prompt_for_level(topic: str, context: str, confidence: int) -> str:
    """Select the appropriate prompt template based on confidence score.

    0-3  → junior
    4-6  → mid
    7-9  → senior
    10   → topic mastered, returns empty string
    """
    if confidence <= 3:
        return (
            f"Explain '{topic}' for a beginner. Use a simple analogy. "
            f"Avoid jargon. Show a minimal code example if helpful. "
            f"Connect the explanation to: {context}"
        )
    elif confidence <= 6:
        return (
            f"Explain the 'why' behind '{topic}' for an intermediate developer. "
            f"Mention two or three alternative approaches and their tradeoffs. "
            f"Connect the explanation to: {context}"
        )
    elif confidence <= 9:
        return (
            f"Give a senior-level perspective on '{topic}'. "
            f"Focus on edge cases, production tradeoffs, and historical context. "
            f"Assume the reader already knows the basics. "
            f"Connect the explanation to: {context}"
        )
    return ""
