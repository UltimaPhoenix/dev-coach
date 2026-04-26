"""Additional db.py coverage — backup/restore, groups, settings, filters."""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta

import pytest

from devcoach.core import db
from devcoach.core.models import Lesson

# ── Helpers ────────────────────────────────────────────────────────────────


def _make_lesson(**kwargs) -> Lesson:
    defaults = dict(
        id="lesson-extra-001",
        timestamp=datetime.now(UTC).isoformat(),
        topic_id="extra_topic",
        categories=["test"],
        title="Extra lesson",
        level="mid",
        summary="Extra summary",
    )
    defaults.update(kwargs)
    return Lesson(**defaults)


# ── get_usage_defaults ─────────────────────────────────────────────────────


class TestGetUsageDefaults:
    def test_returns_most_used_project(self, conn):
        defaults = db.get_usage_defaults(conn)
        assert defaults["project"] == "devcoach"  # 2 lessons vs 0

    def test_returns_none_for_missing_column(self, conn):
        # repository_platform not set on any test lesson
        defaults = db.get_usage_defaults(conn)
        assert defaults["repository_platform"] is None

    def test_returns_most_common_branch(self, conn):
        defaults = db.get_usage_defaults(conn)
        # "main" appears once, "feature/git-metadata" once → either is valid; just not None
        assert defaults["branch"] is not None

    def test_returns_all_keys(self, conn):
        defaults = db.get_usage_defaults(conn)
        assert set(defaults.keys()) == {"project", "repository", "branch", "repository_platform"}


# ── is_onboarding_complete ─────────────────────────────────────────────────


class TestIsOnboardingComplete:
    def test_false_by_default(self, conn):
        assert db.is_onboarding_complete(conn) is False

    def test_true_after_setting(self, conn):
        db.set_setting(conn, "onboarding_completed", "1")
        assert db.is_onboarding_complete(conn) is True

    def test_false_when_value_is_zero(self, conn):
        db.set_setting(conn, "onboarding_completed", "0")
        assert db.is_onboarding_complete(conn) is False


# ── get_distinct_column allowlist ──────────────────────────────────────────


class TestGetDistinctColumnAllowlist:
    def test_raises_on_disallowed_column(self, conn):
        with pytest.raises(ValueError, match="not allowed"):
            db.get_distinct_column(conn, "title")

    def test_raises_on_injection_attempt(self, conn):
        with pytest.raises(ValueError):
            db.get_distinct_column(conn, "project; DROP TABLE lessons--")

    def test_allowed_columns_work(self, conn):
        for col in ("project", "repository", "branch", "commit_hash", "repository_platform"):
            result = db.get_distinct_column(conn, col)
            assert isinstance(result, list)


# ── date_from / date_to filters ────────────────────────────────────────────


class TestDateFilters:
    def test_date_from_includes_today(self, conn):
        today = datetime.now(UTC).date().isoformat()
        lessons = db.get_lessons(conn, date_from=today)
        assert len(lessons) == 3

    def test_date_to_excludes_future(self, conn):
        yesterday = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
        lessons = db.get_lessons(conn, date_to=yesterday)
        assert len(lessons) == 0

    def test_date_to_no_time_defaults_to_end_of_day(self, conn):
        tomorrow = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()
        lessons = db.get_lessons(conn, date_to=tomorrow)
        assert len(lessons) == 3

    def test_date_from_and_to_range(self, conn):
        today = datetime.now(UTC).date().isoformat()
        tomorrow = (datetime.now(UTC) + timedelta(days=1)).date().isoformat()
        lessons = db.get_lessons(conn, date_from=today, date_to=tomorrow)
        assert len(lessons) == 3


# ── feedback filter ────────────────────────────────────────────────────────


class TestFeedbackFilter:
    def test_filter_feedback_none(self, conn):
        # Two lessons have no feedback
        lessons = db.get_lessons(conn, feedback="none")
        assert len(lessons) == 2

    def test_filter_feedback_know(self, conn):
        lessons = db.get_lessons(conn, feedback="know")
        assert len(lessons) == 1
        assert lessons[0].topic_id == "sqlite_upsert_patterns"


# ── export / import lessons ────────────────────────────────────────────────


