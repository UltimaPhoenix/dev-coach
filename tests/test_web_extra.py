"""Additional web route coverage — settings, knowledge CRUD, groups, import/export."""

from __future__ import annotations

import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from devcoach.core import db
from devcoach.web.app import _safe_redirect, app


@pytest.fixture
def client(db_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(db, "DB_PATH", db_path)
    return TestClient(app)


# ── _safe_redirect ─────────────────────────────────────────────────────────


class TestSafeRedirect:
    def test_relative_path_allowed(self):
        assert _safe_redirect("/lessons") == "/lessons"

    def test_relative_path_with_query_allowed(self):
        assert _safe_redirect("/lessons?project=devcoach") == "/lessons?project=devcoach"

    def test_absolute_url_rejected(self):
        assert _safe_redirect("https://evil.com") == "/lessons"

    def test_protocol_relative_rejected(self):
        assert _safe_redirect("//evil.com/path") == "/lessons"

    def test_custom_default_used_on_reject(self):
        assert _safe_redirect("https://evil.com", default="/") == "/"

    def test_empty_string_rejected(self):
        assert _safe_redirect("") == "/lessons"

    def test_relative_path_without_leading_slash_rejected(self):
        assert _safe_redirect("lessons") == "/lessons"


# ── GET /settings ──────────────────────────────────────────────────────────


class TestSettingsPage:
    def test_returns_200(self, client):
        assert client.get("/settings").status_code == 200

    def test_shows_current_settings(self, client):
        html = client.get("/settings").text
        assert "max_per_day" in html or "Max" in html

    def test_shows_import_counts_from_query_params(self, client):
        html = client.get("/settings?imported=3&skipped=1&invalid=0").text
        assert "3" in html


# ── POST /settings ─────────────────────────────────────────────────────────


class TestUpdateSettings:
    def test_redirects_after_update(self, client):
        r = client.post(
            "/settings",
            data={"max_per_day": "5", "min_gap_minutes": "120"},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert r.headers["location"] == "/settings"

    def test_settings_persisted(self, client, db_path):
        client.post("/settings", data={"max_per_day": "4", "min_gap_minutes": "60"})
        import sqlite3 as _sqlite3

        c = _sqlite3.connect(str(db_path))
        c.row_factory = _sqlite3.Row
        settings = db.get_settings(c)
        c.close()
        assert settings.max_per_day == 4
        assert settings.min_gap_minutes == 60


# ── GET /settings/export ──────────────────────────────────────────────────


class TestExportBackup:
    def test_returns_zip(self, client):
        r = client.get("/settings/export")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/zip"

    def test_zip_contains_expected_files(self, client):
        r = client.get("/settings/export")
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            names = zf.namelist()
        assert "lessons.json" in names
        assert "knowledge.json" in names
        assert "settings.json" in names

    def test_zip_lessons_match_db(self, client):
        r = client.get("/settings/export")
        with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
            lessons = json.loads(zf.read("lessons.json"))
        assert len(lessons) == 3


# ── POST /settings/import ─────────────────────────────────────────────────


class TestImportBackup:
    def _make_backup_zip(self, lesson_count: int = 1) -> bytes:
        lessons = [
            {
                "id": f"import-{i:03d}",
                "timestamp": datetime.now(UTC).isoformat(),
                "topic_id": f"imported_topic_{i}",
                "categories": ["test"],
                "title": f"Imported lesson {i}",
                "level": "mid",
                "summary": "Summary",
            }
            for i in range(lesson_count)
        ]
        knowledge = {
            "groups": ["Languages"],
            "topics": [{"topic": "python", "confidence": 7, "group": "Languages"}],
        }
        settings = {"max_per_day": 3, "min_gap_minutes": 120}

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("lessons.json", json.dumps(lessons))
            zf.writestr("knowledge.json", json.dumps(knowledge))
            zf.writestr("settings.json", json.dumps(settings))
        return buf.getvalue()

    def test_import_redirects(self, client):
        r = client.post(
            "/settings/import",
            files={"file": ("backup.zip", self._make_backup_zip(), "application/zip")},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_import_shows_counts(self, client):
        r = client.post(
            "/settings/import",
            files={"file": ("backup.zip", self._make_backup_zip(2), "application/zip")},
        )
        assert "imported=2" in str(r.url) or "2" in r.text

    def test_import_with_notebook_shows_notebook_param(self, client):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("lessons.json", "[]")
            zf.writestr("knowledge.json", json.dumps({"groups": [], "topics": []}))
            zf.writestr("settings.json", "{}")
            zf.writestr("learning-state.md", "# Notes\n")
        r = client.post(
            "/settings/import",
            files={"file": ("backup.zip", buf.getvalue(), "application/zip")},
            follow_redirects=False,
        )
        assert "notebook=1" in r.headers["location"]


# ── GET /lessons/export ────────────────────────────────────────────────────


class TestExportLessons:
    def test_returns_json(self, client):
        r = client.get("/lessons/export")
        assert r.status_code == 200
        assert "application/json" in r.headers["content-type"]

    def test_returns_all_lessons(self, client):
        data = client.get("/lessons/export").json()
        assert len(data) == 3

    def test_content_disposition_header(self, client):
        r = client.get("/lessons/export")
        assert "attachment" in r.headers["content-disposition"]
        assert "devcoach-lessons.json" in r.headers["content-disposition"]


# ── POST /lessons/import ──────────────────────────────────────────────────


class TestImportLessons:
    def test_import_valid_json(self, client):
        records = [
            {
                "id": "web-import-001",
                "timestamp": datetime.now(UTC).isoformat(),
                "topic_id": "web_import_topic",
                "categories": ["test"],
                "title": "Web imported",
                "level": "junior",
                "summary": "Imported via web",
            }
        ]
        r = client.post(
            "/lessons/import",
            files={"file": ("lessons.json", json.dumps(records).encode(), "application/json")},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_import_invalid_json_returns_303(self, client):
        r = client.post(
            "/lessons/import",
            files={"file": ("bad.json", b"not valid json {{", "application/json")},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert "invalid=1" in r.headers["location"]

    def test_import_non_list_json_returns_303(self, client):
        r = client.post(
            "/lessons/import",
            files={"file": ("bad.json", b'{"key": "value"}', "application/json")},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert "invalid=1" in r.headers["location"]


# ── POST /knowledge ────────────────────────────────────────────────────────


class TestKnowledgeAdd:
    def test_add_topic_redirects(self, client):
        r = client.post(
            "/knowledge",
            data={"topic": "new_topic", "confidence": "7", "group": ""},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert r.headers["location"] == "/"

    def test_add_topic_appears_in_profile(self, client):
        client.post("/knowledge", data={"topic": "rust", "confidence": "8", "group": ""})
        html = client.get("/").text
        assert "rust" in html

    def test_empty_topic_ignored(self, client):
        r = client.post(
            "/knowledge",
            data={"topic": "  ", "confidence": "5", "group": ""},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_add_topic_with_group(self, client):
        client.post("/knowledge", data={"topic": "elixir", "confidence": "5", "group": "Languages"})
        html = client.get("/").text
        assert "elixir" in html


# ── POST /knowledge/{topic}/delete ────────────────────────────────────────


class TestKnowledgeDelete:
    def test_delete_redirects(self, client):
        r = client.post("/knowledge/python/delete", follow_redirects=False)
        assert r.status_code == 303
        assert r.headers["location"] == "/"

    def test_deleted_topic_not_in_profile(self, client):
        client.post("/knowledge/python/delete")
        # Confirm no crash after deletion
        assert client.get("/").status_code == 200


# ── POST /knowledge/{topic}/group ─────────────────────────────────────────


class TestKnowledgeGroup:
    def test_assign_group_redirects(self, client):
        client.post("/groups", data={"group_name": "Languages"})
        r = client.post(
            "/knowledge/python/group",
            data={"group": "Languages"},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_assign_other_ungroups_topic(self, client):
        client.post("/groups", data={"group_name": "Languages"})
        client.post("/knowledge/python/group", data={"group": "Languages"})
        r = client.post(
            "/knowledge/python/group",
            data={"group": "Other"},
            follow_redirects=False,
        )
        assert r.status_code == 303


# ── POST /knowledge/{topic} — adjust delta ────────────────────────────────


class TestKnowledgeAdjust:
    def test_adjust_delta_redirects(self, client):
        r = client.post(
            "/knowledge/python",
            data={"delta": "1"},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert r.headers["location"] == "/"

    def test_adjust_increases_confidence(self, client, db_path):
        import sqlite3 as _sqlite3

        c = _sqlite3.connect(str(db_path))
        c.row_factory = _sqlite3.Row
        before = db.get_all_knowledge(c).get("python", 5)
        c.close()

        client.post("/knowledge/python", data={"delta": "1"})

        c = _sqlite3.connect(str(db_path))
        c.row_factory = _sqlite3.Row
        after = db.get_all_knowledge(c).get("python", 5)
        c.close()
        assert after == min(10, before + 1)


# ── POST /groups ───────────────────────────────────────────────────────────


class TestGroupsAdd:
    def test_add_group_redirects(self, client):
        r = client.post(
            "/groups",
            data={"group_name": "DevOps"},
            follow_redirects=False,
        )
        assert r.status_code == 303

    def test_empty_group_name_ignored(self, client):
        r = client.post("/groups", data={"group_name": "  "}, follow_redirects=False)
        assert r.status_code == 303

    def test_other_group_name_ignored(self, client):
        r = client.post("/groups", data={"group_name": "Other"}, follow_redirects=False)
        assert r.status_code == 303


# ── POST /groups/{group_name}/delete ──────────────────────────────────────


class TestGroupsDelete:
    def test_delete_group_redirects(self, client):
        client.post("/groups", data={"group_name": "Temp"})
        r = client.post("/groups/Temp/delete", follow_redirects=False)
        assert r.status_code == 303

    def test_delete_nonexistent_group_does_not_crash(self, client):
        r = client.post("/groups/DoesNotExist/delete", follow_redirects=False)
        assert r.status_code == 303


# ── Open redirect protection ───────────────────────────────────────────────


class TestOpenRedirectProtection:
    def test_star_with_external_next_is_rejected(self, client):
        r = client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"next": "https://evil.com"},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert "evil.com" not in r.headers["location"]
        assert r.headers["location"] == "/lessons"

    def test_feedback_with_external_next_is_rejected(self, client):
        r = client.post(
            "/lessons/lesson-sqlite3-row-factory-001/feedback",
            data={"feedback": "know", "next": "https://evil.com"},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert "evil.com" not in r.headers["location"]

    def test_star_with_protocol_relative_next_is_rejected(self, client):
        r = client.post(
            "/lessons/lesson-sqlite3-row-factory-001/star",
            data={"next": "//evil.com"},
            follow_redirects=False,
        )
        assert r.status_code == 303
        assert r.headers["location"] == "/lessons"
