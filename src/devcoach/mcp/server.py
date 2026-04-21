"""FastMCP server for devcoach — tools, prompt, and entry point."""

from __future__ import annotations

import importlib.resources
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastmcp import FastMCP

from devcoach.core import coach, db
from devcoach.core.models import Lesson, Profile, RateLimitResult

# ── FastMCP app ────────────────────────────────────────────────────────────

mcp = FastMCP(
    name="devcoach",
    instructions=(
        "Progressive technical coaching server. "
        "Use the devcoach_instructions prompt for full coaching behaviour guidelines."
    ),
)


# ── MCP Tools ─────────────────────────────────────────────────────────────

@mcp.tool
def log_lesson(
    id: str,
    timestamp: str,
    topic_id: str,
    categories: list[str],
    title: str,
    level: Literal["junior", "mid", "senior"],
    summary: str,
    task_context: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit_hash: Optional[str] = None,
    folder: Optional[str] = None,
) -> str:
    """Save a delivered lesson to the coaching log. Returns 'ok' on success."""
    lesson = Lesson(
        id=id,
        timestamp=timestamp,
        topic_id=topic_id,
        categories=categories,
        title=title,
        level=level,
        summary=summary,
        task_context=task_context,
        project=project,
        repository=repository,
        branch=branch,
        commit_hash=commit_hash,
        folder=folder,
    )
    try:
        with db.connection() as conn:
            db.insert_lesson(conn, lesson)
        return "ok"
    except Exception as exc:
        return f"error: {exc}"


@mcp.tool
def get_profile() -> Profile:
    """Return the user's current knowledge map (topic → confidence 0-10)."""
    try:
        with db.connection() as conn:
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge={})


@mcp.tool
def update_knowledge(topic: str, delta: int) -> Profile:
    """Adjust the confidence score for a topic by delta (e.g. +1 or -1).

    Returns the updated Profile. Confidence is clamped to 0-10.
    If the topic does not exist it is created with a base confidence of 5.
    """
    try:
        with db.connection() as conn:
            return coach.apply_knowledge_delta(conn, topic, delta)
    except Exception:
        return Profile(knowledge={})


@mcp.tool
def check_rate_limit() -> RateLimitResult:
    """Check whether a new coaching lesson can be delivered right now.

    Returns allowed=True if the daily cap and minimum interval allow it,
    or allowed=False with a human-readable reason.
    """
    try:
        with db.connection() as conn:
            return coach.check_rate_limit(conn)
    except Exception:
        return RateLimitResult(allowed=True)


@mcp.tool
def get_lessons(
    period: Optional[Literal["today", "week", "month", "year", "all"]] = None,
    category: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit: Optional[str] = None,
    starred: Optional[bool] = None,
    feedback: Optional[Literal["know", "dont_know", "none"]] = None,
    search: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
) -> list[Lesson]:
    """Query the coaching lesson history.

    period: today | week | month | year | all (default: all)
    category: filter by a specific category tag (e.g. "python", "docker")
    project / repository / branch: fuzzy match on git metadata
    commit: fuzzy match on commit hash
    starred: True to return only starred (favourite) lessons
    feedback: "know" | "dont_know" | "none" (no response given)
    search: full-text search across title, topic_id, and summary
    date_from / date_to: ISO date strings (YYYY-MM-DD); override period when set
    All filters can be combined.
    """
    try:
        with db.connection() as conn:
            return db.get_lessons(
                conn,
                period=period,
                category=category,
                project=project,
                repository=repository,
                branch=branch,
                commit=commit,
                starred=starred,
                feedback=feedback,
                search=search,
                date_from=date_from,
                date_to=date_to,
            )
    except Exception:
        return []


@mcp.tool
def get_lesson(lesson_id: str) -> Optional[Lesson]:
    """Return a single lesson by ID, or None if not found."""
    try:
        with db.connection() as conn:
            return db.get_lesson_by_id(conn, lesson_id)
    except Exception:
        return None


