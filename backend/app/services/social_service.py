"""Idempotent favorites, purchase-gated reviews, private profile stats."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from app.models import Favorite, Order, OrderItem, Product, Review, User


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
    total = (
        db.scalar(select(func.count(Review.id)).where(Review.product_id == product_id))
        or 0
    )
    rows = list(
        db.scalars(
            select(Review)
            .where(Review.product_id == product_id)
            .options(selectinload(Review.user))
            .order_by(Review.created_at.desc(), Review.id.desc())
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    avg = db.scalar(
        select(func.avg(Review.rating)).where(Review.product_id == product_id)
    )
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
    return review


def get_user_review(db: Session, user: User, product_id: int) -> Review | None:
    return db.scalar(
        select(Review).where(Review.user_id == user.id, Review.product_id == product_id)
    )


def update_review(
    db: Session, review: Review, rating: int | None = None, body: str | None = None
) -> Review:
    if rating is not None:
        review.rating = rating
    if body is not None:
        if not body.strip():
            raise ValueError("Review body must not be empty")
        review.body = body.strip()
    db.flush()
    db.refresh(review)
    return review


def delete_review(db: Session, review: Review) -> None:
    db.delete(review)
    db.flush()


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
