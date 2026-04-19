"""FastMCP server for devcoach — tools, prompt, and entry point."""

from __future__ import annotations

import importlib.resources
import shutil
import sqlite3
import subprocess
import sys
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


# ── Connection factory ─────────────────────────────────────────────────────

def _get_conn() -> sqlite3.Connection:
    conn = db.get_connection()
    db.init_schema(conn)
    return conn


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
    )
    try:
        conn = _get_conn()
        db.insert_lesson(conn, lesson)
        conn.close()
        return "ok"
    except Exception as exc:
        return f"error: {exc}"


@mcp.tool
def get_profile() -> Profile:
    """Return the user's current knowledge map (topic → confidence 0-10)."""
    try:
        conn = _get_conn()
        profile = coach.get_profile(conn)
        conn.close()
        return profile
    except Exception:
        return Profile(knowledge={})


@mcp.tool
def update_knowledge(topic: str, delta: int) -> Profile:
    """Adjust the confidence score for a topic by delta (e.g. +1 or -1).

    Returns the updated Profile. Confidence is clamped to 0-10.
    If the topic does not exist it is created with a base confidence of 5.
    """
    try:
        conn = _get_conn()
        profile = coach.apply_knowledge_delta(conn, topic, delta)
        conn.close()
        return profile
    except Exception:
        return Profile(knowledge={})


@mcp.tool
def check_rate_limit() -> RateLimitResult:
    """Check whether a new coaching lesson can be delivered right now.

    Returns allowed=True if the daily cap and minimum interval allow it,
    or allowed=False with a human-readable reason.
    """
    try:
        conn = _get_conn()
        result = coach.check_rate_limit(conn)
        conn.close()
        return result
    except Exception:
        return RateLimitResult(allowed=True)


@mcp.tool
def get_lessons(
    period: Optional[Literal["today", "week", "month", "year", "all"]] = None,
    category: Optional[str] = None,
) -> list[Lesson]:
    """Query the coaching lesson history.

    period: today | week | month | year | all (default: all)
    category: filter by a specific category tag (e.g. "python", "docker")
    Both filters can be combined.
    """
    try:
        conn = _get_conn()
        lessons = db.get_lessons(conn, period=period, category=category)
        conn.close()
        return lessons
    except Exception:
        return []


@mcp.tool
def get_taught_topics() -> list[str]:
    """Return all topic_ids that have already been taught.

    Use this before selecting a new lesson topic to avoid repetition.
    """
    try:
        conn = _get_conn()
        topics = coach.list_taught_topics(conn)
        conn.close()
        return topics
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
    cli_commands = {"profile", "lessons", "lesson", "settings", "set", "ui"}
    if len(sys.argv) > 1 and sys.argv[1] in cli_commands:
        from devcoach.cli.commands import run_cli
        run_cli()
    else:
        mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
