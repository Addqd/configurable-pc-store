"""Normalized, category-scoped product characteristics.

Metadata declarations ONLY. The applied PostgreSQL schema has no
`characteristics` / `product_characteristics` tables yet: the Alembic revision
is generated, reviewed and applied by the project owner. Never bootstrap these
tables with `create_all()` / `drop_all()`.

Deliberate architecture (do not "fix"):
- Characteristics belong to a **category**, not to a product type: every product
  type inside a category (e.g. different CPU tiers) shares the same definitions.
- `product_characteristics.value` is JSONB because one definition can hold a
  string, a number, a boolean, a string list or a number list. Lists keep their
  order and duplicate entries (e.g. repeated power connectors), and numbers are
  never stringified. Values are written by assignment; this column has no
  mutable tracker, so mutating a loaded list in place is not detected.
- A CHECK constraint cannot compare the value with `characteristics.data_type`
  (other table), so this module intentionally declares no cross-table rule and
  no triggers. Type/category validation belongs to the future service layer.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Identity,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.catalog import Category, Product

# Mirrored by ck_characteristics_data_type; the service layer validates values.
CHARACTERISTIC_DATA_TYPES = (
    "string",
    "number",
    "boolean",
    "string_list",
    "number_list",
)


class Characteristic(Base):
    __tablename__ = "characteristics"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # RESTRICT: a category that still defines characteristics cannot be deleted.
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    data_type: Mapped[str] = mapped_column(String(24), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    show_in_short: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    show_in_details: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )

    __table_args__ = (
        UniqueConstraint(
            "category_id", "code", name="uq_characteristics_category_code"
        ),
        CheckConstraint(
            "data_type IN ('string','number','boolean','string_list','number_list')",
            name="ck_characteristics_data_type",
        ),
        CheckConstraint(
            "sort_order >= 0", name="ck_characteristics_sort_order_nonnegative"
        ),
        CheckConstraint(
            "length(btrim(code)) > 0", name="ck_characteristics_code_nonempty"
        ),
        CheckConstraint(
            "length(btrim(name)) > 0", name="ck_characteristics_name_nonempty"
        ),
        Index("ix_characteristics_category_id", "category_id"),
    )

    category: Mapped[Category] = relationship(back_populates="characteristics")
    # RESTRICT on the FK keeps definitions that products already use. No ORM
    # delete cascade and passive_deletes="all": without it SQLAlchemy would
    # null out product_characteristics.characteristic_id, which is part of that
    # table's primary key. PostgreSQL must reject the deletion instead.
    values: Mapped[list[ProductCharacteristic]] = relationship(
        back_populates="characteristic",
        passive_deletes="all",
    )


class ProductCharacteristic(Base):
    __tablename__ = "product_characteristics"

    # Composite primary key: no surrogate id, one row per product/definition.
    product_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    characteristic_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("characteristics.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "value <> 'null'::jsonb",
            name="ck_product_characteristics_value_not_null",
        ),
        # The composite primary key already serves product-oriented access.
        Index("ix_product_characteristics_characteristic_id", "characteristic_id"),
    )

    product: Mapped[Product] = relationship(back_populates="characteristics")
    characteristic: Mapped[Characteristic] = relationship(back_populates="values")
