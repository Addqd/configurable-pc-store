"""Pydantic contracts for the administrative event journal."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

AdminEventCategory = Literal[
    "auth", "account", "order", "build", "review", "admin", "catalog", "system"
]
AdminEventOutcome = Literal["success", "failure"]
AdminEventSort = Literal["occurred_desc", "occurred_asc"]


class AdminEventOut(BaseModel):
    id: int
    event_key: str | None = None
    occurred_at: datetime
    actor_user_id: int | None = None
    actor_role: str | None = None
    # Resolved by the endpoint from `users.username`, falling back to the
    # historical snapshot stored in `details` for accounts that no longer exist.
    # Optional on purpose: the row is never rejected when the lookup misses.
    actor_username: str | None = None
    category: str
    event_type: str
    outcome: str
    target_type: str | None = None
    target_id: int | None = None
    reason: str | None = None
    details: dict[str, Any] = {}


class AdminPaginatedEventsOut(BaseModel):
    items: list[AdminEventOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminEventFilterOptionsOut(BaseModel):
    categories: list[str] = []
    event_types: list[str] = []
    outcomes: list[str] = []
