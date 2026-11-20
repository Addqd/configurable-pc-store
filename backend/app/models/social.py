"""Favorites and post-purchase product reviews."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.catalog import Product
    from app.models.user import User


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (Index("ix_favorites_product_id", "product_id"),)

    user: Mapped[User] = relationship(back_populates="favorites")
    product: Mapped[Product] = relationship(back_populates="favorites")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # Admin-authored reviews have no user account; the migration made this
    # column nullable and ck_reviews_source_author pairs it with `source`.
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    rating: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, server_default="user"
    )
    author_name: Mapped[str | None] = mapped_column(String(120))
    is_published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    store_reply: Mapped[str | None] = mapped_column(Text)
    # Publication date shown in the UI. Separate from created_at, which an admin
    # never edits.
    displayed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),
        CheckConstraint("length(btrim(body)) > 0", name="ck_reviews_body_nonempty"),
        UniqueConstraint("user_id", "product_id", name="uq_reviews_user_product"),
        CheckConstraint(
            "(source = 'user' AND user_id IS NOT NULL AND author_name IS NULL) OR "
            "(source = 'admin' AND user_id IS NULL AND author_name IS NOT NULL "
            "AND length(btrim(author_name)) > 0)",
            name="ck_reviews_source_author",
        ),
        CheckConstraint(
            "store_reply IS NULL OR length(btrim(store_reply)) > 0",
            name="ck_reviews_store_reply_nonempty",
        ),
        Index("ix_reviews_product_id", "product_id"),
        Index(
            "ix_reviews_product_published_date",
            "product_id",
            "is_published",
            "displayed_at",
        ),
    )

    # Existing PostgreSQL trigger trg_reviews_require_purchase enforces purchase.
    user: Mapped[User | None] = relationship(back_populates="reviews")
    product: Mapped[Product] = relationship(back_populates="reviews")
