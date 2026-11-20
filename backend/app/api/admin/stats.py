"""`/api/v1/admin/stats` — dashboard, product table, timeline and comparison."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import AdminUserDep, DBSessionDep
from app.schemas.admin_stats import (
    AdminComparisonTimelineOut,
    AdminOverviewOut,
    AdminPaginatedProductStatsOut,
    AdminProductStatsDetailOut,
    AdminProductStatsSort,
)
from app.services import analytics_service as svc

router = APIRouter(prefix="/stats", tags=["admin: stats"])


@router.get("/overview", response_model=AdminOverviewOut)
def get_overview(
    db: DBSessionDep,
    admin: AdminUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminOverviewOut:
    return svc.overview(db, date_from=date_from, date_to=date_to)


@router.get("/products", response_model=AdminPaginatedProductStatsOut)
def get_product_stats(
    db: DBSessionDep,
    admin: AdminUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: Annotated[str | None, Query(max_length=64)] = None,
    manufacturer: Annotated[str | None, Query(max_length=120)] = None,
    min_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    max_rating: Annotated[float | None, Query(ge=0, le=5)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: AdminProductStatsSort = "sold_units_desc",
    status_filter: Annotated[
        Literal["all", "active", "inactive"], Query(alias="status")
    ] = "all",
) -> AdminPaginatedProductStatsOut:
    return svc.product_stats(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category=category,
        manufacturer=manufacturer,
        min_rating=min_rating,
        max_rating=max_rating,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        active=status_filter,
    )


@router.get("/timeline", response_model=AdminComparisonTimelineOut)
def get_comparison_timeline(
    db: DBSessionDep,
    admin: AdminUserDep,
    product_ids: Annotated[list[int], Query(min_length=1, max_length=5)],
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminComparisonTimelineOut:
    return svc.comparison_timeline(
        db, product_ids, date_from=date_from, date_to=date_to
    )


@router.get("/products/{product_id}", response_model=AdminProductStatsDetailOut)
def get_product_stats_detail(
    product_id: int,
    db: DBSessionDep,
    admin: AdminUserDep,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminProductStatsDetailOut:
    return svc.product_stats_detail(
        db, product_id, date_from=date_from, date_to=date_to
    )
