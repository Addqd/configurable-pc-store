"""One cart per user and immutable snapshots of demo purchases."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.build import SavedBuild
    from app.models.catalog import Product
    from app.models.user import User


class Cart(Base):
    __tablename__ = "carts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
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

    user: Mapped[User] = relationship(back_populates="cart")
    items: Mapped[list[CartItem]] = relationship(
        back_populates="cart", cascade="all, delete-orphan"
    )


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    cart_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    product_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="RESTRICT")
    )
    saved_build_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("saved_builds.id", ondelete="SET NULL")
    )
    build_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
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
        CheckConstraint("quantity > 0", name="ck_cart_items_quantity_positive"),
        CheckConstraint(
            "(kind = 'product' AND product_id IS NOT NULL AND build_snapshot IS NULL) "
            "OR (kind = 'custom_build' AND product_id IS NULL AND build_snapshot IS NOT NULL "
            "AND jsonb_typeof(build_snapshot) = 'object')",
            name="ck_cart_items_kind_payload",
        ),
        UniqueConstraint("cart_id", "product_id", name="uq_cart_items_cart_product"),
        Index("ix_cart_items_cart_id", "cart_id"),
        Index("ix_cart_items_saved_build_id", "saved_build_id"),
    )

    cart: Mapped[Cart] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship(back_populates="cart_items")
    saved_build: Mapped[SavedBuild | None] = relationship()


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, server_default="completed_demo"
    )
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )

    __table_args__ = (
        CheckConstraint("status = 'completed_demo'", name="ck_orders_demo_only"),
        CheckConstraint("total_amount >= 0", name="ck_orders_total_nonnegative"),
        CheckConstraint("item_count > 0", name="ck_orders_item_count_positive"),
        Index("ix_orders_user_created", "user_id", "created_at"),
    )

    user: Mapped[User] = relationship(back_populates="orders")
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    order_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    product_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="RESTRICT")
    )
    saved_build_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("saved_builds.id", ondelete="SET NULL")
    )
    sku_snapshot: Mapped[str | None] = mapped_column(String(80))
    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    image_url_snapshot: Mapped[str | None] = mapped_column(Text)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), Computed("unit_price * quantity", persisted=True), nullable=True
    )
    specs_snapshot: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    components_snapshot: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)

    __table_args__ = (
        CheckConstraint("unit_price >= 0", name="ck_order_items_price_nonnegative"),
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        CheckConstraint(
            "(kind = 'product' AND product_id IS NOT NULL AND components_snapshot IS NULL) "
            "OR (kind = 'custom_build' AND product_id IS NULL AND components_snapshot IS NOT NULL "
            "AND jsonb_typeof(components_snapshot) = 'array')",
            name="ck_order_items_kind_payload",
        ),
        CheckConstraint(
            "jsonb_typeof(specs_snapshot) = 'array'", name="ck_order_items_specs_array"
        ),
        Index("ix_order_items_order_id", "order_id"),
        Index("ix_order_items_product_id", "product_id"),
        Index("ix_order_items_saved_build_id", "saved_build_id"),
    )

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship(back_populates="order_items")
    saved_build: Mapped[SavedBuild | None] = relationship()
