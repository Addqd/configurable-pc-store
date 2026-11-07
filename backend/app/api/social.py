"""Versioned, owner-scoped favorites, purchase-gated reviews, and profile."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models import Product, Review, User
from app.schemas.social import (
    FavoriteListOut,
    FavoriteOut,
    PaginatedReviewsOut,
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
)
from app.services import social_service as svc

router = APIRouter(prefix="/api/v1", tags=["social"])


def _favorite(fav) -> FavoriteOut:
    return FavoriteOut(
        user_id=fav.user_id,
        product_id=fav.product_id,
        product_slug=fav.product.slug if fav.product else "",
        product_name=fav.product.name if fav.product else "",
        created_at=fav.created_at,
    )


def _review(r: Review) -> ReviewOut:
    return ReviewOut(
        id=r.id,
        user_id=r.user_id,
        product_id=r.product_id,
        rating=r.rating,
        body=r.body,
        created_at=r.created_at,
        updated_at=r.updated_at,
        reviewer_name=r.user.display_name if r.user else "Anonymous",
    )


@router.get("/favorites", response_model=FavoriteListOut)
def get_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FavoriteListOut:
    favorites = svc.get_favorites(db, current_user)
    return FavoriteListOut(
        items=[_favorite(fav) for fav in favorites], total=len(favorites)
    )


@router.post("/favorites/{product_id}", response_model=FavoriteOut)
def add_favorite(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FavoriteOut:
    try:
        return _favorite(svc.add_favorite(db, current_user, product_id))
    except ValueError:
        raise HTTPException(status_code=404, detail="Product not found") from None


@router.delete("/favorites/{product_id}", status_code=204)
def remove_favorite(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    svc.remove_favorite(db, current_user, product_id)


@router.get("/favorites/{product_id}/is_favorited")
def is_favorited(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict:
    return {"is_favorited": svc.is_favorite(db, current_user, product_id)}


@router.get("/products/{product_id}/reviews", response_model=PaginatedReviewsOut)
def get_product_reviews(
    product_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db_session),
) -> PaginatedReviewsOut:
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    result = svc.get_product_reviews(db, product_id, page, page_size)
    return PaginatedReviewsOut(
        items=[_review(r) for r in result["reviews"]],
        total=result["total"],
        page=page,
        page_size=page_size,
        total_pages=result["total_pages"],
        average_rating=result["average_rating"],
    )


@router.post(
    "/products/{product_id}/reviews", response_model=ReviewOut, status_code=201
)
def create_review(
    product_id: int,
    body: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut:
    if db.get(Product, product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found")
    try:
        return _review(
            svc.create_review(db, current_user, product_id, body.rating, body.body)
        )
    except ValueError as exc:
        message = str(exc)
        code = (
            409
            if "already" in message.lower()
            else 403
            if "purchase" in message.lower()
            else 422
        )
        raise HTTPException(status_code=code, detail=message) from exc
    except IntegrityError:
        # DB trigger or UNIQUE guard. Never report arbitrary SQL failures as success.
        raise HTTPException(
            status_code=409, detail="Review not allowed or already exists"
        ) from None


@router.get("/products/{product_id}/reviews/my", response_model=ReviewOut | None)
def get_my_review(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut | None:
    review = svc.get_user_review(db, current_user, product_id)
    return _review(review) if review else None


@router.patch("/products/{product_id}/reviews", response_model=ReviewOut)
def update_review(
    product_id: int,
    body: ReviewUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut:
    review = svc.get_user_review(db, current_user, product_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    try:
        return _review(svc.update_review(db, review, body.rating, body.body))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/products/{product_id}/reviews", status_code=204)
def delete_review(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    review = svc.get_user_review(db, current_user, product_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    svc.delete_review(db, review)


@router.get("/profile")
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict:
    result = {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "display_name": current_user.display_name,
        "avatar_url": current_user.avatar_url,
        "created_at": current_user.created_at.isoformat()
        if current_user.created_at
        else None,
        "updated_at": current_user.updated_at.isoformat()
        if current_user.updated_at
        else None,
    }
    result.update(svc.get_profile_stats(db, current_user))
    return result
