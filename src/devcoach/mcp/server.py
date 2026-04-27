"""FastMCP server for devcoach — tools, resources, prompt, and entry point."""

from __future__ import annotations

import importlib.resources
import json
import shutil
import subprocess
from pathlib import Path
from typing import Literal

from fastmcp import Context, FastMCP

from devcoach.core import coach, db
from devcoach.core.detect import detect_stack
from devcoach.core.git import detect_git_context
from devcoach.core.models import Lesson, Level, Profile, RepositoryPlatform, Settings

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
async def log_lesson(
    ctx: Context,
    id: str,
    timestamp: str,
    topic_id: str,
    categories: list[str],
    title: str,
    level: Level,
    summary: str,
    task_context: str | None = None,
    project: str | None = None,
    repository: str | None = None,
    branch: str | None = None,
    commit_hash: str | None = None,
    folder: str | None = None,
    repository_platform: RepositoryPlatform | None = None,
) -> Lesson:
    """Save a delivered lesson to the coaching log.

    Git metadata fields (project, repository, branch, commit_hash, folder,
    repository_platform) are auto-detected from the current workspace when
    not provided. Detection order: caller value → git auto-detect → usage
    default from past lessons → None.

    Returns the saved Lesson with all resolved fields (including any auto-filled git context).
    """
    git_ctx = detect_git_context()
    try:
        with db.connection() as conn:
            usage = db.get_usage_defaults(conn)
    except Exception:
        usage = {}

    resolved_project = project or git_ctx["project"] or usage.get("project")
    resolved_repository = repository or git_ctx["repository"] or usage.get("repository")
    resolved_branch = branch or git_ctx["branch"] or usage.get("branch")
    resolved_commit = commit_hash or git_ctx["commit_hash"]
    resolved_folder = folder or git_ctx["folder"]
    resolved_platform = (
        repository_platform or git_ctx["repository_platform"] or usage.get("repository_platform")
    )

    auto_filled = {
        k: v
        for k, v in {
            "project": resolved_project if not project else None,
            "branch": resolved_branch if not branch else None,
            "commit_hash": resolved_commit if not commit_hash else None,
        }.items()
        if v is not None
    }
    if auto_filled:
        await ctx.info(f"log_lesson: auto-filled git context {auto_filled}")

    lesson = Lesson(
        id=id,
        timestamp=timestamp,
        topic_id=topic_id,
        categories=categories,
        title=title,
        level=level,
        summary=summary,
        task_context=task_context,
        project=resolved_project,
        repository=resolved_repository,
        branch=resolved_branch,
        commit_hash=resolved_commit,
        folder=resolved_folder,
        repository_platform=resolved_platform,
    )
    with db.connection() as conn:
        db.insert_lesson(conn, lesson)
    return lesson


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
        return Profile(knowledge=[], groups=[])


