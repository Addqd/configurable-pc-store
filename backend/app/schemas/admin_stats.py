"""Pydantic contracts for sales and review analytics."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

AdminProductStatsSort = Literal[
    "sold_units_desc",
    "sold_units_asc",
    "revenue_desc",
    "revenue_asc",
    "rating_desc",
    "rating_asc",
    "review_count_desc",
    "review_count_asc",
    "name_asc",
    "name_desc",
    "id_asc",
    "id_desc",
]

#: Time-axis resolution of a timeline. `day` is used when the sales records of a
#: request cover a single calendar month, `month` otherwise.
AdminStatsGranularity = Literal["day", "month"]


class MonthlyPointOut(BaseModel):
    """One time bucket; `month` is the bucket start (a day or a month start)."""

    month: date
    orders_count: int
    units_count: int
    amount: Decimal


class TopSellingProductOut(BaseModel):
    product_id: int | None = None
    name: str
    sku: str | None = None
    units: int
    amount: Decimal


class TopReviewedProductOut(BaseModel):
    product_id: int
    name: str
    sku: str | None = None
    review_count: int
    average_rating: float


class AdminOverviewOut(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    granularity: AdminStatsGranularity = "month"
    completed_orders: int
    sold_units: int
    revenue: Decimal
    review_count: int
    average_rating: float
    monthly: list[MonthlyPointOut] = []
    top_products_by_sales: list[TopSellingProductOut] = []
    top_products_by_reviews: list[TopReviewedProductOut] = []


class AdminProductStatOut(BaseModel):
    id: int
    slug: str
    sku: str | None = None
    name: str
    category: str
    manufacturer: str
    is_active: bool
    sold_units: int = 0
    revenue: Decimal = Decimal("0.00")
    orders_count: int = 0
    review_count: int = 0
    average_rating: float = 0.0


class AdminPaginatedProductStatsOut(BaseModel):
    items: list[AdminProductStatOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class RatingBucketOut(BaseModel):
    rating: int
    count: int


class AdminProductStatsDetailOut(BaseModel):
    product: AdminProductStatOut
    date_from: date | None = None
    date_to: date | None = None
    granularity: AdminStatsGranularity = "month"
    monthly: list[MonthlyPointOut] = []
    rating_distribution: list[RatingBucketOut] = []


class AdminProductTimelineOut(BaseModel):
    product_id: int
    name: str
    sku: str | None = None
    monthly: list[MonthlyPointOut] = []


class AdminComparisonTimelineOut(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    granularity: AdminStatsGranularity = "month"
    series: list[AdminProductTimelineOut] = []
