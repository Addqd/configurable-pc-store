"""Social services: favorites and reviews."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Favorite, Order, Review, User


def get_favorites(db: Session, user: User) -> list[Favorite]:
    """Get all favorites for a user."""
    return list(
        db.scalars(
            select(Favorite)
            .where(Favorite.user_id == user.id)
            .order_by(Favorite.created_at.desc())
        ).all()
    )


def toggle_favorite(
    db: Session,
    user: User,
    product_id: int,
) -> Favorite:
    """Toggle a favorite. Returns the favorite (creates or deletes)."""
    existing = db.execute(
        select(Favorite).where(
            Favorite.user_id == user.id, Favorite.product_id == product_id
        )
    ).scalar_one_or_none()

    if existing:
        db.delete(existing)
        db.flush()
        return existing  # Signal that it was removed
    else:
        fav = Favorite(user_id=user.id, product_id=product_id)
        db.add(fav)
        db.flush()
        db.refresh(fav)
        return fav


def is_favorite(db: Session, user: User, product_id: int) -> bool:
    """Check if a product is favorited by user."""
    count = db.execute(
        select(func.count()).where(
            Favorite.user_id == user.id, Favorite.product_id == product_id
        )
    ).scalar()
    return count is not None and count > 0


def get_product_reviews(
    db: Session,
    product_id: int,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Get paginated reviews for a product."""
    total = (
        db.execute(
            select(func.count(Review.id)).where(Review.product_id == product_id)
        ).scalar()
        or 0
    )

    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, page)

    reviews = (
        db.execute(
            select(Review)
            .where(Review.product_id == product_id)
            .order_by(Review.created_at.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        .scalars()
        .all()
    )

    avg_rating = (
        db.execute(
            select(func.coalesce(func.avg(Review.rating), 0)).where(
                Review.product_id == product_id
            )
        ).scalar()
        or 0
    )

    return {
        "reviews": reviews,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "average_rating": float(avg_rating),
    }


def create_review(
    db: Session,
    user: User,
    product_id: int,
    rating: int,
    body: str,
) -> Review:
    """Create a review. The DB trigger enforces purchase requirement."""
    review = Review(
        user_id=user.id,
        product_id=product_id,
        rating=rating,
        body=body,
    )
    db.add(review)
    db.flush()
    db.refresh(review)
    return review


def get_user_review(
    db: Session,
    user: User,
    product_id: int,
) -> Review | None:
    """Get user's review for a product, if any."""
    return db.execute(
        select(Review).where(Review.user_id == user.id, Review.product_id == product_id)
    ).scalar_one_or_none()


def update_review(
    db: Session,
    review: Review,
    rating: int | None = None,
    body: str | None = None,
) -> Review:
    """Update a review (only by its author)."""
    if rating is not None:
        review.rating = rating
    if body is not None:
        review.body = body
    db.flush()
    db.refresh(review)
    return review


def delete_review(db: Session, review: Review) -> None:
    """Delete a review (only by its author)."""
    db.delete(review)
    db.flush()


def get_profile_stats(db: Session, user: User) -> dict:
    """Get profile counters for a user."""
    order_count = (
        db.execute(
            select(func.count(Order.id)).where(Order.user_id == user.id)
        ).scalar()
        or 0
    )

    review_count = (
        db.execute(
            select(func.count(Review.id)).where(Review.user_id == user.id)
        ).scalar()
        or 0
    )

    favorite_count = (
        db.execute(select(func.count()).where(Favorite.user_id == user.id)).scalar()
        or 0
    )

    return {
        "order_count": order_count,
        "review_count": review_count,
        "favorite_count": favorite_count,
    }
