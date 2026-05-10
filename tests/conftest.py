"""Shared fixtures for devcoach tests.

Test data mirrors the actual DB produced during devcoach development:
- lesson 1: sqlite3_row_factory          — no git metadata
- lesson 2: sqlite_upsert_patterns       — main branch, short commit hash
- lesson 3: sqlite_pragma_introspection  — feature branch, full commit hash
"""

from __future__ import annotations

import sqlite3
from datetime import date
from pathlib import Path

import pytest

from devcoach.core import db
from devcoach.core.models import Lesson

# Use today's date so period="today" filters always match in tests.
# Times are chosen to be early UTC so they are always in the past regardless of
# when the test suite runs (midnight-edge risk is acceptable for CI).
_TODAY = date.today().isoformat()


# ── Canonical test dataset ─────────────────────────────────────────────────

TEST_LESSONS: list[Lesson] = [
    Lesson(
        id="lesson-sqlite3-row-factory-001",
        timestamp=f"{_TODAY}T00:01:00Z",
        topic_id="sqlite3_row_factory",
        categories=["python", "sqlite", "databases"],
        title="sqlite3.Row: accessing query results by column name",
        level="mid",
        summary="By default sqlite3 returns plain tuples. conn.row_factory = sqlite3.Row gives named access.",
        task_context="Initial devcoach implementation — db.py uses sqlite3.Row throughout",
    ),
    Lesson(
        id="lesson-sqlite-upsert-patterns-001",
        timestamp=f"{_TODAY}T00:02:00Z",
        topic_id="sqlite_upsert_patterns",
        categories=["python", "sqlite", "databases"],
        title="INSERT OR REPLACE vs ON CONFLICT DO UPDATE",
        level="mid",
        summary="INSERT OR REPLACE deletes then re-inserts. ON CONFLICT DO UPDATE is a true partial update.",
        task_context="Building devcoach db.py — two upsert patterns in use",
        project="devcoach",
        repository="UltimaPhoenix/dev-coach",
        branch="main",
        commit_hash="05f2f86abc123456789",
        folder="src/devcoach/core",
        starred=True,
        feedback="know",
    ),
    Lesson(
        id="lesson-sqlite-pragma-introspection-001",
        timestamp=f"{_TODAY}T00:03:00Z",
        topic_id="sqlite_pragma_introspection",
        categories=["python", "sqlite", "databases"],
        title="PRAGMA table_info — zero-dependency schema migrations in SQLite",
        level="mid",
        summary="PRAGMA table_info returns column metadata. Use it for safe idempotent ALTER TABLE migrations.",
        task_context="Added _migrate() to db.py using PRAGMA table_info",
        project="devcoach",
        repository="UltimaPhoenix/dev-coach",
        branch="feature/git-metadata",
        commit_hash="f0537718da02f2e1a39c47158c04e8cd9f14452d",
        folder="src/devcoach/core",
    ),
]


# ── DB fixtures ────────────────────────────────────────────────────────────


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """Path to a temporary SQLite file seeded with TEST_LESSONS."""
    path = tmp_path / "test.db"
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    db.init_schema(conn)
    for lesson in TEST_LESSONS:
        db.insert_lesson(conn, lesson)
    conn.close()
    return path


@pytest.fixture
def conn(db_path: Path) -> sqlite3.Connection:
    """Open connection to the seeded test DB. Closed after the test."""
    c = sqlite3.connect(str(db_path))
    c.row_factory = sqlite3.Row
    yield c
    c.close()
