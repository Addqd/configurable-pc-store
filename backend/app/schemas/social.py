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
    user_id: int
    product_id: int
    rating: int
    body: str
    created_at: datetime
    updated_at: datetime | None = None
    reviewer_name: str


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
