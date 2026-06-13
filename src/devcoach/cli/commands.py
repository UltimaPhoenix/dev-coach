"""CLI subcommands for devcoach — rendered with rich."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

import devcoach
from devcoach.core import coach, db

console = Console()


# ── Helpers ────────────────────────────────────────────────────────────────


def _confidence_bar(confidence: int) -> str:
    filled = round(confidence * 10 / 10)
    return "█" * filled + "░" * (10 - filled)


def _confidence_color(confidence: int) -> str:
    if confidence >= 7:
        return "green"
    if confidence >= 4:
        return "yellow"
    return "red"


def _feedback_icon(feedback: str | None) -> str:
    if feedback == "know":
        return " [green]✓[/green]"
    if feedback == "dont_know":
        return " [red]✗[/red]"
    return ""


def _feedback_label(feedback: str | None) -> str:
    if feedback == "know":
        return "[green]✓ I know this[/green]"
    if feedback == "dont_know":
        return "[red]✗ I don't know this[/red]"
    return "[dim]no feedback[/dim]"


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
        color = _confidence_color(entry.confidence)
        group = topic_group.get(entry.topic, "Other")
        table.add_row(
            entry.topic,
            group,
            f"[{color}]{entry.confidence}/10[/{color}]",
            f"[{color}]{bar}[/{color}]",
        )

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

    has_meta = any(lesson.project or lesson.branch or lesson.commit_hash for lesson in lessons)

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
        level_color = {"junior": "green", "mid": "yellow", "senior": "red"}.get(
            lesson.level, "white"
        )
        feedback_icon = _feedback_icon(lesson.feedback)
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
        if db.get_lesson_by_id(conn, args.id) is None:
            console.print(f"[red]Lesson '{args.id}' not found.[/red]")
            sys.exit(1)
        db.set_star(conn, args.id, True)
    console.print(f"Lesson [cyan]{args.id}[/cyan] → [yellow]★ starred[/yellow]")


def cmd_unstar(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        if db.get_lesson_by_id(conn, args.id) is None:
            console.print(f"[red]Lesson '{args.id}' not found.[/red]")
            sys.exit(1)
        db.set_star(conn, args.id, False)
    console.print(f"Lesson [cyan]{args.id}[/cyan] → [dim]☆ unstarred[/dim]")


def cmd_delete(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        found = db.delete_lesson(conn, args.id)
    if not found:
        console.print(f"[red]Lesson '{args.id}' not found.[/red]")
        sys.exit(1)
    console.print(f"Lesson [cyan]{args.id}[/cyan] deleted.")


def cmd_feedback(args: argparse.Namespace) -> None:
    valid = {"know", "dont_know", "clear"}
    if args.feedback not in valid:
        console.print(
            f"[red]Invalid feedback '{args.feedback}'. Use: know | dont_know | clear[/red]"
        )
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

    icon = {
        "know": "[green]✓ I know this[/green]",
        "dont_know": "[red]✗ I don't know this[/red]",
    }.get(feedback_value or "", "[dim]cleared[/dim]")
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
    feedback_label = _feedback_label(lesson.feedback)
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
    table.add_row(
        "Lessons today (24h)", f"{stats.get('lessons_today', 0)} / {settings.max_per_day}"
    )
    table.add_row("Lessons this week", str(stats.get("lessons_this_week", 0)))
    rl_label = (
        "[green]Available now[/green]"
        if rate_limit.allowed
        else f"[yellow]{rate_limit.reason}[/yellow]"
    )
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
        console.print(
            f"[red]Unknown key '{args.key}'. Valid keys: {', '.join(sorted(valid_keys))}[/red]"
        )
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
    console.print(
        f"[green]Added[/green] [bold]{topic}[/bold] (confidence [cyan]{args.confidence}[/cyan]){group_label}"
    )


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
    console.print(
        f"[green]Group '[cyan]{group_name}[/cyan]' ready.[/green] Assign topics with: devcoach group-assign <topic> \"{group_name}\""
    )


def cmd_group_remove(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        count = db.delete_group(conn, args.name)
    if count:
        console.print(f"[green]Removed group '[cyan]{args.name}[/cyan]'[/green]")
    else:
        console.print(f"[yellow]Group '{args.name}' not found.[/yellow]")


def cmd_group_assign(args: argparse.Namespace) -> None:
    with db.connection() as conn:
        row = conn.execute("SELECT topic FROM knowledge WHERE topic = ?", (args.topic,)).fetchone()
        if row is None:
            console.print(f"[red]Topic '{args.topic}' not in knowledge map. Add it first.[/red]")
            sys.exit(1)
        if args.group == "Other":
            db.unassign_topic_from_group(conn, args.topic)
            console.print(f"[green]Moved[/green] [bold]{args.topic}[/bold] → Other (ungrouped)")
        else:
            db.assign_topic_to_group(conn, args.topic, args.group)
            console.print(
                f"[green]Moved[/green] [bold]{args.topic}[/bold] → [cyan]{args.group}[/cyan]"
            )


def cmd_backup(args: argparse.Namespace) -> None:
    """Export settings + knowledge map + lessons as a zip file."""
    with db.connection() as conn:
        lessons_count = len(db.export_lessons(conn))
        knowledge_count = conn.execute("SELECT COUNT(*) FROM knowledge").fetchone()[0]
        data = db.create_backup_zip(conn)

    out_path = Path(args.output)
    out_path.write_bytes(data)
    notebook_note = " + notebook" if db.LEARNING_STATE_PATH.exists() else ""
    console.print(
        f"[green]Backup saved:[/green] {out_path}  "
        f"([cyan]{lessons_count}[/cyan] lessons, "
        f"[cyan]{knowledge_count}[/cyan] topics{notebook_note})"
    )


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
        console.print(
            f"[green]✓[/green] Knowledge map restored ([cyan]{result['topics']}[/cyan] topics)"
        )
    parts = [f"[cyan]{result['lessons']}[/cyan] imported"]
    if result["skipped"]:
        parts.append(f"[yellow]{result['skipped']}[/yellow] duplicates skipped")
    if result["invalid"]:
        parts.append(f"[red]{result['invalid']}[/red] rejected (invalid)")
    console.print(f"[green]✓[/green] Lessons: {', '.join(parts)}")
    if result["learning_state"]:
        console.print("[green]✓[/green] Notebook restored")


def _claude_desktop_config() -> Path:
    """Return the platform-specific Claude Desktop config path."""
    import platform

    system = platform.system()
    if system == "Darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / "Claude"
            / "claude_desktop_config.json"
        )
    if system == "Windows":
        appdata = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(appdata) / "Claude" / "claude_desktop_config.json"
    # Linux and other Unix-like systems
    xdg = os.environ.get("XDG_CONFIG_HOME") or str(Path.home() / ".config")
    return Path(xdg) / "Claude" / "claude_desktop_config.json"


_CLAUDE_DESKTOP_CONFIG = _claude_desktop_config()
INSTALL_MODES = ("auto", "binary", "uv-tool", "uvx")


def _detect_install_method(mode: str = "auto") -> tuple[str, list[str]]:
    """Return (command, args) for the MCP server entry.

    mode="auto"     — detect: PyInstaller binary → uv-tool → uvx fallback.
    mode="binary"   — force binary path (Homebrew or self-contained exe).
    mode="uv-tool"  — force "devcoach mcp" (uv tool install).
    mode="uvx"      — force "uvx devcoach mcp".
    """
    import shutil

    if mode == "binary" or (mode == "auto" and getattr(sys, "frozen", False)):
        return sys.executable, ["mcp"]
    if mode == "uv-tool" or (mode == "auto" and shutil.which("devcoach")):
        return "devcoach", ["mcp"]
    return "uvx", ["devcoach", "mcp"]


def _mcp_entry(mode: str = "auto") -> dict:
    """Build the MCP server JSON entry for Claude config files."""
    command, args = _detect_install_method(mode)
    return {"command": command, "args": args}


def _hook_prefix(mode: str = "auto") -> str:
    """Return the shell prefix for devcoach hook commands, quoted if the path has spaces."""
    import shlex

    command, args = _detect_install_method(mode)
    if args == ["mcp"]:
        # binary or uv-tool install — use the command, quoted if the path has spaces
        return shlex.quote(command) if " " in command else command
    # uvx: "uvx devcoach"
    return f"{command} {args[0]}"


def _install_via_claude_cli(scope: str, force: bool, mode: str = "auto") -> str:
    """Register devcoach using the `claude mcp` CLI. Returns a status message or '' if unavailable."""
    import shutil
    import subprocess

    if not shutil.which("claude"):
        return ""  # caller falls back to manual install

    if force:
        subprocess.run(
            ["claude", "mcp", "remove", "--scope", scope, "devcoach"],
            capture_output=True,
        )

    command, args = _detect_install_method(mode)
    result = subprocess.run(
        ["claude", "mcp", "add", "--scope", scope, "devcoach", command, "--", *args],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return f"[green]✓[/green] Registered via `claude mcp add` (scope: {scope})"
    combined = (result.stderr + result.stdout).lower()
    if "already" in combined:
        return "[yellow]Already registered[/yellow] in Claude Code (use --force to overwrite)"
    return f"[red]claude mcp add failed:[/red] {(result.stderr or result.stdout).strip()}"


def _install_to(path: Path, entry: dict, force: bool) -> str:
    """Manually edit a JSON config file to add the devcoach MCP entry."""
    data: dict = json.loads(path.read_text()) if path.exists() else {}
    servers: dict = data.setdefault("mcpServers", {})
    if "devcoach" in servers and not force:
        return f"[yellow]Already registered[/yellow] in {path} (use --force to overwrite)"
    servers["devcoach"] = entry
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")
    return f"[green]✓[/green] Installed into {path}"


_CLAUDE_CODE_SETTINGS = Path.home() / ".claude" / "settings.json"
_ONBOARD_SESSION_TIMEOUT_HOURS = 24


def _install_hook(force: bool, mode: str = "auto") -> str:
    """Add the devcoach Stop hooks to the Claude Code settings.json file.

    Installs two sequential hooks: onboard-hook (silent profile seeding) followed by
    lesson-ready (lesson prompt when rate limit allows). Both are idempotent.
    The hook commands use the same binary/command as the MCP server entry.
    """
    # Build hook commands using the same install-method detection as the MCP entry,
    # so brew installs use the binary path and uvx installs use "uvx devcoach ...".
    prefix = _hook_prefix(mode)
    onboard_cmd = f"{prefix} onboard-hook"
    lesson_cmd = f"{prefix} lesson-ready"

    settings_path = _CLAUDE_CODE_SETTINGS
    data: dict = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    stop_hooks: list = data.setdefault("hooks", {}).setdefault("Stop", [])

    existing_indices = [
        i
        for i, entry in enumerate(stop_hooks)
        if any("devcoach" in h.get("command", "") for h in entry.get("hooks", []))
    ]
    if existing_indices:
        if not force:
            return f"[yellow]Stop hooks already installed[/yellow] in {settings_path} (use --force to overwrite)"
        for i in reversed(existing_indices):
            stop_hooks.pop(i)

    stop_hooks.append({"hooks": [{"type": "command", "command": onboard_cmd}]})
    stop_hooks.append({"hooks": [{"type": "command", "command": lesson_cmd}]})
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(data, indent=2) + "\n")
    return f"[green]✓[/green] Stop hooks installed into {settings_path}"


def _resolved_mode_label(mode: str) -> str:
    """Human-readable label for the resolved install mode."""
    command, args = _detect_install_method(mode)
    if mode != "auto":
        labels = {"binary": "binary", "uv-tool": "uv tool", "uvx": "uvx"}
        return labels[mode]
    if getattr(sys, "frozen", False):
        return "binary (auto-detected)"
    if command == "devcoach":
        return "uv tool (auto-detected)"
    return "uvx (auto-detected)"


def cmd_install(args: argparse.Namespace) -> None:
    # Resolve the install mode: explicit --mode flag overrides auto-detection.
    # auto   → detect: binary (sys.frozen) → uv-tool (devcoach on PATH) → uvx
    # binary → Homebrew or any self-contained PyInstaller exe
    # uv-tool → permanent install via "uv tool install devcoach"
    # uvx    → transient install via "uvx devcoach ..."
    mode: str = getattr(args, "mode", "auto") or "auto"

    do_code = args.claude_code or not args.claude_desktop
    do_desktop = args.claude_desktop or not args.claude_code
    skip_hook = getattr(args, "skip_hook", False)
    needs_restart = False

    command, mcp_args = _detect_install_method(mode)
    console.print(
        f"[bold]Setting up devcoach[/bold]  [dim]({_resolved_mode_label(mode)} · {command} {' '.join(mcp_args)})[/dim]"
    )
    console.print()

    if do_code:
        console.print("[bold]Claude Code[/bold]")

        # MCP server entry
        console.print("  MCP server…", end="  ")
        msg = _install_via_claude_cli(
            scope="global" if getattr(args, "global_scope", False) else "user",
            force=args.force,
            mode=mode,
        )
        if not msg:
            # `claude` CLI not found — fall back to direct JSON edit.
            claude_code_config = Path.home() / ".claude.json"
            claude_code_entry: dict = {"type": "stdio", "env": {}, **_mcp_entry(mode)}
            msg = _install_to(claude_code_config, claude_code_entry, args.force)
            needs_restart = True
        console.print(msg)

        # Stop hooks
        if not skip_hook:
            console.print("  Stop hooks…", end=" ")
            console.print(_install_hook(args.force, mode))

        console.print()

    if do_desktop:
        console.print("[bold]Claude Desktop[/bold]")
        console.print("  MCP server…", end="  ")
        console.print(_install_to(_CLAUDE_DESKTOP_CONFIG, _mcp_entry(mode), args.force))
        needs_restart = True
        console.print()

    if needs_restart:
        console.print("[yellow]→[/yellow] Restart Claude Desktop to pick up the new server.\n")

    console.print(
        "[dim]Tip: run [bold]devcoach backup[/bold] to export your profile, lessons and settings.\n"
        "     run [bold]devcoach restore <file>[/bold] to import a backup on a new machine.\n"
        "     The coaching skill is served automatically via the MCP prompt — always up to date.\n"
        "     If you copied it manually to Claude.ai, re-paste it after each devcoach update.[/dim]"
    )


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
        console.print(
            f"[green]✓[/green] Restored: {result['topics']} topics, {result['lessons']} lessons"
            + (", notebook" if result["learning_state"] else "")
        )
        console.print("[green]Setup complete![/green]")
        return

    # ── Step 2: auto or manual ────────────────────────────────────────────
    console.print("\n[bold]Step 2[/bold] — Build your knowledge profile")
    mode = _prompt(
        "Mode: [a]utomatic (detect from files) / [m]anual (type your stack)", "a"
    ).lower()

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
        profile = coach.get_profile(conn)

    topic_group = {t: g.name for g in profile.groups for t in g.topics}
    final_table = Table(title="Knowledge Profile", box=box.ROUNDED, show_lines=False)
    final_table.add_column("Topic", style="cyan", no_wrap=True)
    final_table.add_column("Group", style="dim")
    final_table.add_column("Confidence", justify="right")
    final_table.add_column("Bar", no_wrap=True)
    for entry in sorted(profile.knowledge, key=lambda e: -e.confidence):
        bar = _confidence_bar(entry.confidence)
        color = _confidence_color(entry.confidence)
        group_name = topic_group.get(entry.topic, "Other")
        final_table.add_row(
            entry.topic,
            group_name,
            f"[{color}]{entry.confidence}/10[/{color}]",
            f"[{color}]{bar}[/{color}]",
        )
    console.print(final_table)
    console.print(f"\n[green]Setup complete![/green] {len(topics)} topics saved.")


def cmd_ui(args: argparse.Namespace) -> None:
    import uvicorn

    from devcoach.web.app import app

    port = args.port
    console.print(
        f"[bold green]devcoach UI[/bold green] running at [link]http://localhost:{port}[/link]"
    )
    try:
        uvicorn.run(app, host="127.0.0.1", port=port, log_level="error", lifespan="off")
    except KeyboardInterrupt:
        pass
    console.print("[dim]Stopped.[/dim]")


# ── Parser ─────────────────────────────────────────────────────────────────


def cmd_mcp(_args: argparse.Namespace) -> None:
    """Start the devcoach MCP server (stdio transport for Claude Code / Claude Desktop)."""
    from devcoach.mcp.server import mcp

    mcp.run(transport="stdio")


def _onboard_session_active(knowledge_ready: bool) -> bool:
    """Return True if an onboarding session is complete or currently in progress.

    Computes state from two signals — no settings key required:
    - knowledge_ready: knowledge map has entries (profile built)
    - learning-state.md exists: notebook was written (session started or completed)

    Complete: both present → stay silent forever.
    In progress: notebook exists and is recent, but knowledge still empty → session underway.
    Not started / abandoned: notebook absent or older than _ONBOARD_SESSION_TIMEOUT_HOURS.
    """
    from datetime import UTC, datetime

    if knowledge_ready:
        return True

    path = db.LEARNING_STATE_PATH
    if not path.exists():
        return False
    age_hours = (
        datetime.now(UTC) - datetime.fromtimestamp(path.stat().st_mtime, UTC)
    ).total_seconds() / 3600
    return age_hours < _ONBOARD_SESSION_TIMEOUT_HOURS


def _emit_stop_context(context: str) -> None:
    """Emit Claude Code Stop-hook `additionalContext` feedback, then exit 0.

    Uses the `hookSpecificOutput.additionalContext` protocol, which continues the
    conversation and feeds `context` to Claude as non-error guidance — without being
    rendered to the user as a `Stop hook error` banner (which is what `decision: block`
    does). `suppressOutput` keeps the raw JSON out of the transcript view.
    """
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "Stop",
                    "additionalContext": context,
                },
                "suppressOutput": True,
            }
        )
    )
    sys.exit(0)


def cmd_onboard_hook(_args: argparse.Namespace) -> None:
    """Prompt the user to choose an onboarding option — for the Claude Code Stop hook.

    Fires once when no profile exists, then stays silent while the onboarding
    conversation is in progress (detected via learning-state.md recency).
    Expires after _ONBOARD_SESSION_TIMEOUT_HOURS so abandoned sessions re-prompt.

    Exit 0: always — the hook never errors. When no profile and no active session
            exist, it emits JSON `additionalContext` feedback on stdout to cue Claude
            (without surfacing the instruction to the user); otherwise it stays silent.
    """
    try:
        with db.connection() as conn:
            ready = db.is_onboarding_complete(conn)["knowledge_ready"]
    except Exception:
        sys.exit(0)

    if _onboard_session_active(ready):
        sys.exit(0)

    db.LEARNING_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not db.LEARNING_STATE_PATH.exists():
        db.LEARNING_STATE_PATH.write_text("# devcoach — Coaching Notebook\n")
    else:
        db.LEARNING_STATE_PATH.touch()

    _emit_stop_context(
        "devcoach profile is not set up yet. Use the devcoach skill to run onboarding. "
        "Default: Automatic (detect the tech stack from this project and build a profile "
        "immediately, no questions asked). Other options if the user prefers:\n"
        "- Guided: a conversation to map knowledge, confidence levels, and topic groups "
        "step by step (thorough, interactive).\n"
        "- Import: restore knowledge, lessons, and settings from an existing backup file."
    )


def cmd_lesson_ready(_args: argparse.Namespace) -> None:
    """Signal whether a lesson can be delivered now — for the Claude Code Stop hook.

    Requires the profile to already exist (run onboard-hook first). Exits 0 silently
    when no profile is present, the rate limit is hit, or any error occurs.
    Cooldown is enforced by check_rate_limit via min_gap_minutes (last lesson timestamp).

    Exit 0: always — the hook never errors. When no lesson is due it stays silent;
            when one is ready it emits JSON `additionalContext` feedback on stdout that
            cues Claude to deliver an AI-generated lesson via the devcoach skill,
            without surfacing the instruction to the user.
    """
    try:
        with db.connection() as conn:
            if not db.is_onboarding_complete(conn)["knowledge_ready"]:
                sys.exit(0)
            rate_limit = coach.check_rate_limit(conn)
    except Exception:
        sys.exit(0)

    if not rate_limit.allowed:
        sys.exit(0)

    _emit_stop_context(
        "Deliver a devcoach lesson based on the work in this conversation. "
        "Use the devcoach skill: ignore the devcoach://rate-limit check because it is "
        "already checked by this command"
    )


def _print_welcome() -> None:
    """Print the devcoach welcome/overview panel when no subcommand is given."""
    commands = [
        ("mcp", "Start the MCP server (stdio) for Claude Code / Claude Desktop"),
        ("ui [--port N]", "Launch the web dashboard  (default port: 7860)"),
        ("setup", "First-run wizard: import backup or build your knowledge profile"),
        ("install", "Register the MCP server + Stop hook in Claude Code / Claude Desktop config"),
        (
            "onboard-hook",
            "Claude Code Stop hook: silently seed profile on first run (always exit 0)",
        ),
        ("lesson-ready", "Claude Code Stop hook: exit 2 when a lesson is due (triggers AI lesson)"),
        ("", ""),
        ("profile", "Show the knowledge map"),
        ("stats", "Coaching statistics and rate-limit status"),
        ("settings", "Show current settings"),
        ("set <key> <val>", "Update a setting (max_per_day | min_gap_minutes)"),
        ("", ""),
        ("lessons", "List past lessons (many filter / sort options)"),
        ("lesson <id>", "Show a single lesson in detail"),
        ("star <id>", "Mark a lesson as starred"),
        ("unstar <id>", "Remove the starred mark from a lesson"),
        ("feedback <id>", "Record know / dont_know feedback for a lesson"),
        ("", ""),
        ("knowledge-add", "Add or update a topic in the knowledge map"),
        ("knowledge-remove", "Remove a topic from the knowledge map"),
        ("group-add", "Register a new knowledge group"),
        ("group-remove", "Delete a knowledge group"),
        ("group-assign", "Move a topic to a group"),
        ("", ""),
        ("backup [file]", "Export a full backup as zip"),
        ("restore <file>", "Restore from a backup zip"),
    ]

    table = Table(box=box.SIMPLE, show_header=False, padding=(0, 2, 0, 0))
    table.add_column(style="bold cyan", no_wrap=True)
    table.add_column(style="dim")
    for cmd, desc in commands:
        if cmd == "":
            table.add_row("", "")
        else:
            table.add_row(f"devcoach {cmd}", desc)

    hint = Text()
    hint.append("Run ", style="dim")
    hint.append("devcoach <command> --help", style="bold")
    hint.append(" for per-command options.", style="dim")

    console.print()
    console.print(
        Panel(
            table,
            title=f"[bold #6366f1]devcoach[/] [dim]v{devcoach.__version__}[/]",
            subtitle=hint,
            border_style="#6366f1",
            padding=(1, 2),
        )
    )
    console.print()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="devcoach",
        description="devcoach — progressive technical coaching",
    )
    parser.add_argument(
        "-v", "--version", action="version", version=f"%(prog)s {devcoach.__version__}"
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
    p_lessons.add_argument(
        "--starred", action="store_true", default=False, help="Show only starred lessons"
    )
    p_lessons.add_argument(
        "--feedback",
        choices=["know", "dont_know", "none"],
        default=None,
        help="Filter by feedback: know, dont_know, none (no response)",
    )
    p_lessons.add_argument(
        "--level",
        choices=["junior", "mid", "senior"],
        default=None,
        help="Filter by difficulty level",
    )
    p_lessons.add_argument(
        "--date-from",
        dest="date_from",
        default=None,
        metavar="YYYY-MM-DD[THH:MM]",
        help="Show lessons on or after this date/time (e.g. 2026-04-25 or 2026-04-25T14:30)",
    )
    p_lessons.add_argument(
        "--date-to",
        dest="date_to",
        default=None,
        metavar="YYYY-MM-DD[THH:MM]",
        help="Show lessons on or before this date/time; defaults to end-of-day if no time given",
    )
    p_lessons.add_argument(
        "--sort",
        default="timestamp",
        choices=["timestamp", "level", "topic_id", "title", "feedback"],
        help="Sort column (default: timestamp)",
    )
    p_lessons.add_argument(
        "--order", default="desc", choices=["asc", "desc"], help="Sort order (default: desc)"
    )

    p_lesson = sub.add_parser("lesson", help="Show a single lesson in detail")
    p_lesson.add_argument("id", help="Lesson ID")

    p_star = sub.add_parser("star", help="Mark a lesson as starred")
    p_star.add_argument("id", help="Lesson ID")

    p_unstar = sub.add_parser("unstar", help="Remove the starred mark from a lesson")
    p_unstar.add_argument("id", help="Lesson ID")

    p_delete = sub.add_parser("delete", help="Permanently delete a lesson")
    p_delete.add_argument("id", help="Lesson ID")

    p_feedback = sub.add_parser("feedback", help="Record know/dont_know feedback for a lesson")
    p_feedback.add_argument("id", help="Lesson ID")
    p_feedback.add_argument(
        "feedback", choices=["know", "dont_know", "clear"], help="Feedback value"
    )

    sub.add_parser("settings", help="Show current settings")
    sub.add_parser("stats", help="Show coaching statistics and rate-limit status")

    p_set = sub.add_parser("set", help="Update a setting")
    p_set.add_argument("key", help="Setting key (max_per_day | min_gap_minutes)")
    p_set.add_argument("value", help="New value")

    p_backup = sub.add_parser(
        "backup", help="Export a full backup (settings + knowledge + lessons) as zip"
    )
    p_backup.add_argument(
        "output",
        nargs="?",
        default="devcoach-backup.zip",
        help="Output zip file path (default: devcoach-backup.zip)",
    )

    p_restore = sub.add_parser("restore", help="Restore from a backup zip file")
    p_restore.add_argument("input", help="Path to backup zip file")

    p_kadd = sub.add_parser("knowledge-add", help="Add or update a topic in the knowledge map")
    p_kadd.add_argument("topic", help="Topic ID (e.g. rust_lifetimes)")
    p_kadd.add_argument(
        "--confidence",
        type=int,
        default=5,
        metavar="N",
        help="Initial confidence 0-10 (default: 5)",
    )
    p_kadd.add_argument(
        "--group", default=None, metavar="GROUP", help="Assign to a named group (optional)"
    )

    p_kremove = sub.add_parser("knowledge-remove", help="Remove a topic from the knowledge map")
    p_kremove.add_argument("topic", help="Topic ID to remove")

    p_gadd = sub.add_parser("group-add", help="Register a new knowledge group")
    p_gadd.add_argument("name", help="Group name (e.g. 'Machine Learning')")

    p_gremove = sub.add_parser(
        "group-remove", help="Delete a knowledge group (topics move to Other)"
    )
    p_gremove.add_argument("name", help="Group name to delete")

    p_gassign = sub.add_parser("group-assign", help="Move a topic to a group")
    p_gassign.add_argument("topic", help="Topic ID")
    p_gassign.add_argument("group", help="Group name (use 'Other' to ungroup)")

    p_install = sub.add_parser(
        "install",
        help="Register devcoach MCP server in Claude Code and/or Claude Desktop",
    )
    p_install.add_argument(
        "--claude-code",
        dest="claude_code",
        action="store_true",
        help="Target Claude Code only (uses `claude mcp add` if available)",
    )
    p_install.add_argument(
        "--claude-desktop",
        dest="claude_desktop",
        action="store_true",
        help="Target Claude Desktop only (edits config file directly)",
    )
    p_install.add_argument(
        "--global",
        dest="global_scope",
        action="store_true",
        help="Install at global scope instead of user scope (Claude Code only)",
    )
    p_install.add_argument("--force", action="store_true", help="Overwrite existing devcoach entry")
    p_install.add_argument(
        "--skip-hook",
        dest="skip_hook",
        action="store_true",
        help="Register MCP server only — do not install the Claude Code Stop hook",
    )
    p_install.add_argument(
        "--mode",
        choices=INSTALL_MODES,
        default="auto",
        help=(
            "Installation mode for the MCP command (default: auto-detect). "
            "'binary' = Homebrew/PyInstaller exe; "
            "'uv-tool' = permanent uv tool install; "
            "'uvx' = transient uvx invocation."
        ),
    )

    p_ui = sub.add_parser("ui", help="Launch the web dashboard")
    p_ui.add_argument("--port", type=int, default=7860, help="Port (default: 7860)")

    sub.add_parser(
        "setup",
        help="Interactive first-run wizard: import backup or build knowledge profile",
    )

    sub.add_parser(
        "mcp",
        help="Start the MCP server (stdio transport) for Claude Code / Claude Desktop",
    )

    sub.add_parser(
        "onboard-hook",
        help=(
            "Silently seed the knowledge profile on first run (Claude Code Stop hook). "
            "Always exits 0. No-op once the profile is initialised."
        ),
    )

    sub.add_parser(
        "lesson-ready",
        help=(
            "Check whether a lesson can be delivered now (for the Claude Code Stop hook). "
            "Exit 0 = silent (no profile yet, rate-limited, or error). Exit 2 = lesson due."
        ),
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
        "unstar": cmd_unstar,
        "delete": cmd_delete,
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
        "mcp": cmd_mcp,
        "onboard-hook": cmd_onboard_hook,
        "lesson-ready": cmd_lesson_ready,
    }

    if args.command is None:
        _print_welcome()
        sys.exit(0)

    dispatch[args.command](args)
