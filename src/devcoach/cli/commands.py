"""CLI subcommands for devcoach — rendered with rich."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich import box

from devcoach.core import coach, db
from devcoach.core.db import get_initialized_connection

console = Console()


# ── Helpers ────────────────────────────────────────────────────────────────

def _confidence_bar(confidence: int) -> str:
    filled = round(confidence * 10 / 10)
    return "█" * filled + "░" * (10 - filled)


# ── Subcommand handlers ────────────────────────────────────────────────────

def cmd_profile(_args: argparse.Namespace) -> None:
    conn = get_initialized_connection()
    knowledge = db.get_all_knowledge(conn)
    conn.close()

    table = Table(title="Knowledge Map", box=box.ROUNDED, show_lines=False)
    table.add_column("Topic", style="cyan", no_wrap=True)
    table.add_column("Confidence", justify="right")
    table.add_column("Bar", no_wrap=True)

    for topic, confidence in sorted(knowledge.items(), key=lambda x: -x[1]):
        bar = _confidence_bar(confidence)
        color = "green" if confidence >= 7 else "yellow" if confidence >= 4 else "red"
        table.add_row(topic, f"[{color}]{confidence}/10[/{color}]", f"[{color}]{bar}[/{color}]")

    console.print(table)


def cmd_lessons(args: argparse.Namespace) -> None:
    conn = get_initialized_connection()
    starred_filter = True if getattr(args, "starred", False) else None
    feedback_filter = getattr(args, "feedback", None) or None
    date_from = getattr(args, "date_from", None) or None
    date_to = getattr(args, "date_to", None) or None
    lessons = db.get_lessons(
        conn,
        period=args.period if args.period != "all" else None,
        category=args.category or None,
        project=args.project or None,
        repository=args.repository or None,
        branch=args.branch or None,
        commit=args.commit or None,
        starred=starred_filter,
        feedback=feedback_filter,
        date_from=date_from,
        date_to=date_to,
    )
    conn.close()

    if not lessons:
        console.print("[dim]No lessons found.[/dim]")
        return

    has_meta = any(l.project or l.branch or l.commit_hash for l in lessons)

    table = Table(title="Lessons", box=box.ROUNDED, show_lines=False)
    table.add_column("", no_wrap=True, width=2)  # star column
    table.add_column("Date", no_wrap=True)
    table.add_column("Topic", style="cyan")
    table.add_column("Title")
    table.add_column("Level", justify="center")
    table.add_column("Categories")
    if has_meta:
        table.add_column("Project", style="dim")
        table.add_column("Branch", style="magenta")
        table.add_column("Commit", style="cyan", no_wrap=True)

    for lesson in lessons:
        level_color = {"junior": "green", "mid": "yellow", "senior": "red"}.get(lesson.level, "white")
        feedback_icon = " [green]✓[/green]" if lesson.feedback == "know" else (" [red]✗[/red]" if lesson.feedback == "dont_know" else "")
        row = [
            "[yellow]★[/yellow]" if lesson.starred else "[dim]·[/dim]",
            lesson.timestamp[:10],
            lesson.topic_id,
            lesson.title + feedback_icon,
            f"[{level_color}]{lesson.level}[/{level_color}]",
            ", ".join(lesson.categories),
        ]
        if has_meta:
            row += [
                lesson.project or "",
                lesson.branch or "",
                lesson.commit_hash[:7] if lesson.commit_hash else "",
            ]
        table.add_row(*row)

    console.print(table)


def cmd_star(args: argparse.Namespace) -> None:
    conn = get_initialized_connection()
    lesson = db.get_lesson_by_id(conn, args.id)
    if lesson is None:
        console.print(f"[red]Lesson '{args.id}' not found.[/red]")
        conn.close()
        sys.exit(1)
    new_state = db.toggle_star(conn, args.id)
    conn.close()
    state_label = "[yellow]★ starred[/yellow]" if new_state else "[dim]☆ unstarred[/dim]"
    console.print(f"Lesson [cyan]{args.id}[/cyan] → {state_label}")


def cmd_feedback(args: argparse.Namespace) -> None:
    valid = {"know", "dont_know", "clear"}
    if args.feedback not in valid:
        console.print(f"[red]Invalid feedback '{args.feedback}'. Use: know | dont_know | clear[/red]")
        sys.exit(1)

    conn = get_initialized_connection()
    feedback_value = None if args.feedback == "clear" else args.feedback
    topic_id = coach.record_feedback(conn, args.id, feedback_value)
    if topic_id is None:
        console.print(f"[red]Lesson '{args.id}' not found.[/red]")
        conn.close()
        sys.exit(1)

    if feedback_value in ("know", "dont_know"):
        knowledge = db.get_all_knowledge(conn)
        new_conf = knowledge.get(topic_id, 5)
        old_conf = new_conf + (-1 if feedback_value == "know" else 1)
        conf_label = f"[cyan]{topic_id}[/cyan] confidence: {old_conf} → [bold]{new_conf}[/bold]"
    else:
        conf_label = "feedback cleared"

    conn.close()
    icon = {"know": "[green]✓ I know this[/green]", "dont_know": "[red]✗ I don't know this[/red]"}.get(
        feedback_value or "", "[dim]cleared[/dim]"
    )
    console.print(f"Lesson [cyan]{args.id}[/cyan] → {icon}  ({conf_label})")


def cmd_lesson(args: argparse.Namespace) -> None:
    conn = get_initialized_connection()
    lesson = db.get_lesson_by_id(conn, args.id)
    conn.close()

    if lesson is None:
        console.print(f"[red]Lesson '{args.id}' not found.[/red]")
        sys.exit(1)

    level_color = {"junior": "green", "mid": "yellow", "senior": "red"}.get(lesson.level, "white")

    console.rule(f"[bold]{lesson.title}[/bold]")
    console.print(f"[dim]ID:[/dim]         {lesson.id}")
    console.print(f"[dim]Date:[/dim]        {lesson.timestamp[:19].replace('T', ' ')}")
    console.print(f"[dim]Topic:[/dim]       {lesson.topic_id}")
    console.print(f"[dim]Categories:[/dim]  {', '.join(lesson.categories)}")
    console.print(f"[dim]Level:[/dim]       [{level_color}]{lesson.level}[/{level_color}]")
    star_label = "[yellow]★ starred[/yellow]" if lesson.starred else "[dim]☆ not starred[/dim]"
    feedback_label = (
        "[green]✓ I know this[/green]" if lesson.feedback == "know"
        else "[red]✗ I don't know this[/red]" if lesson.feedback == "dont_know"
        else "[dim]no feedback[/dim]"
    )
    console.print(f"[dim]Star:[/dim]        {star_label}   [dim]Feedback:[/dim] {feedback_label}")
    if lesson.task_context:
        console.print(f"[dim]Context:[/dim]     {lesson.task_context}")
    if lesson.project or lesson.repository or lesson.branch or lesson.commit_hash or lesson.folder:
        meta_parts = []
        if lesson.project:
            meta_parts.append(f"project={lesson.project}")
        if lesson.repository:
            meta_parts.append(f"repo={lesson.repository}")
        if lesson.branch:
            meta_parts.append(f"branch=[magenta]{lesson.branch}[/magenta]")
        if lesson.commit_hash:
            meta_parts.append(f"commit=[cyan]{lesson.commit_hash[:7]}[/cyan]")
        if lesson.folder:
            meta_parts.append(f"folder={lesson.folder}")
        console.print(f"[dim]Git:[/dim]         {' · '.join(meta_parts)}")
    console.rule()
    console.print(lesson.summary)


def cmd_settings(_args: argparse.Namespace) -> None:
    conn = get_initialized_connection()
    settings = db.get_settings(conn)
    conn.close()

    gap_h, gap_m = divmod(settings.min_gap_minutes, 60)
    gap_label = f"{gap_h}h {gap_m}m" if gap_h else f"{gap_m}m"

    table = Table(title="Settings", box=box.ROUNDED)
    table.add_column("Key", style="cyan")
    table.add_column("Value", justify="right")

    table.add_row("max_per_day", str(settings.max_per_day))
    table.add_row("min_gap_minutes", f"{settings.min_gap_minutes} ({gap_label})")

    console.print(table)


def cmd_set(args: argparse.Namespace) -> None:
    valid_keys = {"max_per_day", "min_gap_minutes"}
    if args.key not in valid_keys:
        console.print(f"[red]Unknown key '{args.key}'. Valid keys: {', '.join(sorted(valid_keys))}[/red]")
        sys.exit(1)

    conn = get_initialized_connection()
    db.set_setting(conn, args.key, args.value)
    conn.close()
    console.print(f"[green]Set {args.key} = {args.value}[/green]")


def cmd_backup(args: argparse.Namespace) -> None:
    """Export settings + knowledge map + lessons as a zip file."""
    conn = get_initialized_connection()
    lessons_count = len(db.export_lessons(conn))
    knowledge_count = len(db.get_all_knowledge(conn))
    data = db.create_backup_zip(conn)
    conn.close()

    out_path = Path(args.output)
    out_path.write_bytes(data)

    console.print(f"[green]Backup saved:[/green] {out_path}  "
                  f"([cyan]{lessons_count}[/cyan] lessons, "
                  f"[cyan]{knowledge_count}[/cyan] topics)")


def cmd_restore(args: argparse.Namespace) -> None:
    """Restore settings + knowledge map + lessons from a backup zip file."""
    in_path = Path(args.input)
    if not in_path.exists():
        console.print(f"[red]File not found: {in_path}[/red]")
        sys.exit(1)

    conn = get_initialized_connection()
    result = db.restore_backup_zip(conn, in_path.read_bytes())
    conn.close()

    if result["settings"]:
        console.print("[green]✓[/green] Settings restored")
    if result["topics"]:
        console.print(f"[green]✓[/green] Knowledge map restored ([cyan]{result['topics']}[/cyan] topics)")
    console.print(f"[green]✓[/green] Lessons: [cyan]{result['lessons']}[/cyan] new imported (duplicates skipped)")


def cmd_ui(args: argparse.Namespace) -> None:
    import uvicorn
    from devcoach.web.app import app

    port = args.port
    console.print(f"[bold green]devcoach UI[/bold green] running at [link]http://localhost:{port}[/link]")
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


# ── Parser ─────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="devcoach",
        description="devcoach — progressive technical coaching",
    )
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("profile", help="Show the knowledge map")

    p_lessons = sub.add_parser("lessons", help="List past lessons")
    p_lessons.add_argument(
        "--period",
        choices=["today", "week", "month", "year", "all"],
        default="all",
        help="Filter by time period",
    )
    p_lessons.add_argument("--category", default=None, help="Filter by category tag")
    p_lessons.add_argument("--project", default=None, help="Filter by project name (fuzzy)")
    p_lessons.add_argument("--repository", default=None, help="Filter by repository (fuzzy)")
    p_lessons.add_argument("--branch", default=None, help="Filter by branch name (fuzzy)")
    p_lessons.add_argument("--commit", default=None, help="Filter by commit hash prefix (fuzzy)")
    p_lessons.add_argument("--starred", action="store_true", default=False, help="Show only starred lessons")
    p_lessons.add_argument("--feedback", choices=["know", "dont_know", "none"], default=None,
                           help="Filter by feedback: know, dont_know, none (no response)")
    p_lessons.add_argument("--date-from", dest="date_from", default=None,
                           metavar="YYYY-MM-DD", help="Show lessons on or after this date")
    p_lessons.add_argument("--date-to", dest="date_to", default=None,
                           metavar="YYYY-MM-DD", help="Show lessons on or before this date")

    p_lesson = sub.add_parser("lesson", help="Show a single lesson in detail")
    p_lesson.add_argument("id", help="Lesson ID")

    p_star = sub.add_parser("star", help="Toggle starred flag on a lesson")
    p_star.add_argument("id", help="Lesson ID")

    p_feedback = sub.add_parser("feedback", help="Record know/dont_know feedback for a lesson")
    p_feedback.add_argument("id", help="Lesson ID")
    p_feedback.add_argument("feedback", choices=["know", "dont_know", "clear"], help="Feedback value")

    sub.add_parser("settings", help="Show current settings")

    p_set = sub.add_parser("set", help="Update a setting")
    p_set.add_argument("key", help="Setting key (max_per_day | min_gap_minutes)")
    p_set.add_argument("value", help="New value")

    p_backup = sub.add_parser("backup", help="Export a full backup (settings + knowledge + lessons) as zip")
    p_backup.add_argument("output", nargs="?", default="devcoach-backup.zip",
                          help="Output zip file path (default: devcoach-backup.zip)")

    p_restore = sub.add_parser("restore", help="Restore from a backup zip file")
    p_restore.add_argument("input", help="Path to backup zip file")

    p_ui = sub.add_parser("ui", help="Launch the web dashboard")
    p_ui.add_argument("--port", type=int, default=7860, help="Port (default: 7860)")

    return parser


# ── Public entry point ─────────────────────────────────────────────────────

def run_cli() -> None:
    """Parse CLI arguments and dispatch to the appropriate subcommand."""
    parser = _build_parser()
    args = parser.parse_args()

    dispatch = {
        "profile": cmd_profile,
        "lessons": cmd_lessons,
        "lesson": cmd_lesson,
        "star": cmd_star,
        "feedback": cmd_feedback,
        "settings": cmd_settings,
        "set": cmd_set,
        "backup": cmd_backup,
        "restore": cmd_restore,
        "ui": cmd_ui,
    }

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    dispatch[args.command](args)
