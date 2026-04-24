"""Pydantic v2 models for devcoach."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

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
    task_context: Optional[str] = None
    project: Optional[str] = None
    repository: Optional[str] = None
    branch: Optional[str] = None
    commit_hash: Optional[str] = None
    folder: Optional[str] = None
    repository_platform: Optional[RepositoryPlatform] = None
    starred: bool = False
    feedback: Optional[Feedback] = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_and_normalize_timestamp(cls, v: str | datetime) -> datetime:
        """Accept any ISO 8601 string or datetime; always return UTC-aware datetime."""
        if isinstance(v, datetime):
            return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
        try:
            dt = datetime.fromisoformat(v)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            raise ValueError(f"Cannot parse timestamp {v!r} — expected ISO 8601")

    @field_serializer("timestamp")
    def serialize_timestamp(self, v: datetime) -> str:
        """Serialize to UTC ISO 8601 string with Z suffix for JSON output."""
        return v.strftime("%Y-%m-%dT%H:%M:%SZ")

    @property
    def timestamp_iso(self) -> str:
        """UTC ISO 8601 string with Z suffix, e.g. '2025-01-15T20:30:00Z'."""
        return self.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")


class Profile(BaseModel):
    """The user's full knowledge map."""

    knowledge: dict[str, int]  # topic -> confidence (0-10)


class Settings(BaseModel):
    """Server configuration settings."""

    max_per_day: int = 2
    min_gap_minutes: int = 240  # replaces min_hours_between (4h default)


class KnowledgeUpdate(BaseModel):
    """Input for update_knowledge tool."""

    topic: str
    delta: int


class RateLimitResult(BaseModel):
    """Result from check_rate_limit tool."""

    allowed: bool
    reason: Optional[str] = None
