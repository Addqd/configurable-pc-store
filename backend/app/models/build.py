"""Saved PC configurations and their eight possible component slots."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.catalog import Product
    from app.models.user import User


class SavedBuild(Base):
    __tablename__ = "saved_builds"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(
        String(300), nullable=False, server_default=""
    )
    image_url: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
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
        CheckConstraint(
            "length(btrim(name)) > 0", name="ck_saved_builds_name_nonempty"
        ),
        CheckConstraint("version >= 1", name="ck_saved_builds_version_positive"),
        Index("ix_saved_builds_user_id", "user_id"),
    )

    user: Mapped[User] = relationship(back_populates="saved_builds")
    items: Mapped[list[SavedBuildItem]] = relationship(
        back_populates="build", cascade="all, delete-orphan"
    )


class SavedBuildItem(Base):
    __tablename__ = "saved_build_items"

    build_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("saved_builds.id", ondelete="CASCADE"), primary_key=True
    )
    slot: Mapped[str] = mapped_column(String(16), primary_key=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "slot IN ('cpu','mobo','gpu','ram','storage','psu','case','cooling')",
            name="ck_saved_build_items_slot",
        ),
        Index("ix_saved_build_items_product_id", "product_id"),
    )

    build: Mapped[SavedBuild] = relationship(back_populates="items")
    product: Mapped[Product] = relationship(back_populates="saved_build_items")
