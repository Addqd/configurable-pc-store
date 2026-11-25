"""Normalized, category-scoped product characteristics.

Metadata declarations ONLY. The Alembic revisions are generated, reviewed and
applied by the project owner: never bootstrap these tables with `create_all()` /
`drop_all()`.

Deliberate architecture (do not "fix"):
- Characteristics belong to a **category**, not to a product type: every product
  type inside a category (e.g. different CPU tiers) shares the same definitions.
- `characteristic_options` is an independent dictionary of display-ready string
  values, scoped to one definition. It has no dependency on products and no JSON,
  numeric or unit columns: canonical wording, units and formatting are decided
  when the dictionary is populated.
- `product_characteristics` links a product to one option of one of its own
  definitions. Repeated identical values are stored once with a `quantity`
  (e.g. four identical PCIe 8-pin connectors = one row, quantity 4); single
  values use `quantity = 1`. Distinct options of the same definition get
  separate rows, so no list reconstruction happens in this layer.
- The composite foreign key `(characteristic_id, characteristic_option_id)` ->
  `characteristic_options(characteristic_name_id, id)` is what prevents linking
  an option that belongs to a different characteristic. The database enforces
  it; there is no cross-table CHECK and no trigger.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
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
    # Same reasoning for the value dictionary: an option that is still linked to
    # a product cannot disappear silently.
    options: Mapped[list[CharacteristicOption]] = relationship(
        back_populates="characteristic",
        passive_deletes="all",
    )


class CharacteristicOption(Base):
    """One display-ready value of one characteristic definition.

    Purely a dictionary: it does not reference products and stores no units,
    numbers or JSON. Values are always strings, prepared for display upstream.
    """

    __tablename__ = "characteristic_options"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # RESTRICT: an option disappears only with its own definition and only while
    # no product_characteristics row points at it.
    characteristic_name_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("characteristics.id", ondelete="RESTRICT"),
        nullable=False,
    )
    # 500 characters mirrors the service layer's free-text limit.
    value: Mapped[str] = mapped_column(String(500), nullable=False)

    __table_args__ = (
        # One option per definition value: no duplicate dictionary entries.
        UniqueConstraint(
            "characteristic_name_id",
            "value",
            name="uq_characteristic_options_name_value",
        ),
        # Redundant for uniqueness, required as the referenced key of the
        # composite foreign key in product_characteristics, which is what makes
        # a cross-characteristic option impossible.
        UniqueConstraint(
            "characteristic_name_id",
            "id",
            name="uq_characteristic_options_name_id",
        ),
        CheckConstraint(
            "length(btrim(value)) > 0",
            name="ck_characteristic_options_value_nonempty",
        ),
    )

    characteristic: Mapped[Characteristic] = relationship(back_populates="options")


class ProductCharacteristic(Base):
    """Product/definition/option association with a positive quantity."""

    __tablename__ = "product_characteristics"

    # Composite primary key: no surrogate id, no `position`, one row per
    # product/definition/option triple.
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
    characteristic_option_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")

    __table_args__ = (
        # Composite FK: the option must belong to the association's own
        # characteristic. RESTRICT keeps referenced options alive.
        ForeignKeyConstraint(
            ["characteristic_id", "characteristic_option_id"],
            [
                "characteristic_options.characteristic_name_id",
                "characteristic_options.id",
            ],
            name="fk_product_characteristics_option",
            ondelete="RESTRICT",
        ),
        CheckConstraint(
            "quantity > 0", name="ck_product_characteristics_quantity_positive"
        ),
        # The composite primary key already serves product-oriented access.
        Index("ix_product_characteristics_characteristic_id", "characteristic_id"),
        # Option-oriented lookup and the RESTRICT check on option deletion.
        Index(
            "ix_product_characteristics_characteristic_option_id",
            "characteristic_option_id",
        ),
    )

    product: Mapped[Product] = relationship(back_populates="characteristics")
    characteristic: Mapped[Characteristic] = relationship(back_populates="values")
    # `characteristic_id` is part of the composite FK, so it is also a candidate
    # column of this relationship. It is already written by `characteristic`
    # above; `foreign()` marks only the option id as writable here, which keeps
    # the flush deterministic and avoids a conflicting-columns SAWarning.
    option: Mapped[CharacteristicOption] = relationship(
        primaryjoin=(
            "and_("
            "ProductCharacteristic.characteristic_id"
            " == CharacteristicOption.characteristic_name_id,"
            " foreign(ProductCharacteristic.characteristic_option_id)"
            " == CharacteristicOption.id"
            ")"
        ),
    )
