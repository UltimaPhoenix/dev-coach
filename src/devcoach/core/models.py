"""Pydantic v2 models for devcoach."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, field_serializer, field_validator

# ── Domain type aliases ────────────────────────────────────────────────────

Level = Literal["junior", "mid", "senior"]
RepositoryPlatform = Literal["github", "gitlab", "bitbucket", "local"]
Feedback = Literal["know", "dont_know"]


# ── Models ─────────────────────────────────────────────────────────────────


class Lesson(BaseModel):
    """A coaching lesson delivered to the user."""

    id: str
    timestamp: datetime
    topic_id: str
    categories: list[str]
    title: str
    level: Level
    summary: str
    body: str | None = None
    task_context: str | None = None
    project: str | None = None
    repository: str | None = None
    branch: str | None = None
    commit_hash: str | None = None
    folder: str | None = None
    repository_platform: RepositoryPlatform | None = None
    starred: bool = False
    feedback: Feedback | None = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_and_normalize_timestamp(cls, v: str | datetime) -> datetime:
        """Accept any ISO 8601 string or datetime; always return UTC-aware datetime clamped to now."""
        if isinstance(v, datetime):
            dt = v if v.tzinfo else v.replace(tzinfo=UTC)
        else:
            try:
                dt = datetime.fromisoformat(v)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=UTC)
                dt = dt.astimezone(UTC)
            except ValueError:
                raise ValueError(f"Cannot parse timestamp {v!r} — expected ISO 8601")
        return min(dt, datetime.now(UTC))

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        """Serialize to UTC ISO 8601 string with Z suffix for JSON output."""
        return v.strftime("%Y-%m-%dT%H:%M:%SZ")

    @property
    def timestamp_iso(self) -> str:
        """UTC ISO 8601 string with Z suffix, e.g. '2025-01-15T20:30:00Z'."""
        return self.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")


class KnowledgeEntry(BaseModel):
    """A single topic in the knowledge map."""

    topic: str
    confidence: int  # 0-10


class KnowledgeGroup(BaseModel):
    """A named group containing a list of topic IDs."""

    name: str
    topics: list[str]


class Profile(BaseModel):
    """The user's full knowledge map with group definitions."""

    knowledge: list[KnowledgeEntry]
    groups: list[KnowledgeGroup]


class Settings(BaseModel):
    """Server configuration settings."""

    max_per_day: int = 2
    min_gap_minutes: int = 240  # replaces min_hours_between (4h default)
    ui_theme: Literal["system", "dark", "light"] = "system"


class KnowledgeUpdate(BaseModel):
    """Input for update_knowledge tool."""

    topic: str
    delta: int


class RateLimitResult(BaseModel):
    """Result from the check_rate_limit tool."""

    allowed: bool
    reason: str | None = None
