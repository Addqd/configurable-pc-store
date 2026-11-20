"""Idempotent favorites, purchase-gated reviews, private profile stats."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.models import Favorite, Order, OrderItem, Product, Review, User
from app.services import event_service


def get_favorites(db: Session, user: User) -> list[Favorite]:
    return list(
        db.scalars(
            select(Favorite)
            .where(Favorite.user_id == user.id)
            .options(selectinload(Favorite.product))
            .order_by(Favorite.created_at.desc())
        ).all()
    )


def add_favorite(db: Session, user: User, product_id: int) -> Favorite:
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise ValueError("Product not found")
    db.execute(
        insert(Favorite)
        .values(user_id=user.id, product_id=product_id)
        .on_conflict_do_nothing(index_elements=["user_id", "product_id"])
    )
    favorite = db.get(Favorite, (user.id, product_id))
    if favorite is None:
        raise RuntimeError("Unable to add favorite")
    return favorite


def remove_favorite(db: Session, user: User, product_id: int) -> None:
    existing = db.get(Favorite, (user.id, product_id))
    if existing is not None:
        db.delete(existing)
        db.flush()


def toggle_favorite(db: Session, user: User, product_id: int) -> Favorite:
    # Kept only as a compatibility alias for the POST endpoint. POST means add,
    # never toggle: double clicks/retries must not undo a favorite.
    return add_favorite(db, user, product_id)


def is_favorite(db: Session, user: User, product_id: int) -> bool:
    return db.get(Favorite, (user.id, product_id)) is not None


def get_product_reviews(
    db: Session, product_id: int, page: int = 1, page_size: int = 20
) -> dict:
    # Public listings only expose published reviews; administrative drafts stay
    # visible to the moderation UI only.
    published = (Review.product_id == product_id, Review.is_published.is_(True))
    total = db.scalar(select(func.count(Review.id)).where(*published)) or 0
    rows = list(
        db.scalars(
            select(Review)
            .where(*published)
            .options(selectinload(Review.user))
            .order_by(Review.displayed_at.desc(), Review.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    avg = db.scalar(select(func.avg(Review.rating)).where(*published))
    return {
        "reviews": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "average_rating": float(avg or 0),
    }


def has_purchased_product(db: Session, user: User, product_id: int) -> bool:
    # Components contained inside a custom build never count as a purchase.
    return (
        db.scalar(
            select(OrderItem.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(
                Order.user_id == user.id,
                Order.status == "completed_demo",
                OrderItem.product_id == product_id,
                OrderItem.kind == "product",
            )
            .limit(1)
        )
        is not None
    )


def create_review(
    db: Session, user: User, product_id: int, rating: int, body: str
) -> Review:
    if not has_purchased_product(db, user, product_id):
        raise ValueError("A completed purchase of this product is required")
    if get_user_review(db, user, product_id):
        raise ValueError("You already reviewed this product")
    if not body.strip():
        raise ValueError("Review body must not be empty")
    review = Review(
        user_id=user.id, product_id=product_id, rating=rating, body=body.strip()
    )
    db.add(review)
    db.flush()  # PostgreSQL purchase trigger and uniqueness are enforced here.
    db.refresh(review)
    event_service.record_event(
        db,
        category=event_service.CATEGORY_REVIEW,
        event_type="review.created",
        actor=user,
        target_type="review",
        target_id=review.id,
        details={"product_id": product_id, "rating": rating},
    )
    return review


def get_user_review(db: Session, user: User, product_id: int) -> Review | None:
    return db.scalar(
        select(Review).where(Review.user_id == user.id, Review.product_id == product_id)
    )


def update_review(
    db: Session,
    review: Review,
    rating: int | None = None,
    body: str | None = None,
    actor: User | None = None,
) -> Review:
    changed = False
    if rating is not None and rating != review.rating:
        review.rating = rating
        changed = True
    if body is not None:
        cleaned = body.strip()
        if not cleaned:
            raise ValueError("Review body must not be empty")
        if cleaned != review.body:
            review.body = cleaned
            changed = True
    if changed:
        review.updated_at = datetime.now(UTC)
    db.flush()
    if changed:
        event_service.record_event(
            db,
            category=event_service.CATEGORY_REVIEW,
            event_type="review.updated",
            actor=actor,
            target_type="review",
            target_id=review.id,
            details={"product_id": review.product_id, "rating": review.rating},
        )
    db.refresh(review)
    return review


def delete_review(db: Session, review: Review, actor: User | None = None) -> None:
    snapshot = {"product_id": review.product_id, "rating": review.rating}
    review_id = review.id
    db.delete(review)
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_REVIEW,
        event_type="review.deleted",
        actor=actor,
        target_type="review",
        target_id=review_id,
        details=snapshot,
    )


def get_profile_stats(db: Session, user: User) -> dict:
    return {
        "order_count": db.scalar(
            select(func.count(Order.id)).where(Order.user_id == user.id)
        )
        or 0,
        "review_count": db.scalar(
            select(func.count(Review.id)).where(Review.user_id == user.id)
        )
        or 0,
        "favorite_count": db.scalar(
            select(func.count())
            .select_from(Favorite)
            .where(Favorite.user_id == user.id)
        )
        or 0,
    }
