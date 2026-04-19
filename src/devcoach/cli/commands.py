"""CLI subcommands for devcoach — rendered with rich."""

from __future__ import annotations

import argparse
import sys

from rich.console import Console
from rich.table import Table
from rich import box

from devcoach.core import db

console = Console()


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_conn():  # type: ignore[no-untyped-def]
    conn = db.get_connection()
    db.init_schema(conn)
    return conn


def _confidence_bar(confidence: int) -> str:
    filled = round(confidence * 10 / 10)
    return "█" * filled + "░" * (10 - filled)


# ── Subcommand handlers ────────────────────────────────────────────────────

def cmd_profile(_args: argparse.Namespace) -> None:
    conn = _get_conn()
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
    conn = _get_conn()
    lessons = db.get_lessons(
        conn,
        period=args.period if args.period != "all" else None,
        category=args.category,
    )
    conn.close()

    if not lessons:
        console.print("[dim]No lessons found.[/dim]")
        return

    table = Table(title="Lessons", box=box.ROUNDED, show_lines=False)
    table.add_column("ID", style="dim", no_wrap=True, max_width=12)
    table.add_column("Date", no_wrap=True)
    table.add_column("Topic", style="cyan")
    table.add_column("Title")
    table.add_column("Level", justify="center")
    table.add_column("Categories")

    for lesson in lessons:
        level_color = {"junior": "green", "mid": "yellow", "senior": "red"}.get(lesson.level, "white")
        table.add_row(
            lesson.id[:10] + "…" if len(lesson.id) > 10 else lesson.id,
            lesson.timestamp[:10],
            lesson.topic_id,
            lesson.title,
            f"[{level_color}]{lesson.level}[/{level_color}]",
            ", ".join(lesson.categories),
        )

    console.print(table)


def cmd_lesson(args: argparse.Namespace) -> None:
    conn = _get_conn()
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
    if lesson.task_context:
        console.print(f"[dim]Context:[/dim]     {lesson.task_context}")
    console.rule()
    console.print(lesson.summary)


def cmd_settings(_args: argparse.Namespace) -> None:
    conn = _get_conn()
    settings = db.get_settings(conn)
    conn.close()

    table = Table(title="Settings", box=box.ROUNDED)
    table.add_column("Key", style="cyan")
    table.add_column("Value", justify="right")

    table.add_row("max_per_day", str(settings.max_per_day))
    table.add_row("min_hours_between", str(settings.min_hours_between))

    console.print(table)


def cmd_set(args: argparse.Namespace) -> None:
    valid_keys = {"max_per_day", "min_hours_between"}
    if args.key not in valid_keys:
        console.print(f"[red]Unknown key '{args.key}'. Valid keys: {', '.join(sorted(valid_keys))}[/red]")
        sys.exit(1)

    conn = _get_conn()
    db.set_setting(conn, args.key, args.value)
    conn.close()
    console.print(f"[green]Set {args.key} = {args.value}[/green]")


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

    p_lesson = sub.add_parser("lesson", help="Show a single lesson in detail")
    p_lesson.add_argument("id", help="Lesson ID")

    sub.add_parser("settings", help="Show current settings")

    p_set = sub.add_parser("set", help="Update a setting")
    p_set.add_argument("key", help="Setting key (max_per_day | min_hours_between)")
    p_set.add_argument("value", help="New value")

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
        "settings": cmd_settings,
        "set": cmd_set,
        "ui": cmd_ui,
    }

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    dispatch[args.command](args)
