"""FastMCP server for devcoach — tools, resources, prompt, and entry point."""

from __future__ import annotations

import importlib.resources
import shutil
import subprocess
from pathlib import Path
from typing import Literal

from fastmcp import Context, FastMCP
from mcp.types import ToolAnnotations

from devcoach.core import coach, db
from devcoach.core.db import DEFAULT_PROFILE
from devcoach.core.detect import detect_stack
from devcoach.core.git import detect_git_context
from devcoach.core.models import Lesson, Level, Profile, RepositoryPlatform, Settings

NOTEBOOK_PATH = Path.home() / ".devcoach" / "learning-state.md"

# ── FastMCP app ────────────────────────────────────────────────────────────

mcp = FastMCP(
    name="devcoach",
    instructions=(
        "Progressive technical coaching server. "
        "Use the devcoach_instructions prompt for full coaching behaviour guidelines."
    ),
)


# ── MCP Tools ─────────────────────────────────────────────────────────────


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def log_lesson(
    ctx: Context,
    id: str,
    timestamp: str,
    topic_id: str,
    categories: list[str],
    title: str,
    level: Level,
    summary: str,
    body: str | None = None,
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
        body=body,
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


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def update_knowledge(ctx: Context, topic: str, delta: int) -> int:
    """Adjust the confidence score for a topic by delta (e.g. +1 or -1).

    Returns the new confidence value (0-10).
    Creates the topic at confidence 5 if it does not exist.
    """
    try:
        with db.connection() as conn:
            return coach.apply_knowledge_delta(conn, topic, delta)
    except Exception as exc:
        await ctx.error(f"update_knowledge failed for '{topic}': {exc}")
        raise


@mcp.tool(
    annotations=ToolAnnotations(
        readOnlyHint=True, destructiveHint=False, idempotentHint=True, openWorldHint=False
    )
)
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


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def star_lesson(ctx: Context, lesson_id: str, starred: bool) -> bool:
    """Set the starred (favourite) flag on a lesson to the given value.

    starred: true to mark as favourite, false to unmark.
    Returns True if the lesson was found and updated, False if the lesson does not exist.
    Idempotent — calling with the same value twice is safe.
    """
    try:
        with db.connection() as conn:
            found = db.set_star(conn, lesson_id, starred)
        if not found:
            await ctx.warning(f"star_lesson: lesson '{lesson_id}' not found")
        return found
    except Exception as exc:
        await ctx.error(f"star_lesson failed for '{lesson_id}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=True, idempotentHint=True, openWorldHint=False)
)
async def delete_lesson(ctx: Context, lesson_id: str) -> bool:
    """Permanently delete a lesson by ID.

    Returns True if the lesson was found and deleted, False if not found.
    """
    try:
        with db.connection() as conn:
            found = db.delete_lesson(conn, lesson_id)
        if not found:
            await ctx.warning(f"delete_lesson: lesson '{lesson_id}' not found")
        return found
    except Exception as exc:
        await ctx.error(f"delete_lesson failed for '{lesson_id}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def submit_feedback(
    ctx: Context, lesson_id: str, feedback: Literal["know", "dont_know", "clear"]
) -> bool:
    """Record user comprehension feedback for a lesson and update knowledge confidence.

    feedback: "know" (confidence +1) | "dont_know" (confidence -1)
              | "clear" (remove feedback only — confidence is NOT adjusted)
    Returns True on success, False if the lesson does not exist or an error occurred.
    Idempotent — submitting the same feedback twice adjusts confidence only once.
    """
    try:
        feedback_value = None if feedback == "clear" else feedback
        with db.connection() as conn:
            row = conn.execute(
                "SELECT feedback, topic_id FROM lessons WHERE id = ?", (lesson_id,)
            ).fetchone()
            if row is None:
                await ctx.warning(f"submit_feedback: lesson '{lesson_id}' not found")
                return False
            if row["feedback"] == feedback_value:
                await ctx.info(
                    f"submit_feedback: feedback already '{feedback_value}' on '{lesson_id}' — no change"
                )
                return True
            db.set_feedback(conn, lesson_id, feedback_value)
            if feedback_value in ("know", "dont_know") and row["topic_id"]:
                delta = 1 if feedback_value == "know" else -1
                coach.apply_knowledge_delta(conn, row["topic_id"], delta)
        return True
    except Exception as exc:
        await ctx.error(f"submit_feedback failed for '{lesson_id}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def add_topic(
    ctx: Context, topic: str, confidence: int = 5, group: str | None = None
) -> bool:
    """Add a new topic to the knowledge map, or update confidence if it already exists.

    topic: topic identifier, e.g. 'rust_lifetimes'
    confidence: initial confidence score 0-10 (default 5)
    group: optional group name; topic appears under 'Other' if omitted
    Returns True on success, False on error.
    Idempotent — calling with the same topic updates the confidence.
    """
    try:
        with db.connection() as conn:
            db.upsert_knowledge(conn, topic, confidence)
            if group and group != "Other":
                db.assign_topic_to_group(conn, topic, group)
        return True
    except Exception as exc:
        await ctx.error(f"add_topic failed for '{topic}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=True, idempotentHint=True, openWorldHint=False)
)
async def remove_topic(ctx: Context, topic: str) -> bool:
    """Remove a topic from the knowledge map entirely.

    Returns True if the topic existed and was removed, False if not found.
    """
    try:
        with db.connection() as conn:
            found = db.delete_knowledge(conn, topic)
        if not found:
            await ctx.warning(f"remove_topic: topic '{topic}' not found")
        return found
    except Exception as exc:
        await ctx.error(f"remove_topic failed for '{topic}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
async def add_group(ctx: Context, name: str) -> bool:
    """Create a new (initially empty) knowledge group.

    name: group name, e.g. 'Machine Learning'
    Note: add_topic(group=name) also auto-creates the group when assigning a topic.
    Returns True whether newly created or already existing (idempotent).
    Returns False on error.
    """
    try:
        name = name.strip()
        with db.connection() as conn:
            created = db.add_group(conn, name)
        if not created:
            await ctx.info(f"add_group: group '{name}' already exists")
        return True
    except Exception as exc:
        await ctx.error(f"add_group failed for '{name}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=True, idempotentHint=True, openWorldHint=False)
)
async def remove_group(ctx: Context, name: str) -> bool:
    """Delete a knowledge group. Topics in the group move to Other.

    Returns True if the group existed and was deleted, False if not found.
    """
    try:
        with db.connection() as conn:
            found = db.delete_group(conn, name)
        if not found:
            await ctx.warning(f"remove_group: group '{name}' not found")
        return found
    except Exception as exc:
        await ctx.error(f"remove_group failed for '{name}': {exc}")
        return False


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=True, openWorldHint=False)
)
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


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=False, idempotentHint=False, openWorldHint=True)
)
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


