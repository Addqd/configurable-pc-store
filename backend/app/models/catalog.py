"""Product catalog models, including existing indexes and validations."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict, MutableList
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.build import SavedBuildItem
    from app.models.cart_order import CartItem, OrderItem
    from app.models.social import Favorite, Review


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    product_types: Mapped[list[ProductType]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )


class ProductType(Base):
    __tablename__ = "product_types"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)

    __table_args__ = (
        UniqueConstraint("category_id", "slug", name="uq_product_types_category_slug"),
        UniqueConstraint("category_id", "name", name="uq_product_types_category_name"),
        Index("ix_product_types_category_id", "category_id"),
    )

    category: Mapped[Category] = relationship(back_populates="product_types")
    products: Mapped[list[Product]] = relationship(back_populates="product_type")


class Manufacturer(Base):
    __tablename__ = "manufacturers"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)

    products: Mapped[list[Product]] = relationship(back_populates="manufacturer")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product_types.id", ondelete="RESTRICT"), nullable=False
    )
    manufacturer_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("manufacturers.id", ondelete="RESTRICT"), nullable=False
    )
    slug: Mapped[str] = mapped_column(String(180), nullable=False, unique=True)
    sku: Mapped[str | None] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    stock_quantity: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    color: Mapped[str | None] = mapped_column(String(80))
    graphics_chip_brand: Mapped[str | None] = mapped_column(String(40))
    spec_lines: Mapped[list[str]] = mapped_column(
        MutableList.as_mutable(JSONB),
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    short_specs: Mapped[list[str]] = mapped_column(
        MutableList.as_mutable(JSONB),
        nullable=False,
        server_default=text("'[]'::jsonb"),
    )
    technical_specs: Mapped[dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSONB),
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    on_sale: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    listed_at: Mapped[date] = mapped_column(
        Date, nullable=False, server_default=text("CURRENT_DATE")
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
        CheckConstraint("price >= 0", name="ck_products_price_nonnegative"),
        CheckConstraint("stock_quantity >= 0", name="ck_products_stock_nonnegative"),
        CheckConstraint(
            "jsonb_typeof(spec_lines) = 'array'", name="ck_products_spec_lines_array"
        ),
        CheckConstraint(
            "jsonb_typeof(short_specs) = 'array'", name="ck_products_short_specs_array"
        ),
        CheckConstraint(
            "jsonb_typeof(technical_specs) = 'object'",
            name="ck_products_technical_specs_object",
        ),
        Index("ix_products_product_type_id", "product_type_id"),
        Index("ix_products_manufacturer_id", "manufacturer_id"),
        Index("ix_products_price", "price"),
        Index("ix_products_listed_at", "listed_at"),
    )

    product_type: Mapped[ProductType] = relationship(back_populates="products")
    manufacturer: Mapped[Manufacturer] = relationship(back_populates="products")
    images: Mapped[list[ProductImage]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    favorites: Mapped[list[Favorite]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    reviews: Mapped[list[Review]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )
    cart_items: Mapped[list[CartItem]] = relationship(back_populates="product")
    order_items: Mapped[list[OrderItem]] = relationship(
        back_populates="product", passive_deletes="all"
    )
    saved_build_items: Mapped[list[SavedBuildItem]] = relationship(
        back_populates="product", passive_deletes="all"
    )


# Two PostgreSQL-specific expression indexes created by the initial migration.
# These are metadata declarations ONLY: importing them does not alter the DB.
Index(
    "ix_products_name_trgm",
    Product.__table__.c.name,
    postgresql_using="gin",
    postgresql_ops={"name": "gin_trgm_ops"},
)
Index(
    "ix_products_fts",
    func.to_tsvector(
        text("'simple'::regconfig"),
        Product.__table__.c.name + " " + Product.__table__.c.description,
    ),
    postgresql_using="gin",
)


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    image_url: Mapped[str] = mapped_column(Text, nullable=False)
    alt_text: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    __table_args__ = (
        CheckConstraint(
            "sort_order >= 0", name="ck_product_images_sort_order_nonnegative"
        ),
        UniqueConstraint("product_id", "sort_order", name="uq_product_images_order"),
    )

    product: Mapped[Product] = relationship(back_populates="images")
