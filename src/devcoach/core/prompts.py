"""Lesson template builders by knowledge level for devcoach."""

from __future__ import annotations

from devcoach.core.models import Lesson

# Visual width (in columns) of a band's "<dashes> title <dashes>" region,
# excluding the leading "### " heading marker. Bands are normalised to this
# width so the top and bottom of the card line up.
_BAND_WIDTH = 34


def _band(title: str) -> str:
    """Build a titled, centered rule rendered as a Markdown heading.

    The ``### `` prefix lets the Claude Code terminal renderer colour the whole
    line; the surrounding box-drawing dashes are centered around ``title`` to a
    constant width so every card is symmetric.
    """
    pad = max(_BAND_WIDTH - len(title) - 2, 2)  # 2 = the spaces flanking the title
    left = pad // 2
    return f"### {'─' * left} {title} {'─' * (pad - left)}"


def format_lesson_for_display(lesson: Lesson) -> str:
    """Format a Lesson as the markdown block appended to a coaching response."""
    level_label = lesson.level.capitalize()
    category_str = " · ".join(lesson.categories)
    content = [
        f"{category_str} · Level: {level_label}",
        "",
        f"**{lesson.title}**",
        "",
        lesson.summary,
    ]
    if lesson.task_context:
        content += ["", f"*Context: {lesson.task_context}*"]
    quoted = [f"> {line}".rstrip() for line in content]
    return "\n".join(
        [
            _band("🎓 devcoach"),
            *quoted,
            "",
            _band(f"{lesson.topic_id} · {lesson.level}"),
        ]
    )


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
