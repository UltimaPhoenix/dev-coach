"""CLI filter tests — exercises db.get_lessons() with the full filter matrix."""

from __future__ import annotations

import argparse
from io import StringIO
from unittest.mock import patch

import pytest

from devcoach.core import db
from devcoach.cli.commands import cmd_lessons, cmd_lesson
from tests.conftest import TEST_LESSONS


# ── get_lessons filter tests ───────────────────────────────────────────────

class TestGetLessonsFilters:
    def test_no_filter_returns_all(self, conn):
        lessons = db.get_lessons(conn)
        assert len(lessons) == 3

    def test_filter_by_category(self, conn):
        lessons = db.get_lessons(conn, category="python")
        assert len(lessons) == 3  # all have python

    def test_filter_by_category_no_match(self, conn):
        lessons = db.get_lessons(conn, category="docker")
        assert lessons == []

    def test_filter_by_project_exact(self, conn):
        lessons = db.get_lessons(conn, project="devcoach")
        assert len(lessons) == 2
        assert all(l.project == "devcoach" for l in lessons)

    def test_filter_by_project_no_match(self, conn):
        assert db.get_lessons(conn, project="other") == []

    def test_filter_by_repository(self, conn):
        lessons = db.get_lessons(conn, repository="UltimaPhoenix/dev-coach")
        assert len(lessons) == 2

    def test_filter_by_repository_fuzzy(self, conn):
        lessons = db.get_lessons(conn, repository="UltimaPhoenix")
        assert len(lessons) == 2

    def test_filter_by_branch_exact(self, conn):
        lessons = db.get_lessons(conn, branch="main")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"

    def test_filter_by_branch_fuzzy(self, conn):
        # "feature" matches "feature/git-metadata"
        lessons = db.get_lessons(conn, branch="feature")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_pragma_introspection"

    def test_filter_by_branch_no_match(self, conn):
        assert db.get_lessons(conn, branch="develop") == []

    def test_filter_by_commit_short_hash(self, conn):
        lessons = db.get_lessons(conn, commit="05f2f86")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"

    def test_filter_by_commit_full_hash(self, conn):
        lessons = db.get_lessons(conn, commit="f0537718")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_pragma_introspection"

    def test_filter_by_commit_fuzzy_middle(self, conn):
        # fuzzy: substring anywhere in commit_hash
        lessons = db.get_lessons(conn, commit="da02f2")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_pragma_introspection"

    def test_filter_by_commit_no_match(self, conn):
        assert db.get_lessons(conn, commit="deadbeef") == []

    def test_empty_string_filters_are_treated_as_none(self, conn):
        # Empty strings must NOT filter (they'd match nothing)
        # Callers are responsible for converting "" → None before calling get_lessons.
        # This test documents that "" is NOT the same as None.
        no_filter = db.get_lessons(conn, category=None)
        empty_filter = db.get_lessons(conn, category="")
        assert len(no_filter) == 3
        assert len(empty_filter) == 0  # "" causes LIKE '%""%' → no match

    def test_combined_project_and_branch(self, conn):
        lessons = db.get_lessons(conn, project="devcoach", branch="main")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"

    def test_period_today(self, conn):
        # All test lessons have today's date
        lessons = db.get_lessons(conn, period="today")
        assert len(lessons) == 3

    def test_period_all_returns_all(self, conn):
        lessons = db.get_lessons(conn, period="all")
        assert len(lessons) == 3

    def test_results_ordered_newest_first(self, conn):
        lessons = db.get_lessons(conn)
        timestamps = [l.timestamp for l in lessons]
        assert timestamps == sorted(timestamps, reverse=True)


# ── get_distinct_column tests ──────────────────────────────────────────────

class TestGetDistinctColumn:
    def test_distinct_projects(self, conn):
        assert db.get_distinct_column(conn, "project") == ["devcoach"]

    def test_distinct_repositories(self, conn):
        assert db.get_distinct_column(conn, "repository") == ["UltimaPhoenix/dev-coach"]

    def test_distinct_branches(self, conn):
        branches = db.get_distinct_column(conn, "branch")
        assert set(branches) == {"main", "feature/git-metadata"}

    def test_distinct_commits(self, conn):
        commits = db.get_distinct_column(conn, "commit_hash")
        assert len(commits) == 2

    def test_nulls_excluded(self, conn):
        # lesson-sqlite3-row-factory-001 has no metadata → nulls excluded
        projects = db.get_distinct_column(conn, "project")
        assert len(projects) == 1  # only "devcoach", null excluded


# ── cmd_lessons command tests ──────────────────────────────────────────────

def _make_lessons_args(**kwargs) -> argparse.Namespace:
    defaults = dict(period="all", category=None, project=None,
                    repository=None, branch=None, commit=None)
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


class TestCmdLessons:
    def test_lists_all_lessons(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args())
        out = capsys.readouterr().out
        # Rich wraps/truncates columns — use unique fragments from each title
        assert out.count("2026-04-19") == 3   # 3 date rows
        assert "PRAGMA" in out                 # pragma_introspection title
        assert "INSERT" in out                 # upsert_patterns title
        assert "column" in out                 # row_factory title ("by column name")

    def test_filter_by_project(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(project="devcoach"))
        out = capsys.readouterr().out
        assert out.count("2026-04-19") == 2    # 2 lessons with devcoach project
        assert "INSERT" in out
        assert "PRAGMA" in out
        assert "column" not in out             # row_factory excluded

    def test_filter_by_branch(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(branch="main"))
        out = capsys.readouterr().out
        assert out.count("2026-04-19") == 1    # only upsert lesson is on main
        assert "INSERT" in out
        assert "PRAGMA" not in out

    def test_filter_by_commit(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(commit="05f2f86"))
        out = capsys.readouterr().out
        assert out.count("2026-04-19") == 1
        assert "05f2f86" in out                # commit hash appears in Commit column
        assert "PRAGMA" not in out

    def test_no_results_prints_message(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(project="nonexistent"))
        out = capsys.readouterr().out
        assert "No lessons found" in out

    def test_meta_columns_shown_when_metadata_present(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(project="devcoach"))
        out = capsys.readouterr().out
        assert "Branch" in out
        assert "Commit" in out

    def test_meta_columns_hidden_when_no_metadata(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        # sqlite3_row_factory has no metadata
        cmd_lessons(_make_lessons_args(category="python", branch="nonexistent-branch-xyz"))
        out = capsys.readouterr().out
        assert "No lessons found" in out


# ── cmd_lesson detail tests ────────────────────────────────────────────────

def _make_lesson_args(lesson_id: str) -> argparse.Namespace:
    return argparse.Namespace(id=lesson_id)


class TestCmdLesson:
    def test_shows_lesson_detail(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lesson(_make_lesson_args("lesson-sqlite-upsert-patterns-001"))
        out = capsys.readouterr().out
        assert "INSERT OR REPLACE" in out
        assert "sqlite_upsert_patterns" in out

    def test_shows_git_metadata(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lesson(_make_lesson_args("lesson-sqlite-upsert-patterns-001"))
        out = capsys.readouterr().out
        assert "devcoach" in out
        assert "main" in out
        assert "05f2f86" in out

    def test_no_git_line_when_no_metadata(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lesson(_make_lesson_args("lesson-sqlite3-row-factory-001"))
        out = capsys.readouterr().out
        assert "Git:" not in out

    def test_not_found_exits(self, db_path, monkeypatch):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        with pytest.raises(SystemExit):
            cmd_lesson(_make_lesson_args("nonexistent-id"))
