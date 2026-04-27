"""Pydantic v2 models for devcoach."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal, TypedDict

from pydantic import BaseModel, field_serializer, field_validator, model_serializer

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
        """Accept any ISO 8601 string or datetime; always return UTC-aware datetime."""
        if isinstance(v, datetime):
            return v if v.tzinfo else v.replace(tzinfo=UTC)
        try:
            dt = datetime.fromisoformat(v)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=UTC)
            return dt.astimezone(UTC)
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


class TopicScore(TypedDict):
    topic: str
    confidence: int


class CoachStats(TypedDict):
    total_lessons: int
    lessons_today: int
    lessons_this_week: int
    weakest_topics: list[TopicScore]
    strongest_topics: list[TopicScore]


class GitContext(TypedDict):
    project: str | None
    repository: str | None
    branch: str | None
    commit_hash: str | None
    folder: str | None
    repository_platform: str | None


class WorkspaceContext(TypedDict):
    git: GitContext
    usage_defaults: dict[str, str | None]


class OnboardingStatus(TypedDict):
    needs_onboarding: bool
    detected_stack: dict[str, int]
    context_ready: bool


class RateLimitResult(BaseModel):
    """Result from the check_rate_limit tool."""

    allowed: bool
    reason: str | None = None

    @model_serializer
    def _serialize(self) -> dict:
        return {
            k: v
            for k, v in {"allowed": self.allowed, "reason": self.reason}.items()
            if v is not None
        }
