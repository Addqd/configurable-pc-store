"""Pydantic schemas for favorites and reviews API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class FavoriteOut(BaseModel):
    user_id: int
    product_id: int
    product_slug: str
    product_name: str
    created_at: datetime


class FavoriteListOut(BaseModel):
    items: list[FavoriteOut]
    total: int


# ── Reviews ──────────────────────────────────────────────────────────────────


class ReviewOut(BaseModel):
    id: int
    # Administrative reviews have no linked account, so this is nullable.
    user_id: int | None = None
    product_id: int
    rating: int
    body: str
    created_at: datetime
    updated_at: datetime | None = None
    reviewer_name: str
    source: str = "user"
    author_name: str | None = None
    is_published: bool = True
    store_reply: str | None = None
    displayed_at: datetime | None = None


class ReviewCreate(BaseModel):
    rating: int = Field(gt=0, lt=6)
    body: str = Field(min_length=1, max_length=5000)


class ReviewUpdate(BaseModel):
    rating: int | None = Field(default=None, gt=0, lt=6)
    body: str | None = Field(default=None, min_length=1, max_length=5000)


class PaginatedReviewsOut(BaseModel):
    items: list[ReviewOut]
    total: int
    page: int
    page_size: int
    total_pages: int
    average_rating: float
