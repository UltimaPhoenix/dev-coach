"""CLI subcommands for devcoach — rendered with rich."""

from __future__ import annotations

import argparse
import json
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


_CLAUDE_CODE_CONFIG = Path.home() / ".claude.json"
_CLAUDE_DESKTOP_CONFIG = (
    Path.home() / "Library" / "Application Support" / "Claude" / "claude_desktop_config.json"
)
_CLAUDE_CODE_ENTRY: dict = {
    "type": "stdio",
    "command": "uvx",
    "args": ["devcoach"],
    "env": {},
}
_CLAUDE_DESKTOP_ENTRY: dict = {
    "command": "uvx",
    "args": ["devcoach"],
}


def _install_to(path: Path, entry: dict, force: bool) -> str:
    data: dict = json.loads(path.read_text()) if path.exists() else {}
    servers: dict = data.setdefault("mcpServers", {})
    if "devcoach" in servers and not force:
        return f"[yellow]Already registered[/yellow] in {path} (use --force to overwrite)"
    servers["devcoach"] = entry
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return f"[green]✓[/green] Installed into {path}"


def cmd_install(args: argparse.Namespace) -> None:
    do_code = args.claude_code or not args.claude_desktop
    do_desktop = args.claude_desktop or not args.claude_code

    if do_code:
        console.print(_install_to(_CLAUDE_CODE_CONFIG, _CLAUDE_CODE_ENTRY, args.force))
    if do_desktop:
        console.print(_install_to(_CLAUDE_DESKTOP_CONFIG, _CLAUDE_DESKTOP_ENTRY, args.force))

    if do_code or do_desktop:
        console.print("\n[dim]Restart Claude Code / Claude Desktop to pick up the new server.[/dim]")