class TestExportImportLessons:
    def test_export_returns_all(self, conn):
        records = db.export_lessons(conn)
        assert len(records) == 3
        assert all(isinstance(r, dict) for r in records)

    def test_export_contains_expected_fields(self, conn):
        records = db.export_lessons(conn)
        assert "id" in records[0]
        assert "title" in records[0]

    def test_import_inserts_new(self, tmp_path):
        path = tmp_path / "import.db"
        c = sqlite3.connect(str(path))
        c.row_factory = sqlite3.Row
        db.init_schema(c)
        records = [
            {
                "id": "import-001",
                "timestamp": datetime.now(UTC).isoformat(),
                "topic_id": "imported_topic",
                "categories": ["test"],
                "title": "Imported",
                "level": "mid",
                "summary": "Imported summary",
            }
        ]
        inserted, duplicated, invalid = db.import_lessons(c, records)
        assert inserted == 1
        assert duplicated == 0
        assert invalid == 0
        c.close()

    def test_import_skips_duplicates(self, conn):
        records = db.export_lessons(conn)
        inserted, duplicated, invalid = db.import_lessons(conn, records)
        assert inserted == 0
        assert duplicated == 3

    def test_import_rejects_invalid_records(self, conn):
        bad_records = [{"id": "bad", "missing_required_fields": True}]
        inserted, duplicated, invalid = db.import_lessons(conn, bad_records)
        assert invalid == 1
        assert inserted == 0


# ── backup / restore ──────────────────────────────────────────────────────


class TestBackupRestore:
    def test_backup_returns_bytes(self, conn):
        data = db.create_backup_zip(conn)
        assert isinstance(data, bytes)
        assert len(data) > 0

    def test_backup_is_valid_zip(self, conn):
        import io
        import zipfile

        data = db.create_backup_zip(conn)
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            assert "lessons.json" in zf.namelist()
            assert "knowledge.json" in zf.namelist()
            assert "settings.json" in zf.namelist()

    def test_restore_round_trip(self, conn, tmp_path):
        data = db.create_backup_zip(conn)
        path = tmp_path / "restore.db"
        c = sqlite3.connect(str(path))
        c.row_factory = sqlite3.Row
        db.init_schema(c)
        result = db.restore_backup_zip(c, data)
        assert result["lessons"] == 3
        assert result["settings"] == 1
        restored = db.get_lessons(c)
        assert len(restored) == 3
        c.close()

    def test_restore_skips_duplicates(self, conn):
        data = db.create_backup_zip(conn)
        result = db.restore_backup_zip(conn, data)
        assert result["skipped"] == 3

    def test_restore_knowledge_groups(self, conn):
        # Use "python" — it's in DEFAULT_PROFILE so it exists in the knowledge table
        db.add_group(conn, "Languages")
        db.assign_topic_to_group(conn, "python", "Languages")
        data = db.create_backup_zip(conn)

        import io
        import zipfile

        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            knowledge = json.loads(zf.read("knowledge.json"))
        groups = [t.get("group") for t in knowledge["topics"] if t.get("topic") == "python"]
        assert "Languages" in groups


# ── knowledge groups ───────────────────────────────────────────────────────


class TestKnowledgeGroups:
    def test_add_group(self, conn):
        db.add_group(conn, "Languages")
        groups = db.get_knowledge_groups(conn)
        assert "Languages" in groups

    def test_add_group_empty_name_raises(self, conn):
        with pytest.raises(ValueError):
            db.add_group(conn, "   ")

    def test_delete_group(self, conn):
        db.add_group(conn, "ToDelete")
        db.delete_group(conn, "ToDelete")
        groups = db.get_knowledge_groups(conn)
        assert "ToDelete" not in groups

    def test_assign_topic_to_group(self, conn):
        db.add_group(conn, "Databases")
        db.assign_topic_to_group(conn, "sqlite3_row_factory", "Databases")
        groups = db.get_knowledge_groups(conn)
        assert "sqlite3_row_factory" in groups["Databases"]

    def test_assign_creates_group_if_missing(self, conn):
        db.assign_topic_to_group(conn, "sqlite3_row_factory", "AutoCreated")
        groups = db.get_knowledge_groups(conn)
        assert "AutoCreated" in groups

    def test_unassign_topic_moves_to_other(self, conn):
        db.add_group(conn, "Databases")
        db.assign_topic_to_group(conn, "sqlite3_row_factory", "Databases")
        db.unassign_topic_from_group(conn, "sqlite3_row_factory")
        groups = db.get_knowledge_groups(conn)
        assert "sqlite3_row_factory" not in groups.get("Databases", [])

    def test_delete_knowledge_clears_group_assignment(self, conn):
        db.add_group(conn, "Databases")
        db.assign_topic_to_group(conn, "sqlite3_row_factory", "Databases")
        db.delete_knowledge(conn, "sqlite3_row_factory")
        groups = db.get_knowledge_groups(conn)
        assert "sqlite3_row_factory" not in groups.get("Databases", [])

    def test_get_knowledge_group_list(self, conn):
        db.add_group(conn, "Languages")
        db.assign_topic_to_group(conn, "sqlite3_row_factory", "Languages")
        group_list = db.get_knowledge_group_list(conn)
        names = [g.name for g in group_list]
        assert "Languages" in names

    def test_empty_group_included_in_list(self, conn):
        db.add_group(conn, "EmptyGroup")
        groups = db.get_knowledge_groups(conn)
        assert "EmptyGroup" in groups
        assert groups["EmptyGroup"] == []


