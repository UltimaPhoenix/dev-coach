"""CLI subcommands for devcoach — rendered with rich."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console
from rich.table import Table
from rich import box

from devcoach.core import coach, db

console = Console()


# ── Helpers ────────────────────────────────────────────────────────────────

def _confidence_bar(confidence: int) -> str:
    filled = round(confidence * 10 / 10)
    return "█" * filled + "░" * (10 - filled)


# ── Subcommand handlers ────────────────────────────────────────────────────

def cmd_profile(_args: argparse.Namespace) -> None:
    with db.connection() as conn:
        profile = coach.get_profile(conn)

    topic_group = {t: g.name for g in profile.groups for t in g.topics}

    table = Table(title="Knowledge Map", box=box.ROUNDED, show_lines=False)
    table.add_column("Topic", style="cyan", no_wrap=True)
    table.add_column("Group", style="dim", no_wrap=True)
    table.add_column("Confidence", justify="right")
    table.add_column("Bar", no_wrap=True)

    for entry in sorted(profile.knowledge, key=lambda e: -e.confidence):
        bar = _confidence_bar(entry.confidence)
        color = "green" if entry.confidence >= 7 else "yellow" if entry.confidence >= 4 else "red"
        group = topic_group.get(entry.topic, "Other")
        table.add_row(entry.topic, group, f"[{color}]{entry.confidence}/10[/{color}]", f"[{color}]{bar}[/{color}]")

    console.print(table)


def cmd_lessons(args: argparse.Namespace) -> None:
    starred_filter = True if getattr(args, "starred", False) else None
    feedback_filter = getattr(args, "feedback", None) or None
    date_from = getattr(args, "date_from", None) or None
    date_to = getattr(args, "date_to", None) or None
    level_filter = getattr(args, "level", None) or None
    sort_col = getattr(args, "sort", "timestamp") or "timestamp"
    sort_order = getattr(args, "order", "desc") or "desc"

    with db.connection() as conn:
        lessons = db.get_lessons(
            conn,
            period=args.period if args.period != "all" else None,
            category=args.category or None,
            level=level_filter,
            project=args.project or None,
            repository=args.repository or None,
            branch=args.branch or None,
            commit=args.commit or None,
            starred=starred_filter,
            feedback=feedback_filter,
            date_from=date_from,
            date_to=date_to,
            sort=sort_col,
            order=sort_order,
        )

    if not lessons:
        console.print("[dim]No lessons found.[/dim]")
        return

    has_meta = any(l.project or l.branch or l.commit_hash for l in lessons)

    table = Table(title="Lessons", box=box.ROUNDED, show_lines=False)
    table.add_column("", no_wrap=True, width=2)
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
            lesson.timestamp_iso[:10],
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
    with db.connection() as conn:
        lesson = db.get_lesson_by_id(conn, args.id)
        if lesson is None:
            console.print(f"[red]Lesson '{args.id}' not found.[/red]")
            sys.exit(1)
        new_state = db.toggle_star(conn, args.id)
    state_label = "[yellow]★ starred[/yellow]" if new_state else "[dim]☆ unstarred[/dim]"
    console.print(f"Lesson [cyan]{args.id}[/cyan] → {state_label}")


def cmd_feedback(args: argparse.Namespace) -> None:
    valid = {"know", "dont_know", "clear"}
    if args.feedback not in valid:
        console.print(f"[red]Invalid feedback '{args.feedback}'. Use: know | dont_know | clear[/red]")
        sys.exit(1)

    feedback_value = None if args.feedback == "clear" else args.feedback
    with db.connection() as conn:
        topic_id = coach.record_feedback(conn, args.id, feedback_value)
        if topic_id is None:
            console.print(f"[red]Lesson '{args.id}' not found.[/red]")
            sys.exit(1)
        row = conn.execute(
            "SELECT confidence FROM knowledge WHERE topic = ?", (topic_id,)
        ).fetchone()
        new_conf = row[0] if row else 5

    if feedback_value in ("know", "dont_know"):
        old_conf = new_conf + (-1 if feedback_value == "know" else 1)
        conf_label = f"[cyan]{topic_id}[/cyan] confidence: {old_conf} → [bold]{new_conf}[/bold]"
    else:
        conf_label = "feedback cleared"

    icon = {"know": "[green]✓ I know this[/green]", "dont_know": "[red]✗ I don't know this[/red]"}.get(
        feedback_value or "", "[dim]cleared[/dim]"
    )
    console.print(f"Lesson [cyan]{args.id}[/cyan] → {icon}  ({conf_label})")


def cmd_lesson(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        lesson = db.get_lesson_by_id(conn, args.id)

    if lesson is None:
        console.print(f"[red]Lesson '{args.id}' not found.[/red]")
        sys.exit(1)

    level_color = {"junior": "green", "mid": "yellow", "senior": "red"}.get(lesson.level, "white")

    console.rule(f"[bold]{lesson.title}[/bold]")
    console.print(f"[dim]ID:[/dim]         {lesson.id}")
    console.print(f"[dim]Date:[/dim]        {lesson.timestamp_iso[:19].replace('T', ' ')}")
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
    with db.connection() as conn:
        settings = db.get_settings(conn)

    gap_h, gap_m = divmod(settings.min_gap_minutes, 60)
    gap_label = f"{gap_h}h {gap_m}m" if gap_h else f"{gap_m}m"

    table = Table(title="Settings", box=box.ROUNDED)
    table.add_column("Key", style="cyan")
    table.add_column("Value", justify="right")
    table.add_row("max_per_day", str(settings.max_per_day))
    table.add_row("min_gap_minutes", f"{settings.min_gap_minutes} ({gap_label})")
    console.print(table)


def cmd_stats(_args: argparse.Namespace) -> None:
    with db.connection() as conn:
        stats = coach.get_stats(conn)
        rate_limit = coach.check_rate_limit(conn)
        settings = db.get_settings(conn)

    table = Table(title="Coaching Stats", box=box.ROUNDED, show_header=False)
    table.add_column("Metric", style="dim")
    table.add_column("Value", justify="right")
    table.add_row("Total lessons", str(stats.get("total_lessons", 0)))
    table.add_row("Lessons today (24h)", f"{stats.get('lessons_today', 0)} / {settings.max_per_day}")
    table.add_row("Lessons this week", str(stats.get("lessons_this_week", 0)))
    rl_label = "[green]Available now[/green]" if rate_limit.allowed else f"[yellow]{rate_limit.reason}[/yellow]"
    table.add_row("Next lesson", rl_label)
    console.print(table)

    weakest = stats.get("weakest_topics", [])
    strongest = stats.get("strongest_topics", [])

    if weakest or strongest:
        side = Table(box=box.SIMPLE, show_header=True, padding=(0, 1))
        side.add_column("Weakest topics", style="red", no_wrap=True)
        side.add_column("  ")
        side.add_column("Strongest topics", style="green", no_wrap=True)
        for i in range(max(len(weakest), len(strongest))):
            w = weakest[i] if i < len(weakest) else None
            s = strongest[i] if i < len(strongest) else None
            w_cell = f"{w['topic']} [dim]({w['confidence']})[/dim]" if w else ""
            s_cell = f"{s['topic']} [dim]({s['confidence']})[/dim]" if s else ""
            side.add_row(w_cell, "", s_cell)
        console.print(side)


def cmd_set(args: argparse.Namespace) -> None:
    valid_keys = {"max_per_day", "min_gap_minutes"}
    if args.key not in valid_keys:
        console.print(f"[red]Unknown key '{args.key}'. Valid keys: {', '.join(sorted(valid_keys))}[/red]")
        sys.exit(1)

    with db.connection() as conn:
        db.set_setting(conn, args.key, args.value)
    console.print(f"[green]Set {args.key} = {args.value}[/green]")


def cmd_knowledge_add(args: argparse.Namespace) -> None:
    topic = args.topic.strip()
    if not topic:
        console.print("[red]Topic name must not be empty.[/red]")
        sys.exit(1)
    with db.connection() as conn:
        db.upsert_knowledge(conn, topic, args.confidence)
        if args.group and args.group != "Other":
            db.assign_topic_to_group(conn, topic, args.group)
    group_label = f" → [cyan]{args.group}[/cyan]" if args.group and args.group != "Other" else ""
    console.print(f"[green]Added[/green] [bold]{topic}[/bold] (confidence [cyan]{args.confidence}[/cyan]){group_label}")


def cmd_knowledge_remove(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        removed = db.delete_knowledge(conn, args.topic)
    if removed:
        console.print(f"[green]Removed[/green] [bold]{args.topic}[/bold] from knowledge map")
    else:
        console.print(f"[yellow]Topic '{args.topic}' not found.[/yellow]")


def cmd_group_add(args: argparse.Namespace) -> None:
    group_name = args.name.strip()
    if not group_name or group_name == "Other":
        console.print("[red]Invalid group name.[/red]")
        sys.exit(1)
    with db.connection() as conn:
        db.add_group(conn, group_name)
    console.print(f"[green]Group '[cyan]{group_name}[/cyan]' ready.[/green] Assign topics with: devcoach group-assign <topic> \"{group_name}\"")


def cmd_group_remove(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        count = db.delete_group(conn, args.name)
    if count:
        console.print(f"[green]Removed group '[cyan]{args.name}[/cyan]'[/green] ({count} topic assignment(s) cleared)")
    else:
        console.print(f"[yellow]Group '{args.name}' not found or already empty.[/yellow]")


def cmd_group_assign(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        row = conn.execute(
            "SELECT topic FROM knowledge WHERE topic = ?", (args.topic,)
        ).fetchone()
        if row is None:
            console.print(f"[red]Topic '{args.topic}' not in knowledge map. Add it first.[/red]")
            sys.exit(1)
        if args.group == "Other":
            db.unassign_topic_from_group(conn, args.topic)
            console.print(f"[green]Moved[/green] [bold]{args.topic}[/bold] → Other (ungrouped)")
        else:
            db.assign_topic_to_group(conn, args.topic, args.group)
            console.print(f"[green]Moved[/green] [bold]{args.topic}[/bold] → [cyan]{args.group}[/cyan]")


def cmd_backup(args: argparse.Namespace) -> None:
    """Export settings + knowledge map + lessons as a zip file."""
    with db.connection() as conn:
        lessons_count = len(db.export_lessons(conn))
        knowledge_count = conn.execute("SELECT COUNT(*) FROM knowledge").fetchone()[0]
        data = db.create_backup_zip(conn)

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

    with db.connection() as conn:
        result = db.restore_backup_zip(conn, in_path.read_bytes())

    if result["settings"]:
        console.print("[green]✓[/green] Settings restored")
    if result["topics"]:
        console.print(f"[green]✓[/green] Knowledge map restored ([cyan]{result['topics']}[/cyan] topics)")
    parts = [f"[cyan]{result['lessons']}[/cyan] imported"]
    if result["skipped"]:
        parts.append(f"[yellow]{result['skipped']}[/yellow] duplicates skipped")
    if result["invalid"]:
        parts.append(f"[red]{result['invalid']}[/red] rejected (invalid)")
    console.print(f"[green]✓[/green] Lessons: {', '.join(parts)}")


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
    p_lessons.add_argument("--level", choices=["junior", "mid", "senior"], default=None,
                           help="Filter by difficulty level")
    p_lessons.add_argument("--date-from", dest="date_from", default=None,
                           metavar="YYYY-MM-DD", help="Show lessons on or after this date")
    p_lessons.add_argument("--date-to", dest="date_to", default=None,
                           metavar="YYYY-MM-DD", help="Show lessons on or before this date")
    p_lessons.add_argument("--sort", default="timestamp",
                           choices=["timestamp", "level", "topic_id", "title", "feedback"],
                           help="Sort column (default: timestamp)")
    p_lessons.add_argument("--order", default="desc", choices=["asc", "desc"],
                           help="Sort order (default: desc)")

    p_lesson = sub.add_parser("lesson", help="Show a single lesson in detail")
    p_lesson.add_argument("id", help="Lesson ID")

    p_star = sub.add_parser("star", help="Toggle starred flag on a lesson")
    p_star.add_argument("id", help="Lesson ID")

    p_feedback = sub.add_parser("feedback", help="Record know/dont_know feedback for a lesson")
    p_feedback.add_argument("id", help="Lesson ID")
    p_feedback.add_argument("feedback", choices=["know", "dont_know", "clear"], help="Feedback value")

    sub.add_parser("settings", help="Show current settings")
    sub.add_parser("stats", help="Show coaching statistics and rate-limit status")

    p_set = sub.add_parser("set", help="Update a setting")
    p_set.add_argument("key", help="Setting key (max_per_day | min_gap_minutes)")
    p_set.add_argument("value", help="New value")

    p_backup = sub.add_parser("backup", help="Export a full backup (settings + knowledge + lessons) as zip")
    p_backup.add_argument("output", nargs="?", default="devcoach-backup.zip",
                          help="Output zip file path (default: devcoach-backup.zip)")

    p_restore = sub.add_parser("restore", help="Restore from a backup zip file")
    p_restore.add_argument("input", help="Path to backup zip file")

    p_kadd = sub.add_parser("knowledge-add", help="Add or update a topic in the knowledge map")
    p_kadd.add_argument("topic", help="Topic ID (e.g. rust_lifetimes)")
    p_kadd.add_argument("--confidence", type=int, default=5, metavar="N",
                        help="Initial confidence 0-10 (default: 5)")
    p_kadd.add_argument("--group", default=None, metavar="GROUP",
                        help="Assign to a named group (optional)")

    p_kremove = sub.add_parser("knowledge-remove", help="Remove a topic from the knowledge map")
    p_kremove.add_argument("topic", help="Topic ID to remove")

    p_gadd = sub.add_parser("group-add", help="Register a new knowledge group")
    p_gadd.add_argument("name", help="Group name (e.g. 'Machine Learning')")

    p_gremove = sub.add_parser("group-remove", help="Delete a knowledge group (topics move to Other)")
    p_gremove.add_argument("name", help="Group name to delete")

    p_gassign = sub.add_parser("group-assign", help="Move a topic to a group")
    p_gassign.add_argument("topic", help="Topic ID")
    p_gassign.add_argument("group", help="Group name (use 'Other' to ungroup)")

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
        "stats": cmd_stats,
        "set": cmd_set,
        "backup": cmd_backup,
        "restore": cmd_restore,
        "knowledge-add": cmd_knowledge_add,
        "knowledge-remove": cmd_knowledge_remove,
        "group-add": cmd_group_add,
        "group-remove": cmd_group_remove,
        "group-assign": cmd_group_assign,
        "ui": cmd_ui,
    }

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    dispatch[args.command](args)
