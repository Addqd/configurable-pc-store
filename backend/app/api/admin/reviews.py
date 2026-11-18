"""`/api/v1/admin/reviews` — review creation, moderation and deletion."""

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AdminUserDep, DBSessionDep
from app.schemas.admin_reviews import (
    AdminPaginatedReviewsOut,
    AdminReviewCreate,
    AdminReviewOut,
    AdminReviewUpdate,
    ReviewSort,
    ReviewSourceFilter,
    ReviewStatusFilter,
)
from app.services import review_admin_service as svc

router = APIRouter(tags=["admin: reviews"])


@router.get("/reviews", response_model=AdminPaginatedReviewsOut)
def list_reviews(
    db: DBSessionDep,
    admin: AdminUserDep,
    product_id: Annotated[int | None, Query(gt=0)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=120)] = None,
    status_filter: Annotated[ReviewStatusFilter, Query(alias="status")] = "all",
    source: ReviewSourceFilter = "all",
    min_rating: Annotated[int | None, Query(ge=1, le=5)] = None,
    max_rating: Annotated[int | None, Query(ge=1, le=5)] = None,
    sort: ReviewSort = "displayed_desc",
) -> AdminPaginatedReviewsOut:
    return svc.list_reviews(
        db,
        product_id=product_id,
        page=page,
        page_size=page_size,
        q=q,
        status=status_filter,
        source=source,
        min_rating=min_rating,
        max_rating=max_rating,
        sort=sort,
    )


@router.post(
    "/products/{product_id}/reviews",
    response_model=AdminReviewOut,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    product_id: int,
    body: AdminReviewCreate,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> AdminReviewOut:
    return svc.create_review(db, admin, product_id, body)


@router.patch("/reviews/{review_id}", response_model=AdminReviewOut)
def update_review(
    review_id: int,
    body: AdminReviewUpdate,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> AdminReviewOut:
    return svc.update_review(db, admin, review_id, body)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_review(review_id: int, db: DBSessionDep, admin: AdminUserDep) -> None:
    svc.delete_review(db, admin, review_id)
