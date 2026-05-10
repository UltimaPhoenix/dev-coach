"""Tests for cli/commands.py — non-interactive subcommands not covered by test_cli.py."""

from __future__ import annotations

import argparse
import json
import sqlite3
import zipfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from devcoach.cli import commands
from devcoach.core import db

# ── Fixtures ───────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _patch_db(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(db, "DB_PATH", db_path)


def _ns(**kwargs) -> argparse.Namespace:
    return argparse.Namespace(**kwargs)


# ── _confidence_bar ────────────────────────────────────────────────────────


class TestConfidenceBar:
    def test_zero_all_empty(self):
        assert commands._confidence_bar(0) == "░" * 10

    def test_ten_all_filled(self):
        assert commands._confidence_bar(10) == "█" * 10

    def test_five_has_both(self):
        bar = commands._confidence_bar(5)
        assert len(bar) == 10
        assert "█" in bar and "░" in bar


# ── cmd_profile ────────────────────────────────────────────────────────────


class TestCmdProfile:
    def test_runs_without_error(self, capsys):
        commands.cmd_profile(_ns())

    def test_shows_known_topic(self, capsys, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "python", 7)
        c.close()
        commands.cmd_profile(_ns())
        assert "python" in capsys.readouterr().out


# ── cmd_settings ───────────────────────────────────────────────────────────


class TestCmdSettings:
    def test_shows_max_per_day(self, capsys):
        commands.cmd_settings(_ns())
        assert "max_per_day" in capsys.readouterr().out

    def test_shows_min_gap_minutes(self, capsys):
        commands.cmd_settings(_ns())
        assert "min_gap_minutes" in capsys.readouterr().out


# ── cmd_stats ──────────────────────────────────────────────────────────────


class TestCmdStats:
    def test_runs_without_error(self, capsys):
        commands.cmd_stats(_ns())

    def test_shows_total_lesson_count(self, capsys):
        commands.cmd_stats(_ns())
        assert "3" in capsys.readouterr().out  # 3 seeded lessons


# ── cmd_set ────────────────────────────────────────────────────────────────


