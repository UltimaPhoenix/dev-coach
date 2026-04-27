"""Web UI filter tests — exercises the FastAPI routes via TestClient."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from devcoach.core import db
from devcoach.web.app import app

# ── Client fixture ─────────────────────────────────────────────────────────


@pytest.fixture
def client(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """TestClient backed by the seeded test DB."""
    monkeypatch.setattr(db, "DB_PATH", db_path)
    return TestClient(app)


# ── /lessons — no filter ───────────────────────────────────────────────────


class TestLessonsNoFilter:
    def test_returns_200(self, client):
        assert client.get("/lessons").status_code == 200

    def test_shows_all_lessons(self, client):
        html = client.get("/lessons").text
        assert "sqlite3_row_factory" in html
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" in html

    def test_shows_lesson_count(self, client):
        html = client.get("/lessons").text
        assert "3 lessons" in html


# ── /lessons — empty-string params (the bug that caused blank results) ─────


class TestLessonsEmptyParams:
    def test_empty_category_returns_all(self, client):
        # category="" must be treated as "no filter", not LIKE '%""%'
        html = client.get("/lessons?category=").text
        assert "sqlite3_row_factory" in html
        assert "sqlite_upsert_patterns" in html

    def test_empty_project_returns_all(self, client):
        html = client.get("/lessons?project=").text
        assert "sqlite3_row_factory" in html

    def test_empty_branch_returns_all(self, client):
        html = client.get("/lessons?branch=").text
        assert "3 lessons" in html

    def test_empty_commit_returns_all(self, client):
        html = client.get("/lessons?commit=").text
        assert "3 lessons" in html

    def test_period_all_returns_all(self, client):
        html = client.get("/lessons?period=all").text
        assert "3 lessons" in html

    def test_full_empty_form_submission_returns_all(self, client):
        # Exactly what the browser sends when no filter is selected
        html = client.get("/lessons?period=all&category=&project=&repository=&branch=&commit=").text
        assert "3 lessons" in html


# ── /lessons — project filter ──────────────────────────────────────────────


class TestLessonsProjectFilter:
    def test_project_devcoach_returns_two(self, client):
        html = client.get("/lessons?project=devcoach").text
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" in html
        assert "sqlite3_row_factory" not in html

    def test_project_no_match_shows_empty(self, client):
        html = client.get("/lessons?project=other").text
        assert "No lessons" in html

    def test_project_select_rendered(self, client):
        html = client.get("/lessons").text
        assert 'name="project"' in html
        assert "devcoach" in html


# ── /lessons — repository filter ──────────────────────────────────────────


class TestLessonsRepositoryFilter:
    def test_repository_exact_match(self, client):
        html = client.get("/lessons?repository=UltimaPhoenix/dev-coach").text
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" in html
        assert "sqlite3_row_factory" not in html

    def test_repository_fuzzy_match(self, client):
        html = client.get("/lessons?repository=UltimaPhoenix").text
        assert "sqlite_upsert_patterns" in html

    def test_repository_no_match(self, client):
        html = client.get("/lessons?repository=github").text
        assert "No lessons" in html

    def test_repository_select_rendered(self, client):
        html = client.get("/lessons").text
        assert 'name="repository"' in html


# ── /lessons — branch filter ───────────────────────────────────────────────


class TestLessonsBranchFilter:
    def test_branch_main(self, client):
        html = client.get("/lessons?branch=main").text
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" not in html

    def test_branch_feature_fuzzy(self, client):
        html = client.get("/lessons?branch=feature").text
        assert "sqlite_pragma_introspection" in html
        assert "sqlite_upsert_patterns" not in html

    def test_branch_no_match(self, client):
        html = client.get("/lessons?branch=develop").text
        assert "No lessons" in html

    def test_branch_datalist_rendered(self, client):
        html = client.get("/lessons").text
        assert "branch-list" in html
        assert "main" in html


# ── /lessons — commit filter ───────────────────────────────────────────────


class TestLessonsCommitFilter:
    def test_commit_short_hash(self, client):
        html = client.get("/lessons?commit=05f2f86").text
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" not in html

    def test_commit_prefix_of_full_hash(self, client):
        html = client.get("/lessons?commit=f05377").text
        assert "sqlite_pragma_introspection" in html

    def test_commit_middle_of_hash(self, client):
        # fuzzy: substring match anywhere in hash
        html = client.get("/lessons?commit=da02f2").text
        assert "sqlite_pragma_introspection" in html

    def test_commit_no_match(self, client):
        html = client.get("/lessons?commit=deadbeef").text
        assert "No lessons" in html

    def test_commit_datalist_shows_short_hashes(self, client):
        html = client.get("/lessons").text
        assert "commit-list" in html
        # Short hash (7 chars) must appear, not full hash
        assert "05f2f86" in html
        # Full 40-char hash must not appear as a datalist option value
        assert 'value="f0537718da02f2e1a39c47158c04e8cd9f14452d"' not in html


# ── /lessons — combined filters ────────────────────────────────────────────


class TestLessonsCombinedFilters:
    def test_project_and_branch(self, client):
        html = client.get("/lessons?project=devcoach&branch=main").text
        assert "sqlite_upsert_patterns" in html
        assert "sqlite_pragma_introspection" not in html

    def test_project_and_category(self, client):
        html = client.get("/lessons?project=devcoach&category=python").text
        assert "sqlite_upsert_patterns" in html

    def test_all_empty_plus_period_all(self, client):
        html = client.get("/lessons?period=all&category=&project=&branch=&commit=").text
        assert "3 lessons" in html


# ── /lessons/{id} — detail page ───────────────────────────────────────────


class TestLessonDetail:
    def test_returns_200(self, client):
        assert client.get("/lessons/lesson-sqlite-upsert-patterns-001").status_code == 200

    def test_shows_title(self, client):
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        assert "INSERT OR REPLACE" in html

    def test_shows_git_metadata(self, client):
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        assert "devcoach" in html
        assert "main" in html
        assert "05f2f86" in html

    def test_no_metadata_section_when_absent(self, client):
        html = client.get("/lessons/lesson-sqlite3-row-factory-001").text
        # Git metadata row must not render
        assert 'class="text-indigo-400"' not in html  # branch colour

    def test_unknown_id_returns_404(self, client):
        assert client.get("/lessons/nonexistent-id").status_code == 404


# ── / — profile page ──────────────────────────────────────────────────────


class TestProfilePage:
    def test_returns_200(self, client):
        assert client.get("/").status_code == 200

    def test_shows_knowledge_map(self, client):
        html = client.get("/").text
        assert "Knowledge Map" in html


# ── /lessons — starred filter ──────────────────────────────────────────────


class TestLessonsStarredFilter:
    def test_starred_only_returns_one(self, client):
        html = client.get("/lessons?starred=1").text
        assert "INSERT OR REPLACE" in html
        assert "sqlite3.Row" not in html

    def test_no_starred_param_returns_all(self, client):
        html = client.get("/lessons").text
        assert "3 lessons" in html

    def test_starred_toggle_rendered(self, client):
        # Starred is now a hidden input toggled by a pill button
        html = client.get("/lessons").text
        assert 'name="starred"' in html
        assert 'id="h-starred"' in html

    def test_starred_pill_highlighted_when_active(self, client):
        # Starred is now a pill button; when active it carries bg-yellow-400
        html = client.get("/lessons?starred=1").text
        assert "bg-yellow-400" in html

    def test_star_icon_shown_in_table(self, client):
        html = client.get("/lessons").text
        assert "★" in html  # lesson 2 is starred (filled star character)


# ── POST /lessons/{id}/star ────────────────────────────────────────────────


class TestStarEndpoint:
    def test_star_redirects(self, client):
        r = client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"starred": "1", "next": "/lessons"},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_star_sets_on(self, client):
        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"starred": "1", "next": "/lessons"},
        )
        html = client.get("/lessons/lesson-sqlite3-row-factory-001").text
        assert "Unstar" in html

    def test_star_sets_off(self, client):
        client.post(
            "/lessons/lesson-sqlite-upsert-patterns-001/star",
            data={"starred": "0", "next": "/lessons"},
        )
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        assert "Star" in html  # "Star" (not "Unstar")

    def test_star_idempotent(self, client):
        # Starring twice leaves it starred
        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"starred": "1", "next": "/lessons"},
        )
        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"starred": "1", "next": "/lessons"},
        )
        html = client.get("/lessons/lesson-sqlite3-row-factory-001").text
        assert "Unstar" in html

    def test_star_detail_page_button_rendered(self, client):
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        assert "Unstar" in html  # lesson 2 is starred


# ── POST /lessons/{id}/feedback ────────────────────────────────────────────


class TestFeedbackEndpoint:
    def test_feedback_redirects(self, client):
        r = client.post(
            "/lessons/lesson-sqlite3-row-factory-001/feedback",
            data={"feedback": "know", "next": "/lessons/lesson-sqlite3-row-factory-001"},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_feedback_know_shows_active_button(self, client):
        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/feedback",
            data={"feedback": "know", "next": "/lessons/lesson-sqlite3-row-factory-001"},
        )
        html = client.get("/lessons/lesson-sqlite3-row-factory-001").text
        assert "I know this" in html

    def test_feedback_dont_know_shows_active_button(self, client):
        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/feedback",
            data={"feedback": "dont_know", "next": "/lessons/lesson-sqlite3-row-factory-001"},
        )
        html = client.get("/lessons/lesson-sqlite3-row-factory-001").text
        assert "I don't know this" in html

    def test_feedback_know_bumps_knowledge(self, client, db_path):
        import sqlite3 as _sqlite3

        from devcoach.core import db as _db

        # Read baseline confidence for sqlite3_row_factory
        conn = _sqlite3.connect(str(db_path))
        conn.row_factory = _sqlite3.Row
        before = _db.get_all_knowledge(conn).get("sqlite3_row_factory", 5)
        conn.close()

        client.post(
            "/lessons/lesson-sqlite3-row-factory-001/feedback",
            data={"feedback": "know", "next": "/lessons/lesson-sqlite3-row-factory-001"},
        )

        conn = _sqlite3.connect(str(db_path))
        conn.row_factory = _sqlite3.Row
        after = _db.get_all_knowledge(conn).get("sqlite3_row_factory", 5)
        conn.close()

        assert after == before + 1

    def test_feedback_clear_removes_feedback(self, client):
        # upsert_patterns starts with feedback="know"; send "clear" to remove it
        client.post(
            "/lessons/lesson-sqlite-upsert-patterns-001/feedback",
            data={"feedback": "clear", "next": "/lessons/lesson-sqlite-upsert-patterns-001"},
        )
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        # Clear feedback button should be gone
        assert "Clear feedback" not in html

    def test_feedback_rendered_on_detail(self, client):
        # lesson-sqlite-upsert-patterns-001 has feedback="know" → shows badge, not buttons
        html = client.get("/lessons/lesson-sqlite-upsert-patterns-001").text
        assert "I know this" in html  # badge text
        assert "Clear" in html  # clear link shown alongside badge
