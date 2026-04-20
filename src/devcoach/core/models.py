"""Pydantic v2 models for devcoach."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class Lesson(BaseModel):
    """A coaching lesson delivered to the user."""

    id: str
    timestamp: str  # ISO 8601
    topic_id: str
    categories: list[str]
    title: str
    level: Literal["junior", "mid", "senior"]
    summary: str
    task_context: Optional[str] = None
    project: Optional[str] = None
    repository: Optional[str] = None
    branch: Optional[str] = None
    commit_hash: Optional[str] = None
    folder: Optional[str] = None
    starred: bool = False
    feedback: Optional[str] = None  # "know" | "dont_know" | None


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