def cmd_setup(_args: argparse.Namespace) -> None:
    """Interactive wizard: import backup OR auto/manual stack setup + group assignment."""
    import os
    from devcoach.core.detect import detect_stack
    from devcoach.core.git import detect_git_context

    def _prompt(msg: str, default: str = "") -> str:
        suffix = f" [{default}]" if default else ""
        try:
            val = input(f"{msg}{suffix}: ").strip()
        except (EOFError, KeyboardInterrupt):
            console.print("\n[dim]Setup cancelled.[/dim]")
            sys.exit(0)
        return val if val else default

    def _prompt_int(msg: str, default: int, lo: int, hi: int) -> int:
        while True:
            raw = _prompt(msg, str(default))
            try:
                v = int(raw)
                if lo <= v <= hi:
                    return v
                console.print(f"[red]Must be {lo}–{hi}.[/red]")
            except ValueError:
                console.print("[red]Please enter a number.[/red]")

    console.rule("[bold cyan]devcoach setup[/bold cyan]")

    # ── Step 1: import? ───────────────────────────────────────────────────
    console.print("\n[bold]Step 1[/bold] — Restore from backup")
    backup_path = _prompt("Path to existing backup zip (Enter to skip)", "")
    if backup_path:
        p = Path(backup_path)
        if not p.exists():
            console.print(f"[red]File not found: {p}[/red]")
            sys.exit(1)
        with db.connection() as conn:
            result = db.restore_backup_zip(conn, p.read_bytes())
            db.set_setting(conn, "onboarding_completed", "1")
        console.print(f"[green]✓[/green] Restored: {result['topics']} topics, {result['lessons']} lessons")
        console.print("[green]Setup complete![/green]")
        return

    # ── Step 2: auto or manual ────────────────────────────────────────────
    console.print("\n[bold]Step 2[/bold] — Build your knowledge profile")
    mode = _prompt("Mode: [a]utomatic (detect from files) / [m]anual (type your stack)", "a").lower()

    topics: dict[str, int] = {}

    if mode.startswith("a"):
        git_ctx = detect_git_context()
        cwd = git_ctx.get("folder") or os.getcwd()
        detected = detect_stack(cwd)

        if detected:
            console.print(f"\n[dim]Detected from [cyan]{cwd}[/cyan]:[/dim]")
            table = Table(box=box.SIMPLE, show_header=True, padding=(0, 1))
            table.add_column("Topic", style="cyan", no_wrap=True)
            table.add_column("Confidence", justify="right")
            console.print(table)

            for topic, default_conf in sorted(detected.items()):
                raw = _prompt(
                    f"  [cyan]{topic}[/cyan] (Enter=keep, 0-10=override, s=skip)",
                    str(default_conf),
                )
                if raw.lower() == "s":
                    continue
                try:
                    topics[topic] = max(0, min(10, int(raw)))
                except ValueError:
                    topics[topic] = default_conf
        else:
            console.print("[dim]No technology files detected in current directory.[/dim]")

        console.print("\n[dim]Add any additional topics:[/dim]")
        extra = _prompt("Comma-separated topic names (or Enter to skip)", "")
        if extra:
            for t in [x.strip() for x in extra.split(",") if x.strip()]:
                conf = _prompt_int(f"  Confidence for [cyan]{t}[/cyan]", 5, 0, 10)
                topics[t] = conf

    else:
        # Manual
        console.print(
            "\n[dim]Enter topics one by one. Format: topic_id confidence "
            "(e.g. [cyan]python 7[/cyan]). Blank line when done.[/dim]"
        )
        while True:
            entry = _prompt("Topic (Enter when done)", "").strip()
            if not entry:
                break
            parts = entry.split()
            t = parts[0]
            try:
                c = max(0, min(10, int(parts[1]))) if len(parts) > 1 else 5
            except ValueError:
                c = 5
            topics[t] = c
            console.print(f"  [green]+[/green] [cyan]{t}[/cyan] → {c}")

    if not topics:
        console.print("[yellow]No topics selected — profile will be empty.[/yellow]")

    # ── Step 3: group assignment ──────────────────────────────────────────
    groups: dict[str, list[str]] = {}
    if topics:
        console.print("\n[bold]Step 3[/bold] — Organise into groups")
        do_groups = _prompt("Would you like to organise topics into groups? [y/N]", "n").lower()
        if do_groups.startswith("y"):
            existing_groups: list[str] = []
            for t in sorted(topics):
                suggestion = ", ".join(existing_groups) if existing_groups else "(none yet)"
                g = _prompt(
                    f"  Group for [cyan]{t}[/cyan]  existing: [dim]{suggestion}[/dim]  (Enter=Other)",
                    "",
                )
                if g and g != "Other":
                    groups.setdefault(g, []).append(t)
                    if g not in existing_groups:
                        existing_groups.append(g)

    # ── Step 4: settings ─────────────────────────────────────────────────
    console.print("\n[bold]Step 4[/bold] — Rate-limit settings")
    max_per_day = _prompt_int("Max lessons per day", 2, 1, 20)
    min_gap = _prompt_int("Min gap between lessons (minutes)", 240, 0, 1440)

    # ── Finish ────────────────────────────────────────────────────────────
    with db.connection() as conn:
        conn.execute("DELETE FROM knowledge")
        conn.execute("DELETE FROM knowledge_groups")
        conn.execute("DELETE FROM knowledge_group_names")
        conn.commit()
        for topic, confidence in topics.items():
            db.upsert_knowledge(conn, topic, confidence)
        for group_name, group_topics in groups.items():
            for t in group_topics:
                db.assign_topic_to_group(conn, t, group_name)
        db.set_setting(conn, "max_per_day", str(max_per_day))
        db.set_setting(conn, "min_gap_minutes", str(min_gap))
        db.set_setting(conn, "onboarding_completed", "1")
        profile = coach.get_profile(conn)

    topic_group = {t: g.name for g in profile.groups for t in g.topics}
    final_table = Table(title="Knowledge Profile", box=box.ROUNDED, show_lines=False)
    final_table.add_column("Topic", style="cyan", no_wrap=True)
    final_table.add_column("Group", style="dim")
    final_table.add_column("Confidence", justify="right")
    final_table.add_column("Bar", no_wrap=True)
    for entry in sorted(profile.knowledge, key=lambda e: -e.confidence):
        bar = _confidence_bar(entry.confidence)
        color = "green" if entry.confidence >= 7 else "yellow" if entry.confidence >= 4 else "red"
        group_name = topic_group.get(entry.topic, "Other")
        final_table.add_row(
            entry.topic, group_name,
            f"[{color}]{entry.confidence}/10[/{color}]",
            f"[{color}]{bar}[/{color}]",
        )
    console.print(final_table)
    console.print(f"\n[green]Setup complete![/green] {len(topics)} topics saved.")


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
                           metavar="YYYY-MM-DD[THH:MM]",
                           help="Show lessons on or after this date/time (e.g. 2026-04-25 or 2026-04-25T14:30)")
    p_lessons.add_argument("--date-to", dest="date_to", default=None,
                           metavar="YYYY-MM-DD[THH:MM]",
                           help="Show lessons on or before this date/time; defaults to end-of-day if no time given")
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

    p_install = sub.add_parser(
        "install",
        help="Register devcoach MCP server in Claude Code and/or Claude Desktop config",
    )
    p_install.add_argument("--claude-code", dest="claude_code", action="store_true",
                           help="Install into Claude Code only (~/.claude.json)")
    p_install.add_argument("--claude-desktop", dest="claude_desktop", action="store_true",
                           help="Install into Claude Desktop only")
    p_install.add_argument("--force", action="store_true",
                           help="Overwrite existing devcoach entry")

    p_ui = sub.add_parser("ui", help="Launch the web dashboard")
    p_ui.add_argument("--port", type=int, default=7860, help="Port (default: 7860)")

    sub.add_parser(
        "setup",
        help="Interactive first-run wizard: import backup or build knowledge profile",
    )

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
        "install": cmd_install,
        "ui": cmd_ui,
        "setup": cmd_setup,
    }

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    dispatch[args.command](args)