@mcp.tool(
    annotations=ToolAnnotations(destructiveHint=True, idempotentHint=False, openWorldHint=False)
)
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


@mcp.resource("devcoach://profile", mime_type="application/json")
def profile_resource() -> dict:
    """Current knowledge map — topics, confidence scores, and groups."""
    try:
        with db.connection() as conn:
            return coach.get_profile(conn).model_dump()
    except Exception as exc:
        return {"error": str(exc)}


@mcp.resource("devcoach://settings", mime_type="application/json")
def settings_resource() -> dict:
    """Current coaching settings (rate limits)."""
    try:
        with db.connection() as conn:
            return db.get_settings(conn).model_dump()
    except Exception as exc:
        return {"error": str(exc)}


@mcp.resource("devcoach://lessons/recent", mime_type="application/json")
def recent_lessons_resource() -> list[dict]:
    """Last 10 lessons from the current week."""
    try:
        with db.connection() as conn:
            lessons = db.get_lessons(conn, period="week")
        return [lesson.model_dump(mode="json") for lesson in lessons[:10]]
    except Exception as exc:
        return [{"error": str(exc)}]


@mcp.resource("devcoach://stats", mime_type="application/json")
def stats_resource() -> dict:
    """Aggregate coaching statistics: lesson counts, rate-limit state, weakest/strongest topics."""
    try:
        with db.connection() as conn:
            return coach.get_stats(conn)
    except Exception as exc:
        return {"error": str(exc)}


