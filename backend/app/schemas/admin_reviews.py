"""Pydantic contracts for administrative review management."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ReviewStatusFilter = Literal["all", "published", "unpublished"]
ReviewSourceFilter = Literal["all", "user", "admin"]
ReviewSort = Literal[
    "displayed_desc",
    "displayed_asc",
    "created_desc",
    "created_asc",
    "rating_desc",
    "rating_asc",
    "id_desc",
    "id_asc",
]

# Backed by NOT NULL columns: an explicit null is never a valid update value.
_NON_NULLABLE_UPDATE_FIELDS = ("author_name", "rating", "body", "displayed_at")


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class AdminReviewOut(BaseModel):
    id: int
    product_id: int
    product_slug: str
    product_name: str
    user_id: int | None = None
    source: str
    author_name: str | None = None
    reviewer_name: str
    rating: int
    body: str
    is_published: bool
    store_reply: str | None = None
    displayed_at: datetime
    created_at: datetime
    updated_at: datetime


class AdminPaginatedReviewsOut(BaseModel):
    items: list[AdminReviewOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminReviewCreate(BaseModel):
    """Administrative review; only publication state carries a system default."""

    model_config = ConfigDict(extra="forbid")

    author_name: str = Field(min_length=1, max_length=120)
    rating: int = Field(ge=1, le=5)
    body: str = Field(min_length=1, max_length=5000)
    is_published: bool = True
    displayed_at: datetime | None = None
    store_reply: str | None = Field(default=None, max_length=2000)

    @field_validator("author_name", "body")
    @classmethod
    def clean_required_text(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Value must not be blank")
        return cleaned

    @field_validator("store_reply")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

    @field_validator("displayed_at")
    @classmethod
    def normalize_displayed_at(cls, value: datetime | None) -> datetime | None:
        return _as_utc(value)


class AdminReviewUpdate(BaseModel):
    """Partial update: omitted fields stay unchanged, explicit nulls are invalid.

    `author_name`, `rating`, `body` and `displayed_at` are backed by non-nullable
    columns, so an explicit `null` is rejected here (422) instead of reaching the
    database. `store_reply` stays nullable: an administrator may clear it.
    """

    model_config = ConfigDict(extra="forbid")

    author_name: str | None = Field(default=None, min_length=1, max_length=120)
    rating: int | None = Field(default=None, ge=1, le=5)
    body: str | None = Field(default=None, min_length=1, max_length=5000)
    is_published: bool | None = None
    displayed_at: datetime | None = None
    store_reply: str | None = Field(default=None, max_length=2000)

    @field_validator("author_name", "body")
    @classmethod
    def clean_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Value must not be blank")
        return cleaned

    @field_validator("store_reply")
    @classmethod
    def clean_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        return cleaned or None

    @field_validator("displayed_at")
    @classmethod
    def normalize_displayed_at(cls, value: datetime | None) -> datetime | None:
        return _as_utc(value)

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for field in _NON_NULLABLE_UPDATE_FIELDS:
                if field in data and data[field] is None:
                    raise ValueError(f"{field} cannot be null")
        return data
