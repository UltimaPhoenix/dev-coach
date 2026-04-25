"""FastMCP server for devcoach — tools, prompt, and entry point."""

from __future__ import annotations

import importlib.resources
import json
import shutil
import subprocess
import sys
from typing import Literal, Optional

from fastmcp import FastMCP

from devcoach.core import coach, db
from devcoach.core.models import Lesson, Level, Profile, RateLimitResult, RepositoryPlatform

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
    level: Level,
    summary: str,
    task_context: Optional[str] = None,
    project: Optional[str] = None,
    repository: Optional[str] = None,
    branch: Optional[str] = None,
    commit_hash: Optional[str] = None,
    folder: Optional[str] = None,
    repository_platform: Optional[RepositoryPlatform] = None,
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
        repository_platform=repository_platform,
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
    level: Optional[Literal["junior", "mid", "senior"]] = None,
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
    level: filter by difficulty level — junior | mid | senior
    project / repository / branch: fuzzy match on git metadata
    commit: fuzzy match on commit hash
    starred: True to return only starred (favourite) lessons
    feedback: "know" | "dont_know" | "none" (no response given)
    search: full-text search across title, topic_id, and summary
    date_from / date_to: ISO date/datetime strings; override period when set.
      Date-only (YYYY-MM-DD) or with time (YYYY-MM-DDTHH:MM or YYYY-MM-DDTHH:MM:SS).
      date_to with date-only is treated as end-of-day (23:59:59).
    All filters can be combined.
    """
    try:
        with db.connection() as conn:
            return db.get_lessons(
                conn,
                period=period,
                category=category,
                level=level,
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
            return coach.get_stats(conn)
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
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def add_topic(topic: str, confidence: int = 5, group: Optional[str] = None) -> Profile:
    """Add a new topic to the knowledge map, or update confidence if it already exists.

    topic: topic identifier, e.g. 'rust_lifetimes'
    confidence: initial confidence score 0-10 (default 5)
    group: optional group name; topic appears under 'Other' if omitted
    Returns the updated Profile.
    """
    try:
        with db.connection() as conn:
            db.upsert_knowledge(conn, topic, confidence)
            if group and group != "Other":
                db.assign_topic_to_group(conn, topic, group)
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def remove_topic(topic: str) -> Profile:
    """Remove a topic from the knowledge map entirely.

    Returns the updated Profile.
    """
    try:
        with db.connection() as conn:
            db.delete_knowledge(conn, topic)
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def add_group(name: str) -> Profile:
    """Create a new (initially empty) knowledge group.

    name: group name, e.g. 'Machine Learning'
    Note: add_topic(group=name) also auto-creates the group when assigning a topic.
    Returns the updated Profile.
    """
    try:
        name = name.strip()
        with db.connection() as conn:
            db.add_group(conn, name)
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def remove_group(name: str) -> Profile:
    """Delete a knowledge group. Topics in the group move to Other.

    Returns the updated Profile.
    """
    try:
        with db.connection() as conn:
            db.delete_group(conn, name)
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def update_settings(key: str, value: str) -> dict:
    """Update a coaching setting.

    key: 'max_per_day' or 'min_gap_minutes'
    value: new value as a string (e.g. '3' or '120')
    Returns the updated settings dict.
    """
    try:
        valid_keys = {"max_per_day", "min_gap_minutes"}
        if key not in valid_keys:
            return {"error": f"Unknown key '{key}'. Valid keys: {', '.join(sorted(valid_keys))}"}
        with db.connection() as conn:
            db.set_setting(conn, key, value)
            s = db.get_settings(conn)
        return {"max_per_day": s.max_per_day, "min_gap_minutes": s.min_gap_minutes}
    except Exception as exc:
        return {"error": str(exc)}


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
    """Current knowledge map — topics, confidence scores, and groups."""
    with db.connection() as conn:
        return coach.get_profile(conn).model_dump_json(indent=2)


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
        "settings", "set", "stats", "backup", "restore", "ui",
        "knowledge-add", "knowledge-remove",
        "group-add", "group-remove", "group-assign",
    }
    if len(sys.argv) > 1 and sys.argv[1] in cli_commands:
        from devcoach.cli.commands import run_cli
        run_cli()
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