class TestCmdSet:
    def test_sets_max_per_day(self, capsys, db_path):
        commands.cmd_set(_ns(key="max_per_day", value="5"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_settings(c).max_per_day == 5
        c.close()

    def test_sets_min_gap_minutes(self, capsys, db_path):
        commands.cmd_set(_ns(key="min_gap_minutes", value="30"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_settings(c).min_gap_minutes == 30
        c.close()

    def test_prints_confirmation(self, capsys):
        commands.cmd_set(_ns(key="max_per_day", value="3"))
        assert "max_per_day" in capsys.readouterr().out

    def test_invalid_key_exits(self, capsys):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_set(_ns(key="nonexistent_key", value="1"))
        assert exc.value.code == 1


# ── cmd_backup ─────────────────────────────────────────────────────────────


class TestCmdBackup:
    def test_creates_zip_file(self, capsys, tmp_path):
        out = tmp_path / "backup.zip"
        commands.cmd_backup(_ns(output=str(out)))
        assert out.exists()

    def test_zip_is_valid(self, capsys, tmp_path):
        out = tmp_path / "backup.zip"
        commands.cmd_backup(_ns(output=str(out)))
        with zipfile.ZipFile(out) as zf:
            assert "lessons.json" in zf.namelist()
            assert "knowledge.json" in zf.namelist()
            assert "settings.json" in zf.namelist()

    def test_zip_contains_seeded_lessons(self, capsys, tmp_path):
        out = tmp_path / "backup.zip"
        commands.cmd_backup(_ns(output=str(out)))
        with zipfile.ZipFile(out) as zf:
            lessons = json.loads(zf.read("lessons.json"))
        assert len(lessons) == 3

    def test_prints_saved_message(self, capsys, tmp_path):
        out = tmp_path / "backup.zip"
        commands.cmd_backup(_ns(output=str(out)))
        assert "Backup saved" in capsys.readouterr().out


# ── cmd_restore ────────────────────────────────────────────────────────────


class TestCmdRestore:
    @pytest.fixture
    def backup_zip(self, tmp_path: Path) -> Path:
        with db.connection() as conn:
            data = db.create_backup_zip(conn)
        path = tmp_path / "backup.zip"
        path.write_bytes(data)
        return path

    def test_restores_without_error(self, capsys, backup_zip):
        commands.cmd_restore(_ns(input=str(backup_zip)))

    def test_prints_lesson_result(self, capsys, backup_zip):
        commands.cmd_restore(_ns(input=str(backup_zip)))
        assert "Lessons" in capsys.readouterr().out

    def test_settings_restored(self, capsys, backup_zip):
        commands.cmd_restore(_ns(input=str(backup_zip)))
        assert "Settings" in capsys.readouterr().out

    def test_missing_file_exits(self, capsys, tmp_path):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_restore(_ns(input=str(tmp_path / "no.zip")))
        assert exc.value.code == 1

    def test_prints_notebook_result(self, capsys, tmp_path):
        import io as _io

        buf = _io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("lessons.json", "[]")
            zf.writestr("knowledge.json", json.dumps({"groups": [], "topics": []}))
            zf.writestr("settings.json", "{}")
            zf.writestr("learning-state.md", "# Notes\n")
        path = tmp_path / "with-notebook.zip"
        path.write_bytes(buf.getvalue())
        commands.cmd_restore(_ns(input=str(path)))
        assert "Notebook" in capsys.readouterr().out


# ── cmd_knowledge_add ──────────────────────────────────────────────────────


class TestCmdKnowledgeAdd:
    def test_adds_topic(self, capsys, db_path):
        commands.cmd_knowledge_add(_ns(topic="rust", confidence=7, group=None))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert db.get_all_knowledge(c).get("rust") == 7
        c.close()

    def test_empty_topic_exits(self, capsys):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_knowledge_add(_ns(topic="   ", confidence=5, group=None))
        assert exc.value.code == 1

    def test_adds_topic_with_group(self, capsys, db_path):
        commands.cmd_knowledge_add(_ns(topic="elixir", confidence=5, group="Languages"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "elixir" in groups.get("Languages", [])

    def test_group_other_not_assigned(self, capsys, db_path):
        commands.cmd_knowledge_add(_ns(topic="go", confidence=6, group="Other"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        # "Other" is not a real group — topic should exist but not be in any named group
        all_group_topics = [t for ts in groups.values() for t in ts]
        assert "go" not in all_group_topics

    def test_prints_confirmation(self, capsys):
        commands.cmd_knowledge_add(_ns(topic="haskell", confidence=3, group=None))
        assert "haskell" in capsys.readouterr().out


# ── cmd_knowledge_remove ───────────────────────────────────────────────────


class TestCmdKnowledgeRemove:
    def test_removes_existing_topic(self, capsys, db_path):
        commands.cmd_knowledge_remove(_ns(topic="python"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "python" not in db.get_all_knowledge(c)
        c.close()

    def test_prints_removed_message(self, capsys):
        commands.cmd_knowledge_remove(_ns(topic="python"))
        assert "python" in capsys.readouterr().out

    def test_nonexistent_topic_prints_not_found(self, capsys):
        commands.cmd_knowledge_remove(_ns(topic="nonexistent_xyz_123"))
        out = capsys.readouterr().out
        assert "nonexistent_xyz_123" in out


# ── cmd_group_add ──────────────────────────────────────────────────────────


class TestCmdGroupAdd:
    def test_adds_group(self, capsys, db_path):
        commands.cmd_group_add(_ns(name="DevOps"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "DevOps" in db.get_knowledge_groups(c)
        c.close()

    def test_empty_name_exits(self, capsys):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_group_add(_ns(name="   "))
        assert exc.value.code == 1

    def test_other_name_exits(self, capsys):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_group_add(_ns(name="Other"))
        assert exc.value.code == 1

    def test_prints_group_name(self, capsys):
        commands.cmd_group_add(_ns(name="Languages"))
        assert "Languages" in capsys.readouterr().out


# ── cmd_group_remove ───────────────────────────────────────────────────────


class TestCmdGroupRemove:
    def test_removes_existing_group(self, capsys, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.add_group(c, "Temp")
        c.close()

        commands.cmd_group_remove(_ns(name="Temp"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        assert "Temp" not in db.get_knowledge_groups(c)
        c.close()

    def test_nonexistent_group_does_not_crash(self, capsys):
        commands.cmd_group_remove(_ns(name="NoSuchGroup"))

    def test_prints_group_name_on_success(self, capsys, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.add_group(c, "ToRemove")
        c.close()
        commands.cmd_group_remove(_ns(name="ToRemove"))
        assert "ToRemove" in capsys.readouterr().out


# ── cmd_group_assign ───────────────────────────────────────────────────────


class TestCmdGroupAssign:
    @pytest.fixture(autouse=True)
    def _seed_python(self, db_path):
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.upsert_knowledge(c, "python", 7)
        c.close()

    def test_assigns_to_group(self, capsys, db_path):
        commands.cmd_group_assign(_ns(topic="python", group="Languages"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "python" in groups.get("Languages", [])

    def test_assign_other_ungroups_topic(self, capsys, db_path):
        commands.cmd_group_assign(_ns(topic="python", group="Languages"))
        commands.cmd_group_assign(_ns(topic="python", group="Other"))
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        groups = db.get_knowledge_groups(c)
        c.close()
        assert "python" not in groups.get("Languages", [])

    def test_unknown_topic_exits(self, capsys):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_group_assign(_ns(topic="no_such_topic_xyz", group="Backend"))
        assert exc.value.code == 1

    def test_prints_topic_and_group(self, capsys):
        commands.cmd_group_assign(_ns(topic="python", group="Languages"))
        out = capsys.readouterr().out
        assert "python" in out
        assert "Languages" in out


# ── _install_to ────────────────────────────────────────────────────────────


class TestInstallTo:
    def test_creates_new_config(self, tmp_path):
        path = tmp_path / "claude.json"
        result = commands._install_to(path, {"command": "uvx"}, force=False)
        assert path.exists()
        assert "Installed" in result

    def test_new_config_has_devcoach_entry(self, tmp_path):
        path = tmp_path / "claude.json"
        commands._install_to(path, {"command": "uvx", "args": ["devcoach"]}, force=False)
        data = json.loads(path.read_text())
        assert data["mcpServers"]["devcoach"]["command"] == "uvx"

    def test_merges_with_existing_servers(self, tmp_path):
        path = tmp_path / "claude.json"
        path.write_text(json.dumps({"mcpServers": {"other-tool": {"command": "other"}}}))
        commands._install_to(path, {"command": "uvx"}, force=False)
        data = json.loads(path.read_text())
        assert "other-tool" in data["mcpServers"]
        assert "devcoach" in data["mcpServers"]

    def test_already_registered_returns_message(self, tmp_path):
        path = tmp_path / "claude.json"
        path.write_text(json.dumps({"mcpServers": {"devcoach": {"command": "old"}}}))
        result = commands._install_to(path, {"command": "new"}, force=False)
        assert "Already registered" in result

    def test_already_registered_not_overwritten(self, tmp_path):
        path = tmp_path / "claude.json"
        path.write_text(json.dumps({"mcpServers": {"devcoach": {"command": "old"}}}))
        commands._install_to(path, {"command": "new"}, force=False)
        assert json.loads(path.read_text())["mcpServers"]["devcoach"]["command"] == "old"

    def test_force_overwrites(self, tmp_path):
        path = tmp_path / "claude.json"
        path.write_text(json.dumps({"mcpServers": {"devcoach": {"command": "old"}}}))
        commands._install_to(path, {"command": "new"}, force=True)
        assert json.loads(path.read_text())["mcpServers"]["devcoach"]["command"] == "new"

    def test_creates_parent_directories(self, tmp_path):
        path = tmp_path / "deep" / "nested" / "claude.json"
        commands._install_to(path, {"command": "uvx"}, force=False)
        assert path.exists()

    def test_preserves_other_top_level_keys(self, tmp_path):
        path = tmp_path / "claude.json"
        path.write_text(json.dumps({"otherKey": "value", "mcpServers": {}}))
        commands._install_to(path, {"command": "uvx"}, force=False)
        data = json.loads(path.read_text())
        assert data["otherKey"] == "value"


# ── cmd_install ────────────────────────────────────────────────────────────


class TestCmdInstall:
    """Tests for cmd_install — claude CLI path is mocked out; desktop uses file fallback."""

    def _ns_install(self, **kwargs):
        defaults = dict(claude_code=False, claude_desktop=False, global_scope=False, force=False)
        defaults.update(kwargs)
        return _ns(**defaults)

    def test_installs_via_claude_cli_for_code(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(
            commands, "_install_via_claude_cli", lambda scope, force: "[green]✓[/green] Registered"
        )
        commands.cmd_install(self._ns_install(claude_code=True))
        out = capsys.readouterr().out
        assert "Registered" in out
        assert not desktop.exists()

    def test_falls_back_to_file_when_no_claude_cli(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(commands, "_install_via_claude_cli", lambda scope, force: "")

        def _fake_home():
            return tmp_path

        monkeypatch.setattr(Path, "home", staticmethod(_fake_home))
        commands.cmd_install(self._ns_install(claude_code=True))
        assert (tmp_path / ".claude.json").exists()

    def test_desktop_only_writes_file(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(commands, "_install_via_claude_cli", lambda scope, force: "")
        commands.cmd_install(self._ns_install(claude_desktop=True))
        assert desktop.exists()
        data = json.loads(desktop.read_text())
        assert data["mcpServers"]["devcoach"]["command"] == "uvx"

    def test_both_by_default(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(
            commands, "_install_via_claude_cli", lambda scope, force: "[green]✓[/green] Registered"
        )
        commands.cmd_install(self._ns_install())
        assert desktop.exists()

    def test_restart_reminder_shown_for_desktop(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(commands, "_install_via_claude_cli", lambda scope, force: "")
        commands.cmd_install(self._ns_install(claude_desktop=True))
        assert "Restart" in capsys.readouterr().out

    def test_no_restart_reminder_when_cli_succeeds(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "no_desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(
            commands, "_install_via_claude_cli", lambda scope, force: "[green]✓[/green] Registered"
        )
        commands.cmd_install(self._ns_install(claude_code=True))
        assert "Restart" not in capsys.readouterr().out

    def test_force_flag_passed_to_cli(self, monkeypatch, tmp_path):
        desktop = tmp_path / "desktop.json"
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        received = {}
        monkeypatch.setattr(
            commands,
            "_install_via_claude_cli",
            lambda scope, force: received.update(force=force) or "[green]✓[/green]",
        )
        commands.cmd_install(self._ns_install(claude_code=True, force=True))
        assert received["force"] is True

    def test_force_overwrites_desktop_file(self, capsys, tmp_path, monkeypatch):
        desktop = tmp_path / "desktop.json"
        desktop.write_text(json.dumps({"mcpServers": {"devcoach": {"command": "old"}}}))
        monkeypatch.setattr(commands, "_CLAUDE_DESKTOP_CONFIG", desktop)
        monkeypatch.setattr(commands, "_install_via_claude_cli", lambda scope, force: "")
        commands.cmd_install(self._ns_install(claude_desktop=True, force=True))
        assert json.loads(desktop.read_text())["mcpServers"]["devcoach"]["command"] == "uvx"


# ── _build_parser ──────────────────────────────────────────────────────────


class TestBuildParser:
    def test_profile(self):
        assert commands._build_parser().parse_args(["profile"]).command == "profile"

    def test_lessons_defaults(self):
        args = commands._build_parser().parse_args(["lessons"])
        assert args.period == "all"
        assert args.starred is False
        assert args.sort == "timestamp"
        assert args.order == "desc"

    def test_lessons_with_filters(self):
        args = commands._build_parser().parse_args(
            ["lessons", "--period", "week", "--starred", "--level", "mid", "--category", "python"]
        )
        assert args.period == "week"
        assert args.starred is True
        assert args.level == "mid"
        assert args.category == "python"

    def test_set_command(self):
        args = commands._build_parser().parse_args(["set", "max_per_day", "5"])
        assert args.key == "max_per_day"
        assert args.value == "5"

    def test_backup_default_output(self):
        args = commands._build_parser().parse_args(["backup"])
        assert args.output == "devcoach-backup.zip"

    def test_backup_custom_output(self):
        args = commands._build_parser().parse_args(["backup", "my.zip"])
        assert args.output == "my.zip"

    def test_restore_input(self):
        args = commands._build_parser().parse_args(["restore", "my.zip"])
        assert args.input == "my.zip"

    def test_install_flags(self):
        args = commands._build_parser().parse_args(["install", "--claude-code", "--force"])
        assert args.claude_code is True
        assert args.force is True

    def test_ui_default_port(self):
        assert commands._build_parser().parse_args(["ui"]).port == 7860

    def test_ui_custom_port(self):
        assert commands._build_parser().parse_args(["ui", "--port", "9000"]).port == 9000

    def test_knowledge_add_defaults(self):
        args = commands._build_parser().parse_args(["knowledge-add", "rust"])
        assert args.topic == "rust"
        assert args.confidence == 5
        assert args.group is None

    def test_feedback_choices(self):
        args = commands._build_parser().parse_args(["feedback", "lesson-001", "know"])
        assert args.id == "lesson-001"
        assert args.feedback == "know"

    def test_date_from_to(self):
        args = commands._build_parser().parse_args(
            ["lessons", "--date-from", "2026-01-01", "--date-to", "2026-12-31"]
        )
        assert args.date_from == "2026-01-01"
        assert args.date_to == "2026-12-31"


# ── run_cli ────────────────────────────────────────────────────────────────


class TestRunCli:
    def test_no_command_exits_zero(self, capsys, monkeypatch):
        monkeypatch.setattr("sys.argv", ["devcoach"])
        with pytest.raises(SystemExit) as exc:
            commands.run_cli()
        assert exc.value.code == 0

    def test_dispatches_profile(self, capsys, monkeypatch):
        monkeypatch.setattr("sys.argv", ["devcoach", "profile"])
        commands.run_cli()

    def test_dispatches_settings(self, capsys, monkeypatch):
        monkeypatch.setattr("sys.argv", ["devcoach", "settings"])
        commands.run_cli()
        assert "max_per_day" in capsys.readouterr().out

    def test_dispatches_stats(self, capsys, monkeypatch):
        monkeypatch.setattr("sys.argv", ["devcoach", "stats"])
        commands.run_cli()

    def test_dispatches_backup(self, capsys, tmp_path, monkeypatch):
        out = str(tmp_path / "b.zip")
        monkeypatch.setattr("sys.argv", ["devcoach", "backup", out])
        commands.run_cli()
        assert Path(out).exists()


# ── cmd_feedback ───────────────────────────────────────────────────────────


class TestCmdFeedback:
    def test_clear_prints_cleared(self, capsys):
        commands.cmd_feedback(_ns(id="lesson-sqlite3-row-factory-001", feedback="clear"))
        assert "cleared" in capsys.readouterr().out

    def test_invalid_feedback_exits(self):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_feedback(_ns(id="lesson-sqlite3-row-factory-001", feedback="bad"))
        assert exc.value.code == 1

    def test_lesson_not_found_exits(self):
        with pytest.raises(SystemExit) as exc:
            commands.cmd_feedback(_ns(id="nonexistent-lesson", feedback="know"))
        assert exc.value.code == 1


# ── cmd_group_remove (success path) ───────────────────────────────────────


class TestCmdGroupRemoveSuccess:
    def test_prints_removed_when_topics_cleared(self, capsys, db_path):
        # Assign python to a group so delete_group returns count > 0
        c = sqlite3.connect(str(db_path))
        c.row_factory = sqlite3.Row
        db.assign_topic_to_group(c, "python", "Languages")
        c.close()
        commands.cmd_group_remove(_ns(name="Languages"))
        out = capsys.readouterr().out
        assert "Removed" in out
        assert "Languages" in out


# ── cmd_restore (invalid lessons) ─────────────────────────────────────────


class TestCmdRestoreInvalid:
    def test_invalid_lessons_reported(self, capsys, tmp_path):
        bad_zip = tmp_path / "bad.zip"
        with zipfile.ZipFile(bad_zip, "w") as zf:
            zf.writestr("lessons.json", json.dumps([{"id": "x", "not_a_lesson": True}]))
            zf.writestr("knowledge.json", json.dumps({}))
            zf.writestr("settings.json", json.dumps({}))
        commands.cmd_restore(_ns(input=str(bad_zip)))
        assert "rejected" in capsys.readouterr().out


# ── _claude_desktop_config (platform paths) ───────────────────────────────


class TestClaudeDesktopConfig:
    def test_windows_path(self, monkeypatch, tmp_path):
        monkeypatch.setenv("APPDATA", str(tmp_path))
        with patch("platform.system", return_value="Windows"):
            path = commands._claude_desktop_config()
        assert "Claude" in str(path)
        assert path.name == "claude_desktop_config.json"

    def test_linux_path_with_xdg(self, monkeypatch, tmp_path):
        monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
        with patch("platform.system", return_value="Linux"):
            path = commands._claude_desktop_config()
        assert str(tmp_path) in str(path)
        assert path.name == "claude_desktop_config.json"

    def test_linux_path_without_xdg(self, monkeypatch):
        monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
        with patch("platform.system", return_value="Linux"):
            path = commands._claude_desktop_config()
        assert ".config" in str(path)
        assert path.name == "claude_desktop_config.json"


# ── _install_via_claude_cli ────────────────────────────────────────────────


class TestInstallViaCaudeCli:
    def test_returns_empty_when_no_claude(self):
        with patch("shutil.which", return_value=None):
            assert commands._install_via_claude_cli("user", False) == ""

    def test_success_message(self):
        ok = MagicMock(returncode=0, stderr="", stdout="")
        with patch("shutil.which", return_value="/usr/bin/claude"):
            with patch("subprocess.run", return_value=ok):
                result = commands._install_via_claude_cli("user", False)
        assert "Registered" in result

    def test_already_registered_message(self):
        fail = MagicMock(returncode=1, stderr="already exists", stdout="")
        with patch("shutil.which", return_value="/usr/bin/claude"):
            with patch("subprocess.run", return_value=fail):
                result = commands._install_via_claude_cli("user", False)
        assert "Already registered" in result

    def test_failure_message(self):
        fail = MagicMock(returncode=1, stderr="permission denied", stdout="")
        with patch("shutil.which", return_value="/usr/bin/claude"):
            with patch("subprocess.run", return_value=fail):
                result = commands._install_via_claude_cli("user", False)
        assert "failed" in result

    def test_force_calls_remove_first(self):
        calls: list[list[str]] = []

        def mock_run(cmd, **kwargs):
            calls.append(cmd)
            return MagicMock(returncode=0, stderr="", stdout="")

        with patch("shutil.which", return_value="/usr/bin/claude"):
            with patch("subprocess.run", side_effect=mock_run):
                commands._install_via_claude_cli("user", True)

        assert any("remove" in cmd for cmd in calls)
        assert len(calls) == 2  # remove + add


# ── cmd_ui ─────────────────────────────────────────────────────────────────


class TestCmdUi:
    def test_prints_url(self, capsys):
        with patch("uvicorn.run"):
            commands.cmd_ui(_ns(port=7860))
        assert "7860" in capsys.readouterr().out

    def test_passes_port_to_uvicorn(self):
        with patch("uvicorn.run") as mock_run:
            commands.cmd_ui(_ns(port=9000))
        assert mock_run.call_args.kwargs["port"] == 9000


# ── cmd_setup ──────────────────────────────────────────────────────────────


class TestCmdSetup:
    def _inputs(self, *values):
        it = iter(values)
        return lambda *a, **kw: next(it)

    def test_backup_import_completes(self, tmp_path, monkeypatch, capsys):
        with db.connection() as conn:
            data = db.create_backup_zip(conn)
        backup = tmp_path / "b.zip"
        backup.write_bytes(data)
        monkeypatch.setattr("builtins.input", self._inputs(str(backup)))
        commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out

    def test_backup_not_found_exits(self, monkeypatch):
        monkeypatch.setattr("builtins.input", self._inputs("/no/such/file.zip"))
        with pytest.raises(SystemExit) as exc:
            commands.cmd_setup(_ns())
        assert exc.value.code == 1

    def test_auto_empty_stack_completes(self, monkeypatch, capsys):
        monkeypatch.setattr("builtins.input", self._inputs("", "", "", "", ""))
        with patch("devcoach.core.detect.detect_stack", return_value={}):
            with patch("devcoach.core.git.detect_git_context", return_value={"folder": "/tmp"}):
                commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out

    def test_auto_with_detected_topic(self, monkeypatch, capsys):
        # "" backup, "" mode(auto), "" keep python@6, "" extra, "n" no groups, "" mpd, "" gap
        monkeypatch.setattr("builtins.input", self._inputs("", "", "", "", "n", "", ""))
        with patch("devcoach.core.detect.detect_stack", return_value={"python": 6}):
            with patch("devcoach.core.git.detect_git_context", return_value={"folder": "/tmp"}):
                commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out

    def test_auto_with_groups(self, monkeypatch, capsys):
        # "" backup, "" auto, "" keep python, "" extra, "y" groups, "Languages" group, "" mpd, "" gap
        monkeypatch.setattr(
            "builtins.input", self._inputs("", "", "", "", "y", "Languages", "", "")
        )
        with patch("devcoach.core.detect.detect_stack", return_value={"python": 6}):
            with patch("devcoach.core.git.detect_git_context", return_value={"folder": "/tmp"}):
                commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out

    def test_manual_mode(self, monkeypatch, capsys):
        # "" backup, "m" manual, "python 7" topic, "" stop, "n" no groups, "" mpd, "" gap
        monkeypatch.setattr("builtins.input", self._inputs("", "m", "python 7", "", "n", "", ""))
        commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out

    def test_auto_skip_topic(self, monkeypatch, capsys):
        # "" backup, "" auto, "s" skip python, "" extra, "" mpd, "" gap
        monkeypatch.setattr("builtins.input", self._inputs("", "", "s", "", "", ""))
        with patch("devcoach.core.detect.detect_stack", return_value={"python": 6}):
            with patch("devcoach.core.git.detect_git_context", return_value={"folder": "/tmp"}):
                commands.cmd_setup(_ns())
        assert "Setup complete" in capsys.readouterr().out