@mcp.resource("devcoach://taught-topics", mime_type="application/json")
def taught_topics_resource() -> list[str]:
    """All topic_ids that have already been taught.

    Read this before selecting a new lesson topic to avoid repetition.
    """
    try:
        with db.connection() as conn:
            return coach.list_taught_topics(conn)
    except Exception:
        return []


@mcp.resource("devcoach://rate-limit", mime_type="application/json")
def rate_limit_resource() -> dict:
    """Current rate-limit status and running lesson total.

    allowed: whether a lesson may be delivered now.
    reason: why delivery is blocked (omitted when allowed is true).
    total_lessons: total lessons delivered across all sessions — used by the
      skill to trigger dynamic calibration every 10 lessons.
    """
    try:
        with db.connection() as conn:
            result = coach.check_rate_limit(conn)
            total = conn.execute("SELECT COUNT(*) FROM lessons").fetchone()[0]
        return {**result.model_dump(exclude_none=True), "total_lessons": total}
    except Exception as exc:
        return {"allowed": False, "reason": f"Rate limit check unavailable: {exc}"}


@mcp.resource("devcoach://context", mime_type="application/json")
def context_resource() -> dict:
    """Current workspace git context and most-used lesson metadata defaults.

    git: auto-detected from cwd (branch, commit, repository, platform, folder).
    usage_defaults: most-frequently used values from past lessons — used as
      fallback when git detection finds nothing.
    """
    try:
        git = detect_git_context()
        with db.connection() as conn:
            usage = db.get_usage_defaults(conn)
        return {"git": git, "usage_defaults": usage}
    except Exception as exc:
        return {"error": str(exc)}


@mcp.resource("devcoach://onboarding", mime_type="application/json")
def onboarding_resource() -> dict:
    """Onboarding status, auto-detected stack, and project topic defaults.

    knowledge_ready: true if the knowledge table has at least one saved topic.
    notebook_ready: true if ~/.devcoach/learning-state.md exists and is non-empty.
    needs_onboarding: true if either component is missing (convenience alias).
    detected_stack: {topic_id: confidence} inferred from project files in cwd.
    default_topics: {topic_id: confidence} project-level defaults — shown to the
      user alongside detected_stack so they can build a richer initial profile.
    context_ready: true if a git branch was successfully detected in cwd.
    """
    try:
        with db.connection() as conn:
            status = db.is_onboarding_complete(conn)
        knowledge_ready = status["knowledge_ready"]
        notebook_ready = NOTEBOOK_PATH.exists() and NOTEBOOK_PATH.stat().st_size > 0
        git = detect_git_context()
        detected = detect_stack(git["folder"] or str(Path.cwd()))
        return {
            "knowledge_ready": knowledge_ready,
            "notebook_ready": notebook_ready,
            "needs_onboarding": not (knowledge_ready and notebook_ready),
            "detected_stack": detected,
            "default_topics": DEFAULT_PROFILE,
            "context_ready": git["branch"] is not None,
        }
    except Exception as exc:
        return {"error": str(exc)}


@mcp.resource("devcoach://lessons/{lesson_id}", mime_type="application/json")
def lesson_resource(lesson_id: str) -> dict:
    """A single lesson by ID."""
    try:
        with db.connection() as conn:
            lesson = db.get_lesson_by_id(conn, lesson_id)
        if lesson is None:
            return {"error": f"Lesson '{lesson_id}' not found"}
        return lesson.model_dump(mode="json")
    except Exception as exc:
        return {"error": str(exc)}


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
