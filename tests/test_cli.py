"""CLI filter tests — exercises db.get_lessons() with the full filter matrix."""

from __future__ import annotations

import argparse
from datetime import date

import pytest

from devcoach.cli.commands import cmd_feedback, cmd_lesson, cmd_lessons, cmd_star, cmd_unstar
from devcoach.core import db

_TODAY = date.today().isoformat()


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
        assert all(lesson.project == "devcoach" for lesson in lessons)

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
        timestamps = [lesson.timestamp for lesson in lessons]
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
    defaults = dict(
        period="all", category=None, project=None, repository=None, branch=None, commit=None
    )
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


class TestCmdLessons:
    def test_lists_all_lessons(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args())
        out = capsys.readouterr().out
        # Rich wraps/truncates columns — use unique fragments from each title
        assert out.count(_TODAY) == 3  # 3 date rows
        assert "PRAGMA" in out  # pragma_introspection title
        assert "INSERT" in out  # upsert_patterns title
        assert "column" in out  # row_factory title ("by column name")

    def test_filter_by_project(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(project="devcoach"))
        out = capsys.readouterr().out
        assert out.count(_TODAY) == 2  # 2 lessons with devcoach project
        assert "INSERT" in out
        assert "PRAGMA" in out
        assert "column" not in out  # row_factory excluded

    def test_filter_by_branch(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(branch="main"))
        out = capsys.readouterr().out
        assert out.count(_TODAY) == 1  # only upsert lesson is on main
        assert "INSERT" in out
        assert "PRAGMA" not in out

    def test_filter_by_commit(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args(commit="05f2f86"))
        out = capsys.readouterr().out
        assert out.count(_TODAY) == 1
        assert "05f2f86" in out  # commit hash appears in Commit column
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
        # Rich truncates wide column values — assert on 7-char commit hashes (always fit)
        assert "05f2f86" in out  # upsert lesson commit (main branch)
        assert "f053771" in out  # pragma lesson commit (feature branch)

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

    def test_shows_star_and_feedback(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lesson(_make_lesson_args("lesson-sqlite-upsert-patterns-001"))
        out = capsys.readouterr().out
        assert "starred" in out
        assert "know" in out.lower()


# ── starred filter tests ───────────────────────────────────────────────────


class TestStarredFilter:
    def test_get_lessons_starred_only(self, conn):
        lessons = db.get_lessons(conn, starred=True)
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"

    def test_get_lessons_unstarred_only(self, conn):
        lessons = db.get_lessons(conn, starred=False)
        assert len(lessons) == 2
        assert all(not lesson.starred for lesson in lessons)

    def test_cmd_lessons_starred_flag(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        args = argparse.Namespace(
            period="all",
            category=None,
            project=None,
            repository=None,
            branch=None,
            commit=None,
            starred=True,
        )
        cmd_lessons(args)
        out = capsys.readouterr().out
        assert out.count(_TODAY) == 1
        assert "INSERT" in out

    def test_cmd_lessons_shows_star_column(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_lessons(_make_lessons_args())
        out = capsys.readouterr().out
        assert "★" in out  # starred lesson marker


# ── set_star tests ─────────────────────────────────────────────────────────


class TestToggleStar:
    def test_set_star_on(self, conn):
        result = db.set_star(conn, "lesson-sqlite3-row-factory-001", True)
        assert result is True
        lesson = db.get_lesson_by_id(conn, "lesson-sqlite3-row-factory-001")
        assert lesson.starred is True

    def test_set_star_off(self, conn):
        result = db.set_star(conn, "lesson-sqlite-upsert-patterns-001", False)
        assert result is True  # found and updated
        lesson = db.get_lesson_by_id(conn, "lesson-sqlite-upsert-patterns-001")
        assert lesson.starred is False

    def test_set_star_idempotent(self, conn):
        db.set_star(conn, "lesson-sqlite3-row-factory-001", True)
        result = db.set_star(conn, "lesson-sqlite3-row-factory-001", True)
        assert result is True

    def test_cmd_star_marks_starred(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_star(argparse.Namespace(id="lesson-sqlite3-row-factory-001"))
        out = capsys.readouterr().out
        assert "starred" in out

    def test_cmd_unstar_marks_unstarred(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_unstar(argparse.Namespace(id="lesson-sqlite-upsert-patterns-001"))
        out = capsys.readouterr().out
        assert "unstarred" in out

    def test_cmd_star_idempotent(self, db_path, monkeypatch, conn, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        cmd_star(argparse.Namespace(id="lesson-sqlite3-row-factory-001"))
        cmd_star(argparse.Namespace(id="lesson-sqlite3-row-factory-001"))
        capsys.readouterr()
        assert db.get_lesson_by_id(conn, "lesson-sqlite3-row-factory-001").starred is True

    def test_cmd_star_not_found_exits(self, db_path, monkeypatch):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        with pytest.raises(SystemExit):
            cmd_star(argparse.Namespace(id="nonexistent"))

    def test_cmd_unstar_not_found_exits(self, db_path, monkeypatch):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        with pytest.raises(SystemExit):
            cmd_unstar(argparse.Namespace(id="nonexistent"))


# ── set_feedback / cmd_feedback tests ─────────────────────────────────────


class TestFeedback:
    def test_set_feedback_know(self, conn):
        topic_id = db.set_feedback(conn, "lesson-sqlite3-row-factory-001", "know")
        assert topic_id == "sqlite3_row_factory"
        lesson = db.get_lesson_by_id(conn, "lesson-sqlite3-row-factory-001")
        assert lesson.feedback == "know"

    def test_set_feedback_dont_know(self, conn):
        db.set_feedback(conn, "lesson-sqlite3-row-factory-001", "dont_know")
        lesson = db.get_lesson_by_id(conn, "lesson-sqlite3-row-factory-001")
        assert lesson.feedback == "dont_know"

    def test_set_feedback_clear(self, conn):
        # upsert_patterns starts with feedback="know"
        db.set_feedback(conn, "lesson-sqlite-upsert-patterns-001", None)
        lesson = db.get_lesson_by_id(conn, "lesson-sqlite-upsert-patterns-001")
        assert lesson.feedback is None

    def test_cmd_feedback_know_bumps_confidence(self, db_path, monkeypatch, capsys):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        # sqlite3_row_factory has no feedback yet; knowing it should bump sqlite3_row_factory confidence
        cmd_feedback(argparse.Namespace(id="lesson-sqlite3-row-factory-001", feedback="know"))
        out = capsys.readouterr().out
        assert "know" in out.lower()

    def test_cmd_feedback_invalid_exits(self, db_path, monkeypatch):
        monkeypatch.setattr(db, "DB_PATH", db_path)
        with pytest.raises(SystemExit):
            cmd_feedback(argparse.Namespace(id="lesson-sqlite3-row-factory-001", feedback="maybe"))
