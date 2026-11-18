"""Review administration and moderation.

Customer review content is owned by the customer: an administrator may publish,
unpublish, reply and re-date it, but may only edit author/rating/body on
administratively authored reviews. Every change is journaled.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Product, Review, User
from app.schemas.admin_reviews import (
    AdminPaginatedReviewsOut,
    AdminReviewCreate,
    AdminReviewOut,
    AdminReviewUpdate,
)
from app.services import event_service
from app.services.errors import InvalidInputError, NotFoundError
from app.services.sql_utils import like_pattern

SORT_ORDERS: dict[str, tuple[Any, ...]] = {
    "displayed_desc": (Review.displayed_at.desc(), Review.id.desc()),
    "displayed_asc": (Review.displayed_at.asc(), Review.id.asc()),
    "created_desc": (Review.created_at.desc(), Review.id.desc()),
    "created_asc": (Review.created_at.asc(), Review.id.asc()),
    "rating_desc": (Review.rating.desc(), Review.displayed_at.desc(), Review.id.desc()),
    "rating_asc": (Review.rating.asc(), Review.displayed_at.desc(), Review.id.asc()),
    "id_desc": (Review.id.desc(),),
    "id_asc": (Review.id.asc(),),
}
DEFAULT_SORT = "displayed_desc"

_CONTENT_FIELDS = frozenset({"author_name", "rating", "body"})


def reviewer_name(review: Review) -> str:
    if review.source == "admin":
        return review.author_name or "Anonymous"
    if review.user is not None:
        return review.user.display_name
    return "Anonymous"


def serialize(review: Review) -> AdminReviewOut:
    return AdminReviewOut(
        id=review.id,
        product_id=review.product_id,
        product_slug=review.product.slug if review.product else "",
        product_name=review.product.name if review.product else "",
        user_id=review.user_id,
        source=review.source,
        author_name=review.author_name,
        reviewer_name=reviewer_name(review),
        rating=review.rating,
        body=review.body,
        is_published=review.is_published,
        store_reply=review.store_reply,
        displayed_at=review.displayed_at,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def _load_review(db: Session, review_id: int) -> Review:
    review = db.scalar(
        select(Review)
        .where(Review.id == review_id)
        .options(joinedload(Review.product), joinedload(Review.user))
    )
    if review is None:
        raise NotFoundError("Review not found")
    return review


def list_reviews(
    db: Session,
    *,
    product_id: int | None = None,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    status: str = "all",
    source: str = "all",
    min_rating: int | None = None,
    max_rating: int | None = None,
    sort: str = DEFAULT_SORT,
) -> AdminPaginatedReviewsOut:
    statement = select(Review.id).outerjoin(User, User.id == Review.user_id)
    if product_id is not None:
        statement = statement.where(Review.product_id == product_id)
    if status == "published":
        statement = statement.where(Review.is_published.is_(True))
    elif status == "unpublished":
        statement = statement.where(Review.is_published.is_(False))
    if source in ("user", "admin"):
        statement = statement.where(Review.source == source)
    if min_rating is not None:
        statement = statement.where(Review.rating >= min_rating)
    if max_rating is not None:
        statement = statement.where(Review.rating <= max_rating)
    if q and q.strip():
        pattern = like_pattern(q)
        statement = statement.where(
            or_(
                Review.body.ilike(pattern, escape="\\"),
                Review.author_name.ilike(pattern, escape="\\"),
                User.display_name.ilike(pattern, escape="\\"),
            )
        )
    total = int(db.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    order_by = SORT_ORDERS.get(sort, SORT_ORDERS[DEFAULT_SORT])
    ids = list(
        db.scalars(
            statement.order_by(*order_by)
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    rows: dict[int, Review] = {}
    if ids:
        loaded = db.scalars(
            select(Review)
            .where(Review.id.in_(ids))
            .options(joinedload(Review.product), selectinload(Review.user))
        ).all()
        rows = {review.id: review for review in loaded}
    return AdminPaginatedReviewsOut(
        items=[serialize(rows[rid]) for rid in ids if rid in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


def create_review(
    db: Session, actor: User, product_id: int, data: AdminReviewCreate
) -> AdminReviewOut:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError("Product not found")
    review = Review(
        user_id=None,
        product_id=product.id,
        rating=data.rating,
        body=data.body,
        source="admin",
        author_name=data.author_name,
        is_published=data.is_published,
        store_reply=data.store_reply,
        # Explicit backend default: "now" when the administrator omits the date.
        displayed_at=data.displayed_at or datetime.now(UTC),
    )
    db.add(review)
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_REVIEW,
        event_type="review.admin_created",
        actor=actor,
        target_type="review",
        target_id=review.id,
        details={"product_id": product.id, "rating": review.rating},
    )
    return serialize(review)


def update_review(
    db: Session, actor: User, review_id: int, data: AdminReviewUpdate
) -> AdminReviewOut:
    review = _load_review(db, review_id)
    provided = data.model_fields_set
    if review.source != "admin" and provided & _CONTENT_FIELDS:
        raise InvalidInputError(
            "Customer review content cannot be edited; only publication, "
            "display date and shop reply are modifiable"
        )
    changed: list[str] = []
    if "author_name" in provided and data.author_name != review.author_name:
        # SQLAlchemy's optional `Mapped[str | None]` attribute is seen by mypy as
        # a descriptor union; the runtime type is `str | None`.
        review.author_name = data.author_name  # type: ignore[assignment]
        changed.append("author_name")
    if "rating" in provided and data.rating != review.rating:
        review.rating = data.rating  # type: ignore[assignment]
        changed.append("rating")
    if "body" in provided and data.body != review.body:
        review.body = data.body  # type: ignore[assignment]
        changed.append("body")
    if "displayed_at" in provided and data.displayed_at != review.displayed_at:
        review.displayed_at = data.displayed_at  # type: ignore[assignment]
        changed.append("displayed_at")
    if "store_reply" in provided and data.store_reply != review.store_reply:
        review.store_reply = data.store_reply
        changed.append("store_reply")
    if (
        "is_published" in provided
        and data.is_published is not None
        and data.is_published != review.is_published
    ):
        review.is_published = data.is_published
        changed.append("is_published")

    if not changed:
        return serialize(review)

    review.updated_at = datetime.now(UTC)
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_REVIEW,
        event_type="review.moderation_changed"
        if "is_published" in changed
        else "review.admin_updated",
        actor=actor,
        target_type="review",
        target_id=review.id,
        details={
            "product_id": review.product_id,
            "changed_fields": changed,
            "is_published": review.is_published,
        },
    )
    return serialize(review)


def delete_review(db: Session, actor: User, review_id: int) -> None:
    review = _load_review(db, review_id)
    snapshot = {
        "product_id": review.product_id,
        "source": review.source,
        "rating": review.rating,
    }
    db.delete(review)
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_REVIEW,
        event_type="review.admin_deleted",
        actor=actor,
        target_type="review",
        target_id=review_id,
        details=snapshot,
    )
