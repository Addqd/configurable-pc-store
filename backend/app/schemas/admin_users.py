"""Pydantic contracts for administrative user management."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

AdminUserSort = Literal[
    "created_desc",
    "created_asc",
    "updated_desc",
    "updated_asc",
    "username_asc",
    "username_desc",
    "display_name_asc",
    "display_name_desc",
    "id_asc",
    "id_desc",
]
AdminRoleFilter = Literal["user", "admin", "owner"]
AdminStatusFilter = Literal["active", "blocked"]


class AdminUserOut(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    avatar_url: str | None = None
    role: str
    status: str
    blocked_at: datetime | None = None
    blocked_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminUserCountersOut(BaseModel):
    orders: int = 0
    reviews: int = 0
    favorites: int = 0
    saved_builds: int = 0


class AdminUserDetailOut(AdminUserOut):
    counters: AdminUserCountersOut = AdminUserCountersOut()


class AdminPaginatedUsersOut(BaseModel):
    items: list[AdminUserOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "admin"] | None = None
    status: Literal["active", "blocked"] | None = None
    blocked_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_transition(self) -> AdminUserUpdate:
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        reason = (self.blocked_reason or "").strip()
        if self.status == "blocked" and not reason:
            raise ValueError("blocked_reason is required when blocking an account")
        if self.status == "active" and reason:
            raise ValueError("blocked_reason is only allowed when blocking")
        if self.status is None and self.blocked_reason is not None and not reason:
            raise ValueError("blocked_reason must not be blank")
        if self.status is None and self.role is None and reason == "":
            raise ValueError("Nothing to update")
        return self


class AdminUserDeleteRequest(BaseModel):
    """Explicit confirmation for the irreversible deletion of an account."""

    model_config = ConfigDict(extra="forbid")

    confirm: Literal[True]
    reason: str | None = Field(default=None, max_length=300)