@mcp.tool
def get_stats() -> dict:
    """Return aggregate coaching statistics for a quick overview.

    Returns counts, rate-limit state, and the 5 weakest / 5 strongest topics.
    """
    try:
        with db.connection() as conn:
            now = datetime.now(timezone.utc)
            total = len(db.get_lessons(conn))
            today_cutoff = (now - timedelta(hours=24)).isoformat()
            week_cutoff = (now - timedelta(days=7)).isoformat()
            lessons_today = db.count_lessons_since(conn, today_cutoff)
            lessons_week = db.count_lessons_since(conn, week_cutoff)
            knowledge = db.get_all_knowledge(conn)

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


@mcp.tool
def star_lesson(lesson_id: str) -> str:
    """Toggle the starred (favourite) flag on a lesson.

    Returns 'starred' or 'unstarred' to indicate the new state.
    """
    try:
        with db.connection() as conn:
            new_state = db.toggle_star(conn, lesson_id)
        return "starred" if new_state else "unstarred"
    except Exception as exc:
        return f"error: {exc}"


@mcp.tool
def submit_feedback(lesson_id: str, feedback: str) -> Profile:
    """Record user comprehension feedback for a lesson and update knowledge confidence.

    feedback: "know" (understood) | "dont_know" (needs more practice) | "clear" (remove feedback)
    Automatically adjusts the topic's confidence score by ±1 and returns the updated Profile.
    """
    try:
        feedback_value = None if feedback == "clear" else feedback
        with db.connection() as conn:
            coach.record_feedback(conn, lesson_id, feedback_value)
            knowledge = db.get_all_knowledge(conn)
        return Profile(knowledge=knowledge)
    except Exception:
        return Profile(knowledge={})


@mcp.tool
def get_taught_topics() -> list[str]:
    """Return all topic_ids that have already been taught.

    Use this before selecting a new lesson topic to avoid repetition.
    """
    try:
        with db.connection() as conn:
            return coach.list_taught_topics(conn)
    except Exception:
        return []


@mcp.tool
def open_ui(port: int = 7860) -> str:
    """Launch the devcoach web dashboard in the background.

    Opens http://localhost:<port> — defaults to 7860.
    """
    cmd = (
        ["uvx", "devcoach", "ui", "--port", str(port)]
        if shutil.which("uvx")
        else ["devcoach", "ui", "--port", str(port)]
    )
    subprocess.Popen(cmd)
    return f"devcoach UI starting at http://localhost:{port}"


# ── MCP Resources ──────────────────────────────────────────────────────────

@mcp.resource("devcoach://profile")
def profile_resource() -> str:
    """Current knowledge map — topic → confidence (0-10)."""
    with db.connection() as conn:
        knowledge = db.get_all_knowledge(conn)
    return json.dumps(knowledge, indent=2)


@mcp.resource("devcoach://settings")
def settings_resource() -> str:
    """Current coaching settings (rate limits)."""
    with db.connection() as conn:
        settings = db.get_settings(conn)
    return json.dumps(settings.model_dump(), indent=2)


@mcp.resource("devcoach://lessons/recent")
def recent_lessons_resource() -> str:
    """Last 10 lessons from the current week."""
    with db.connection() as conn:
        lessons = db.get_lessons(conn, period="week")
    return json.dumps(
        [l.model_dump() for l in lessons[:10]],
        indent=2,
        ensure_ascii=False,
    )


# ── MCP Prompt ────────────────────────────────────────────────────────────

@mcp.prompt
def devcoach_instructions() -> str:
    """Full coaching instructions for the devcoach skill (content of SKILL.md)."""
    try:
        return (
            importlib.resources.files("devcoach")
            .joinpath("SKILL.md")
            .read_text(encoding="utf-8")
        )
    except Exception:
        return "devcoach: coaching instructions unavailable (SKILL.md not found in package)."


# ── Entry point ───────────────────────────────────────────────────────────

def main() -> None:
    """Start devcoach: CLI subcommand if given, else stdio MCP server."""
    cli_commands = {
        "profile", "lessons", "lesson", "star", "feedback",
        "settings", "set", "backup", "restore", "ui",
    }
    if len(sys.argv) > 1 and sys.argv[1] in cli_commands:
        from devcoach.cli.commands import run_cli
        run_cli()
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