@mcp.tool
def get_lessons(
    period: Literal["today", "week", "month", "year", "all"] | None = None,
    category: str | None = None,
    level: Literal["junior", "mid", "senior"] | None = None,
    project: str | None = None,
    repository: str | None = None,
    branch: str | None = None,
    commit: str | None = None,
    starred: bool | None = None,
    feedback: Literal["know", "dont_know", "none"] | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
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
def star_lesson(lesson_id: str, starred: bool) -> bool:
    """Set the starred (favourite) flag on a lesson to the given value.

    starred: true to mark as favourite, false to unmark.
    Returns the new starred state. Idempotent — calling with the same value twice is safe.
    """
    with db.connection() as conn:
        return db.set_star(conn, lesson_id, starred)


@mcp.tool
def submit_feedback(lesson_id: str, feedback: Literal["know", "dont_know", "clear"]) -> Profile:
    """Record user comprehension feedback for a lesson and update knowledge confidence.

    feedback: "know" (understood, confidence +1) | "dont_know" (needs practice, confidence -1)
              | "clear" (remove feedback only — confidence is NOT adjusted)
    Returns the updated Profile.
    """
    try:
        feedback_value = None if feedback == "clear" else feedback
        with db.connection() as conn:
            coach.record_feedback(conn, lesson_id, feedback_value)
            return coach.get_profile(conn)
    except Exception:
        return Profile(knowledge=[], groups=[])


@mcp.tool
def add_topic(topic: str, confidence: int = 5, group: str | None = None) -> Profile:
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
def update_settings(key: Literal["max_per_day", "min_gap_minutes"], value: str) -> Settings:
    """Update a coaching setting.

    key: 'max_per_day' or 'min_gap_minutes'
    value: new value as a string
      - max_per_day: integer 1-20 (max lessons delivered in a 24h window)
      - min_gap_minutes: integer 0-1440 (minimum minutes between lessons; 0 = no cooldown)
    Returns the full updated Settings on success.
    """
    try:
        int_val = int(value)
    except ValueError:
        raise ValueError(f"Value must be an integer, got '{value}'")
    if key == "max_per_day" and not (1 <= int_val <= 20):
        raise ValueError("max_per_day must be between 1 and 20")
    if key == "min_gap_minutes" and not (0 <= int_val <= 1440):
        raise ValueError("min_gap_minutes must be between 0 and 1440")
    with db.connection() as conn:
        db.set_setting(conn, key, str(int_val))
        return db.get_settings(conn)


@mcp.tool
def open_ui(port: int = 7860) -> str:
    """Launch the devcoach web dashboard in the background.

    Opens http://localhost:<port> — defaults to 7860.
    port must be in the range 1024-65535.
    """
    if not (1024 <= port <= 65535):
        return f"error: port {port} is out of valid range (1024-65535)"
    cmd = (
        ["uvx", "devcoach", "ui", "--port", str(port)]
        if shutil.which("uvx")
        else ["devcoach", "ui", "--port", str(port)]
    )
    subprocess.Popen(cmd)
    return f"devcoach UI starting at http://localhost:{port}"


@mcp.tool
async def complete_onboarding(
    ctx: Context,
    topics: dict[str, int],
    groups: dict[str, list[str]] | None = None,
) -> Profile:
    """Save the user's initial knowledge profile and mark onboarding complete.

    topics: {topic_id: confidence_0_to_10} — all topics the user confirmed.
    groups: {group_name: [topic_id, ...]} — optional grouping structure.
      Topics not listed in any group are placed in 'Other'.
      Groups are dynamically defined by the onboarding conversation — there
      is no predefined catalogue. Suggest logical groupings based on what
      the user selected (e.g. Languages, Backend, DevOps, Version Control)
      and confirm with the user before calling this tool.

    Wipes any default-seeded profile, saves selections, marks onboarding done.
    Returns the updated Profile.
    """
    try:
        with db.connection() as conn:
            conn.execute("DELETE FROM knowledge")
            conn.execute("DELETE FROM knowledge_groups")
            conn.execute("DELETE FROM knowledge_group_names")
            conn.commit()
            for topic, confidence in topics.items():
                db.upsert_knowledge(conn, topic, max(0, min(10, confidence)))
            if groups:
                for group_name, group_topics in groups.items():
                    for t in group_topics:
                        if t in topics:
                            db.assign_topic_to_group(conn, t, group_name)
            db.set_setting(conn, "onboarding_completed", "1")
            profile = coach.get_profile(conn)
        await ctx.info(f"Onboarding complete — {len(topics)} topics, {len(groups or {})} groups")
        return profile
    except Exception:
        return Profile(knowledge=[], groups=[])


# ── MCP Resources ──────────────────────────────────────────────────────────


@mcp.resource("devcoach://profile")
def profile_resource() -> str:
    """Current knowledge map — topics, confidence scores, and groups."""
    try:
        with db.connection() as conn:
            return coach.get_profile(conn).model_dump_json(indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://settings")
def settings_resource() -> str:
    """Current coaching settings (rate limits)."""
    try:
        with db.connection() as conn:
            settings = db.get_settings(conn)
        return json.dumps(settings.model_dump(), indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://lessons/recent")
def recent_lessons_resource() -> str:
    """Last 10 lessons from the current week."""
    try:
        with db.connection() as conn:
            lessons = db.get_lessons(conn, period="week")
        return json.dumps(
            [lesson.model_dump() for lesson in lessons[:10]],
            indent=2,
            ensure_ascii=False,
        )
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://stats")
def stats_resource() -> str:
    """Aggregate coaching statistics: lesson counts, rate-limit state, weakest/strongest topics."""
    try:
        with db.connection() as conn:
            return json.dumps(coach.get_stats(conn), indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://taught-topics")
def taught_topics_resource() -> str:
    """All topic_ids that have already been taught.

    Read this before selecting a new lesson topic to avoid repetition.
    """
    try:
        with db.connection() as conn:
            return json.dumps(coach.list_taught_topics(conn))
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://rate-limit")
def rate_limit_resource() -> str:
    """Current rate-limit status.

    Returns {allowed, reason} — check this before delivering a lesson.
    """
    try:
        with db.connection() as conn:
            result = coach.check_rate_limit(conn)
        return result.model_dump_json(indent=2, exclude_none=True)
    except Exception as exc:
        return json.dumps({"allowed": False, "reason": f"Rate limit check unavailable: {exc}"})


@mcp.resource("devcoach://context")
def context_resource() -> str:
    """Current workspace git context and most-used lesson metadata defaults.

    git: auto-detected from cwd (branch, commit, repository, platform, folder).
    usage_defaults: most-frequently used values from past lessons — used as
      fallback when git detection finds nothing.
    """
    try:
        git = detect_git_context()
        with db.connection() as conn:
            usage = db.get_usage_defaults(conn)
        return json.dumps({"git": git, "usage_defaults": usage}, indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://onboarding")
def onboarding_resource() -> str:
    """Onboarding status and auto-detected stack for first-run setup.

    needs_onboarding: true if the user has not yet completed the setup flow.
    detected_stack: {topic_id: confidence} inferred from project files in cwd.
      These are suggestions only — the user confirms or adjusts them during
      the onboarding conversation before complete_onboarding is called.
    context_ready: true if a git branch was successfully detected in cwd.
    """
    try:
        with db.connection() as conn:
            done = db.is_onboarding_complete(conn)
        git = detect_git_context()
        detected = detect_stack(git["folder"] or str(Path.cwd()))
        return json.dumps(
            {
                "needs_onboarding": not done,
                "detected_stack": detected,
                "context_ready": git["branch"] is not None,
            },
            indent=2,
        )
    except Exception as exc:
        return json.dumps({"error": str(exc)})


@mcp.resource("devcoach://lessons/{lesson_id}")
def lesson_resource(lesson_id: str) -> str:
    """A single lesson by ID.

    Returns the full lesson JSON, or {"error": "..."} if not found.
    """
    try:
        with db.connection() as conn:
            lesson = db.get_lesson_by_id(conn, lesson_id)
        if lesson is None:
            return json.dumps({"error": f"Lesson '{lesson_id}' not found"})
        return lesson.model_dump_json(indent=2)
    except Exception as exc:
        return json.dumps({"error": str(exc)})


# ── MCP Prompt ────────────────────────────────────────────────────────────


@mcp.prompt
def devcoach_instructions() -> str:
    """Full coaching instructions for the devcoach skill (content of SKILL.md)."""
    try:
        return (
            importlib.resources.files("devcoach").joinpath("SKILL.md").read_text(encoding="utf-8")
        )
    except Exception:
        return "devcoach: coaching instructions unavailable (SKILL.md not found in package)."


# ── Entry point ───────────────────────────────────────────────────────────


def main() -> None:
    """Entry point — delegates to the CLI dispatcher."""
    from devcoach.cli.commands import run_cli

    run_cli()


if __name__ == "__main__":
    main()
