"""Admin platform tables added by Alembic revision d4e5f6a7b8c9.

These four tables back the specification templates, the audit event journal and
the independent sales ledger. They mirror the applied PostgreSQL schema listed in
`alembic/versions/d4e5f6a7b8c9_admin_platform.py`.

Deliberate architecture (do not "fix"):
- `site_events.actor_user_id` has NO foreign key to `users`, so audit events
  survive account deletion.
- `sales_line_facts` has no foreign keys to users, orders or order items;
  only `product_id` references `products` with ON DELETE SET NULL.
- `v_monthly_sales` / `v_product_sales` are PostgreSQL views, not ORM tables.
Row population (sale captures, purchase-gated reviews) is done by database
triggers created in the same migration; nothing here re-creates them.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
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
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductSpecField(Base):
    __tablename__ = "product_spec_fields"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    product_type_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("product_types.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )

    __table_args__ = (
        UniqueConstraint("product_type_id", "code", name="uq_spec_fields_type_code"),
        UniqueConstraint(
            "product_type_id",
            "sort_order",
            name="uq_spec_fields_type_order",
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="ck_spec_fields_order_nonnegative",
        ),
        CheckConstraint(
            "length(btrim(label)) > 0",
            name="ck_spec_fields_label_nonempty",
        ),
        Index("ix_spec_fields_type", "product_type_id"),
    )


class ProductSpecOption(Base):
    __tablename__ = "product_spec_options"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    field_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("product_spec_fields.id", ondelete="CASCADE"),
        nullable=False,
    )
    value: Mapped[str] = mapped_column(String(180), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("field_id", "value", name="uq_spec_options_field_value"),
        UniqueConstraint("field_id", "sort_order", name="uq_spec_options_field_order"),
        CheckConstraint("sort_order >= 0", name="ck_spec_options_order_nonnegative"),
        CheckConstraint(
            "length(btrim(value)) > 0",
            name="ck_spec_options_value_nonempty",
        ),
        Index("ix_spec_options_field", "field_id"),
    )


class SiteEvent(Base):
    __tablename__ = "site_events"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    event_key: Mapped[str | None] = mapped_column(String(160), unique=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    # No FK on purpose: deleting a user must not erase the audit journal.
    actor_user_id: Mapped[int | None] = mapped_column(BigInteger)
    actor_role: Mapped[str | None] = mapped_column(String(16))
    category: Mapped[str] = mapped_column(String(24), nullable=False)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[int | None] = mapped_column(BigInteger)
    reason: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(
        MutableDict.as_mutable(JSONB),
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('auth','account','order','build','review','admin','catalog','system')",
            name="ck_site_events_category",
        ),
        CheckConstraint(
            "outcome IN ('success', 'failure')",
            name="ck_site_events_outcome",
        ),
        CheckConstraint(
            "actor_role IS NULL OR actor_role IN ('user','admin','owner','system')",
            name="ck_site_events_actor_role",
        ),
        CheckConstraint(
            "jsonb_typeof(details) = 'object'",
            name="ck_site_events_details_object",
        ),
        Index("ix_site_events_occurred", "occurred_at"),
        Index("ix_site_events_category_occurred", "category", "occurred_at"),
        Index("ix_site_events_actor_occurred", "actor_user_id", "occurred_at"),
        Index("ix_site_events_outcome_occurred", "outcome", "occurred_at"),
        Index("ix_site_events_event_type", "event_type"),
    )


class SaleLineFact(Base):
    __tablename__ = "sales_line_facts"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    # Deliberately not a foreign key: order items may be deleted afterwards and
    # the historical ledger must stay intact (the trigger inserts it once).
    source_order_item_id: Mapped[int] = mapped_column(
        BigInteger, nullable=False, unique=True
    )
    source_order_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    product_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    sku_snapshot: Mapped[str | None] = mapped_column(String(80))
    name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    ordered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('product','custom_build')",
            name="ck_sales_facts_kind",
        ),
        CheckConstraint(
            "quantity > 0",
            name="ck_sales_facts_quantity_positive",
        ),
        CheckConstraint(
            "unit_price >= 0 AND line_total >= 0",
            name="ck_sales_facts_amount_nonnegative",
        ),
        Index("ix_sales_facts_product_date", "product_id", "ordered_at"),
        Index("ix_sales_facts_order_date", "source_order_id", "ordered_at"),
        Index("ix_sales_facts_ordered_at", "ordered_at"),
    )
