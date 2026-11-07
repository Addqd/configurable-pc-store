"""Favorites and reviews API."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, get_current_user
from app.db.session import get_db_session
from app.schemas.social import (
    FavoriteListOut,
    FavoriteOut,
    PaginatedReviewsOut,
    ReviewCreate,
    ReviewOut,
    ReviewUpdate,
)
from app.services import social_service as social_svc

router = APIRouter(tags=["social"])


# ── Favorites ────────────────────────────────────────────────────────────────


@router.get(
    "/favorites",
    response_model=FavoriteListOut,
    summary="Get user's favorites",
)
def get_favorites(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FavoriteListOut:
    """Get all favorited products for the current user."""
    favorites = social_svc.get_favorites(db, current_user)
    return FavoriteListOut(
        items=[
            FavoriteOut(
                user_id=fav.user_id,
                product_id=fav.product_id,
                product_slug=fav.product.slug if fav.product else "",
                product_name=fav.product.name if fav.product else "",
                created_at=fav.created_at,
            )
            for fav in favorites
        ],
        total=len(favorites),
    )


@router.post(
    "/favorites/{product_id}",
    response_model=FavoriteOut,
    summary="Toggle favorite",
)
def toggle_favorite(
    product_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> FavoriteOut:
    """Toggle a product as favorite (add if absent, remove if present)."""
    fav = social_svc.toggle_favorite(db, current_user, product_id)
    return FavoriteOut(
        user_id=fav.user_id,
        product_id=fav.product_id,
        product_slug=fav.product.slug
        if fav.product and fav.product.id == product_id
        else "",
        product_name=fav.product.name
        if fav.product and fav.product.id == product_id
        else "",
        created_at=fav.created_at,
    )


@router.delete(
    "/favorites/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove favorite",
)
def remove_favorite(
    product_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    """Remove a product from favorites."""
    social_svc.toggle_favorite(db, current_user, product_id)


@router.get(
    "/favorites/{product_id}/is_favorited",
    summary="Check if favorited",
)
def is_favorited(
    product_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict:
    """Check if a product is in user's favorites."""
    return {"is_favorited": social_svc.is_favorite(db, current_user, product_id)}


# ── Reviews ──────────────────────────────────────────────────────────────────


@router.get(
    "/products/{product_id}/reviews",
    response_model=PaginatedReviewsOut,
    summary="Get product reviews",
)
def get_product_reviews(
    product_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db_session),
) -> PaginatedReviewsOut:
    """Get paginated reviews for a product (public)."""

    # Verify product exists
    from app.models import Product

    if not db.get(Product, product_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    result = social_svc.get_product_reviews(db, product_id, page, page_size)

    return PaginatedReviewsOut(
        items=[
            ReviewOut(
                id=r.id,
                user_id=r.user_id,
                product_id=r.product_id,
                rating=r.rating,
                body=r.body,
                created_at=r.created_at,
                updated_at=r.updated_at,
                reviewer_name=r.user.display_name if r.user else "Anonymous",
            )
            for r in result["reviews"]
        ],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        total_pages=result["total_pages"],
        average_rating=result["average_rating"],
    )


@router.post(
    "/products/{product_id}/reviews",
    response_model=ReviewOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a review",
)
def create_review(
    product_id: int,
    body: ReviewCreate,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut:
    """Create a review for a product (requires prior purchase)."""
    from app.models import Product

    if not db.get(Product, product_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    # Check if user already has a review
    existing = social_svc.get_user_review(db, current_user, product_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already reviewed this product",
        )

    try:
        review = social_svc.create_review(
            db, current_user, product_id, body.rating, body.body
        )
    except Exception:
        # The DB trigger may reject if no purchase exists
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A completed purchase of this product is required to review it",
        )

    return ReviewOut(
        id=review.id,
        user_id=review.user_id,
        product_id=review.product_id,
        rating=review.rating,
        body=review.body,
        created_at=review.created_at,
        updated_at=review.updated_at,
        reviewer_name=current_user.display_name,
    )


@router.get(
    "/products/{product_id}/reviews/my",
    response_model=ReviewOut | None,
    summary="Get my review for a product",
)
def get_my_review(
    product_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut | None:
    """Get the current user's review for a product, if any."""
    review = social_svc.get_user_review(db, current_user, product_id)
    if review is None:
        return None
    return ReviewOut(
        id=review.id,
        user_id=review.user_id,
        product_id=review.product_id,
        rating=review.rating,
        body=review.body,
        created_at=review.created_at,
        updated_at=review.updated_at,
        reviewer_name=current_user.display_name,
    )


@router.patch(
    "/products/{product_id}/reviews",
    response_model=ReviewOut,
    summary="Update my review",
)
def update_review(
    product_id: int,
    body: ReviewUpdate,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> ReviewOut:
    """Update the current user's review for a product."""
    review = social_svc.get_user_review(db, current_user, product_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )
    if review.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your review",
        )

    updated = social_svc.update_review(
        db,
        review,
        rating=body.rating,
        body=body.body,
    )

    return ReviewOut(
        id=updated.id,
        user_id=updated.user_id,
        product_id=updated.product_id,
        rating=updated.rating,
        body=updated.body,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
        reviewer_name=current_user.display_name,
    )


@router.delete(
    "/products/{product_id}/reviews",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete my review",
)
def delete_review(
    product_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    """Delete the current user's review for a product."""
    review = social_svc.get_user_review(db, current_user, product_id)
    if review is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found",
        )
    social_svc.delete_review(db, review)


# ── Profile ──────────────────────────────────────────────────────────────────


@router.get(
    "/profile",
    summary="User profile with counters",
)
def get_profile(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict:
    """Get user profile with order and review counters."""
    stats = social_svc.get_profile_stats(db, current_user)
    return {
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
        **stats,
    }
