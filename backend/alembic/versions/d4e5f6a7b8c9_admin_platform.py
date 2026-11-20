"""User roles, review moderation, audit events, specification templates and sales ledger.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8

Requires PostgreSQL. Data seed/backfill are separate scripts (README).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(16), nullable=False, server_default="user"),
    )
    op.add_column(
        "users",
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
    )
    op.add_column("users", sa.Column("blocked_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("blocked_reason", sa.Text()))
    op.create_check_constraint(
        "ck_users_role", "users", "role IN ('user', 'admin', 'owner')"
    )
    op.create_check_constraint(
        "ck_users_status", "users", "status IN ('active', 'blocked')"
    )
    op.create_index("ix_users_role_status", "users", ["role", "status"])

    op.add_column(
        "reviews",
        sa.Column("source", sa.String(16), nullable=False, server_default="user"),
    )
    op.add_column("reviews", sa.Column("author_name", sa.String(120)))
    op.add_column(
        "reviews",
        sa.Column(
            "is_published", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
    )
    op.add_column("reviews", sa.Column("store_reply", sa.Text()))
    # Preserve actual existing dates rather than incorrectly giving old reviews
    # the migration date. Admin can later edit displayed_at, not created_at.
    op.add_column("reviews", sa.Column("displayed_at", sa.DateTime(timezone=True)))
    op.execute("UPDATE reviews SET displayed_at = created_at")
    op.alter_column(
        "reviews",
        "displayed_at",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )
    op.alter_column(
        "reviews",
        "user_id",
        existing_type=sa.BigInteger(),
        nullable=True,
    )
    op.create_check_constraint(
        "ck_reviews_source_author",
        "reviews",
        "(source = 'user' AND user_id IS NOT NULL AND author_name IS NULL) OR "
        "(source = 'admin' AND user_id IS NULL AND author_name IS NOT NULL "
        "AND length(btrim(author_name)) > 0)",
    )
    op.create_check_constraint(
        "ck_reviews_store_reply_nonempty",
        "reviews",
        "store_reply IS NULL OR length(btrim(store_reply)) > 0",
    )
    op.create_index(
        "ix_reviews_product_published_date",
        "reviews",
        ["product_id", "is_published", "displayed_at"],
    )
    # Existing BEFORE trigger can remain, but must also fire if source changes.
    op.execute("DROP TRIGGER trg_reviews_require_purchase ON reviews")
    op.execute("""
        CREATE OR REPLACE FUNCTION enforce_review_purchase() RETURNS trigger AS $$
        BEGIN
            IF NEW.source = 'user' AND NOT EXISTS (
                SELECT 1 FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.user_id = NEW.user_id
                  AND o.status = 'completed_demo'
                  AND oi.kind = 'product'
                  AND oi.product_id = NEW.product_id
            ) THEN
                RAISE EXCEPTION 'A completed purchase of this product is required to review it'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_reviews_require_purchase
        BEFORE INSERT OR UPDATE OF user_id, product_id, source ON reviews
        FOR EACH ROW EXECUTE FUNCTION enforce_review_purchase()
    """)

    op.create_table(
        "product_spec_fields",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "product_type_id",
            sa.BigInteger(),
            sa.ForeignKey("product_types.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column(
            "is_required", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.UniqueConstraint("product_type_id", "code", name="uq_spec_fields_type_code"),
        sa.UniqueConstraint(
            "product_type_id", "sort_order", name="uq_spec_fields_type_order"
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_spec_fields_order_nonnegative"),
        sa.CheckConstraint(
            "length(btrim(label)) > 0", name="ck_spec_fields_label_nonempty"
        ),
    )
    op.create_index("ix_spec_fields_type", "product_spec_fields", ["product_type_id"])
    op.create_table(
        "product_spec_options",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column(
            "field_id",
            sa.BigInteger(),
            sa.ForeignKey("product_spec_fields.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.String(180), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.UniqueConstraint("field_id", "value", name="uq_spec_options_field_value"),
        sa.UniqueConstraint(
            "field_id", "sort_order", name="uq_spec_options_field_order"
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_spec_options_order_nonnegative"),
        sa.CheckConstraint(
            "length(btrim(value)) > 0", name="ck_spec_options_value_nonempty"
        ),
    )
    op.create_index("ix_spec_options_field", "product_spec_options", ["field_id"])

    op.create_table(
        "site_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("event_key", sa.String(160), unique=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        # No FK: deletion of users MUST NOT cascade into this audit table.
        sa.Column("actor_user_id", sa.BigInteger()),
        sa.Column("actor_role", sa.String(16)),
        sa.Column("category", sa.String(24), nullable=False),
        sa.Column("event_type", sa.String(80), nullable=False),
        sa.Column("outcome", sa.String(16), nullable=False),
        sa.Column("target_type", sa.String(32)),
        sa.Column("target_id", sa.BigInteger()),
        sa.Column("reason", sa.Text()),
        sa.Column(
            "details",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.CheckConstraint(
            "category IN ('auth','account','order','build','review','admin','catalog','system')",
            name="ck_site_events_category",
        ),
        sa.CheckConstraint(
            "outcome IN ('success', 'failure')", name="ck_site_events_outcome"
        ),
        sa.CheckConstraint(
            "actor_role IS NULL OR actor_role IN ('user','admin','owner','system')",
            name="ck_site_events_actor_role",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(details) = 'object'", name="ck_site_events_details_object"
        ),
    )
    op.create_index("ix_site_events_occurred", "site_events", ["occurred_at"])
    op.create_index(
        "ix_site_events_category_occurred", "site_events", ["category", "occurred_at"]
    )
    op.create_index(
        "ix_site_events_actor_occurred", "site_events", ["actor_user_id", "occurred_at"]
    )
    op.create_index(
        "ix_site_events_outcome_occurred", "site_events", ["outcome", "occurred_at"]
    )
    op.create_index("ix_site_events_event_type", "site_events", ["event_type"])

    op.create_table(
        "sales_line_facts",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        # Deliberately no FK to order_items/orders/users: cascade deletion is permitted.
        sa.Column("source_order_item_id", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("source_order_id", sa.BigInteger(), nullable=False),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="SET NULL"),
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("sku_snapshot", sa.String(80)),
        sa.Column("name_snapshot", sa.String(255), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("ordered_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('product','custom_build')", name="ck_sales_facts_kind"
        ),
        sa.CheckConstraint("quantity > 0", name="ck_sales_facts_quantity_positive"),
        sa.CheckConstraint(
            "unit_price >= 0 AND line_total >= 0",
            name="ck_sales_facts_amount_nonnegative",
        ),
    )
    op.create_index(
        "ix_sales_facts_product_date", "sales_line_facts", ["product_id", "ordered_at"]
    )
    op.create_index(
        "ix_sales_facts_order_date",
        "sales_line_facts",
        ["source_order_id", "ordered_at"],
    )
    op.create_index("ix_sales_facts_ordered_at", "sales_line_facts", ["ordered_at"])

    op.execute("""
        CREATE FUNCTION capture_sale_line_fact() RETURNS trigger AS $$
        BEGIN
            INSERT INTO sales_line_facts
                (source_order_item_id, source_order_id, product_id, kind,
                 sku_snapshot, name_snapshot, unit_price, quantity, line_total, ordered_at)
            SELECT NEW.id, NEW.order_id, NEW.product_id, NEW.kind,
                   NEW.sku_snapshot, NEW.name_snapshot, NEW.unit_price,
                   NEW.quantity, NEW.line_total, o.created_at
            FROM orders o WHERE o.id = NEW.order_id AND o.status = 'completed_demo'
            ON CONFLICT (source_order_item_id) DO NOTHING;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_order_items_capture_sale
        AFTER INSERT ON order_items
        FOR EACH ROW EXECUTE FUNCTION capture_sale_line_fact()
    """)

    # Views are query baselines. More flexible time/product filtering can be
    # implemented by backend SELECTs on sales_line_facts directly.
    op.execute("""
        CREATE VIEW v_monthly_sales AS
        SELECT date_trunc('month', ordered_at)::date AS month,
               COUNT(DISTINCT source_order_id)::bigint AS orders_count,
               SUM(quantity)::bigint AS units_count,
               SUM(line_total)::numeric(16,2) AS amount
        FROM sales_line_facts
        GROUP BY 1
    """)
    op.execute("""
        CREATE VIEW v_product_sales AS
        SELECT p.id AS product_id, p.name AS product_name, p.sku,
               COALESCE(f.units, 0)::bigint AS sold_units,
               COALESCE(f.amount, 0)::numeric(16,2) AS order_amount,
               COALESCE(r.review_count, 0)::bigint AS review_count,
               COALESCE(r.average_rating, 0)::numeric(3,2) AS average_rating
        FROM products p
        LEFT JOIN (
            SELECT product_id, SUM(quantity) AS units, SUM(line_total) AS amount
            FROM sales_line_facts WHERE kind = 'product'
            GROUP BY product_id
        ) f ON f.product_id = p.id
        LEFT JOIN (
            SELECT product_id, COUNT(*) AS review_count,
                   AVG(rating) AS average_rating
            FROM reviews WHERE is_published = true
            GROUP BY product_id
        ) r ON r.product_id = p.id
    """)


def downgrade() -> None:
    # WARNING: dropping the independent ledger and event journal loses audit/
    # historical data. Only downgrade after backup and explicit approval.
    op.execute("DROP VIEW IF EXISTS v_product_sales")
    op.execute("DROP VIEW IF EXISTS v_monthly_sales")
    op.execute("DROP TRIGGER IF EXISTS trg_order_items_capture_sale ON order_items")
    op.execute("DROP FUNCTION IF EXISTS capture_sale_line_fact()")
    op.drop_table("sales_line_facts")
    op.drop_table("site_events")
    op.drop_table("product_spec_options")
    op.drop_table("product_spec_fields")
    # Admin-authored reviews have NULL user_id; old schema forbids that.
    # Fail rather than silently delete their data on downgrade.
    op.execute("""
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM reviews WHERE user_id IS NULL) THEN
            RAISE EXCEPTION 'Cannot downgrade: admin-authored reviews with NULL user_id exist';
          END IF;
        END $$
    """)
    op.execute("DROP TRIGGER IF EXISTS trg_reviews_require_purchase ON reviews")
    op.execute("""
        CREATE OR REPLACE FUNCTION enforce_review_purchase() RETURNS trigger AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.user_id = NEW.user_id AND o.status = 'completed_demo'
                  AND oi.kind = 'product' AND oi.product_id = NEW.product_id
            ) THEN
                RAISE EXCEPTION 'A completed purchase of this product is required to review it'
                    USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER trg_reviews_require_purchase
        BEFORE INSERT OR UPDATE OF user_id, product_id ON reviews
        FOR EACH ROW EXECUTE FUNCTION enforce_review_purchase()
    """)
    op.drop_index("ix_reviews_product_published_date", table_name="reviews")
    op.drop_constraint("ck_reviews_store_reply_nonempty", "reviews", type_="check")
    op.drop_constraint("ck_reviews_source_author", "reviews", type_="check")
    op.alter_column("reviews", "user_id", existing_type=sa.BigInteger(), nullable=False)
    for col in ("displayed_at", "store_reply", "is_published", "author_name", "source"):
        op.drop_column("reviews", col)
    op.drop_index("ix_users_role_status", table_name="users")
    op.drop_constraint("ck_users_status", "users", type_="check")
    op.drop_constraint("ck_users_role", "users", type_="check")
    for col in ("blocked_reason", "blocked_at", "status", "role"):
        op.drop_column("users", col)