# ── settings ───────────────────────────────────────────────────────────────


class TestSettings:
    def test_get_settings_returns_defaults(self, conn):
        settings = db.get_settings(conn)
        assert settings.max_per_day == 2
        assert settings.min_gap_minutes == 240

    def test_set_setting_updates_value(self, conn):
        db.set_setting(conn, "max_per_day", "5")
        settings = db.get_settings(conn)
        assert settings.max_per_day == 5

    def test_get_settings_migrates_old_min_hours_between(self, conn):
        # Simulate a pre-migration DB that has min_hours_between instead of min_gap_minutes
        conn.execute("DELETE FROM settings WHERE key = 'min_gap_minutes'")
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES ('min_hours_between', '3')"
        )
        conn.commit()
        settings = db.get_settings(conn)
        assert settings.min_gap_minutes == 180  # 3 hours * 60


# ── get_all_categories ────────────────────────────────────────────────────


class TestGetAllCategories:
    def test_returns_sorted_unique_categories(self, conn):
        cats = db.get_all_categories(conn)
        assert cats == sorted(set(cats))
        assert "python" in cats
        assert "sqlite" in cats
        assert "databases" in cats

    def test_no_duplicates(self, conn):
        cats = db.get_all_categories(conn)
        assert len(cats) == len(set(cats))


# ── get_taught_topic_ids ──────────────────────────────────────────────────


class TestGetTaughtTopicIds:
    def test_returns_all_topic_ids(self, conn):
        topics = db.get_taught_topic_ids(conn)
        assert set(topics) == {
            "sqlite3_row_factory",
            "sqlite_upsert_patterns",
            "sqlite_pragma_introspection",
        }


# ── count_lessons_since / get_last_lesson_timestamp ───────────────────────


class TestCountAndTimestamp:
    def test_count_lessons_since_epoch(self, conn):
        count = db.count_lessons_since(conn, "2000-01-01T00:00:00+00:00")
        assert count == 3

    def test_count_lessons_since_future(self, conn):
        count = db.count_lessons_since(conn, "2099-01-01T00:00:00+00:00")
        assert count == 0

    def test_get_last_lesson_timestamp(self, conn):
        ts = db.get_last_lesson_timestamp(conn)
        assert ts is not None
        assert "17:30:00" in ts  # latest lesson in conftest

    def test_get_last_lesson_timestamp_empty(self, tmp_path):
        path = tmp_path / "empty.db"
        c = sqlite3.connect(str(path))
        c.row_factory = sqlite3.Row
        db.init_schema(c)
        assert db.get_last_lesson_timestamp(c) is None
        c.close()


# ── period cutoffs ────────────────────────────────────────────────────────


class TestPeriodCutoffs:
    def test_period_week_returns_results(self, conn):
        lessons = db.get_lessons(conn, period="week")
        assert len(lessons) == 3

    def test_period_month_returns_results(self, conn):
        lessons = db.get_lessons(conn, period="month")
        assert len(lessons) == 3

    def test_period_year_returns_results(self, conn):
        lessons = db.get_lessons(conn, period="year")
        assert len(lessons) == 3

    def test_unknown_period_returns_all(self, conn):
        lessons = db.get_lessons(conn, period="forever")
        assert len(lessons) == 3


# ── sort / order ──────────────────────────────────────────────────────────


class TestSortOrder:
    def test_sort_asc(self, conn):
        lessons = db.get_lessons(conn, sort="timestamp", order="asc")
        timestamps = [lesson.timestamp for lesson in lessons]
        assert timestamps == sorted(timestamps)

    def test_sort_by_level(self, conn):
        lessons = db.get_lessons(conn, sort="level", order="asc")
        assert isinstance(lessons, list)

    def test_invalid_sort_column_falls_back_to_timestamp(self, conn):
        lessons = db.get_lessons(conn, sort="INVALID_COL")
        assert len(lessons) == 3

    def test_pagination(self, conn):
        page1 = db.get_lessons(conn, page=1, per_page=2)
        page2 = db.get_lessons(conn, page=2, per_page=2)
        assert len(page1) == 2
        assert len(page2) == 1
        ids1 = {lesson.id for lesson in page1}
        ids2 = {lesson.id for lesson in page2}
        assert ids1.isdisjoint(ids2)
