"""Initial PC Builder & Store schema (PostgreSQL 18).

Revision ID: a1b2c3d4e5f6
Revises:

This is intentionally a *manual* Alembic migration. ORM mappings will be
introduced later and must reflect this schema, rather than replacing it.

No real users, orders, reviews or passwords are created by this migration.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


TIMESTAMP = sa.DateTime(timezone=True)
MONEY = sa.Numeric(12, 2)


def _id() -> sa.Column:
    return sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True)


def _created() -> sa.Column:
    return sa.Column(
        "created_at",
        TIMESTAMP,
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


def _updated() -> sa.Column:
    return sa.Column(
        "updated_at",
        TIMESTAMP,
        nullable=False,
        server_default=sa.text("CURRENT_TIMESTAMP"),
    )


def upgrade() -> None:
    # The extension is installed in the current database and shared with any
    # other application using that database. Don't drop it during downgrade.
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        _id(),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("avatar_url", sa.Text()),
        _created(),
        _updated(),
        sa.CheckConstraint("length(btrim(email)) > 0", name="ck_users_email_nonempty"),
        sa.CheckConstraint(
            "length(btrim(username)) > 0 AND position('@' in username) = 0",
            name="ck_users_username_valid",
        ),
    )
    op.execute("CREATE UNIQUE INDEX uq_users_email_ci ON users (lower(email))")
    op.execute("CREATE UNIQUE INDEX uq_users_username_ci ON users (lower(username))")

    op.create_table(
        "auth_sessions",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("refresh_token_hash", sa.String(128), nullable=False, unique=True),
        sa.Column("expires_at", TIMESTAMP, nullable=False),
        sa.Column("revoked_at", TIMESTAMP),
        _created(),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])

    op.create_table(
        "categories",
        _id(),
        sa.Column("slug", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "product_types",
        _id(),
        sa.Column(
            "category_id",
            sa.BigInteger(),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.UniqueConstraint(
            "category_id", "slug", name="uq_product_types_category_slug"
        ),
        sa.UniqueConstraint(
            "category_id", "name", name="uq_product_types_category_name"
        ),
    )
    op.create_index("ix_product_types_category_id", "product_types", ["category_id"])

    op.create_table(
        "manufacturers",
        _id(),
        sa.Column("slug", sa.String(120), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
    )

    op.create_table(
        "products",
        _id(),
        sa.Column(
            "product_type_id",
            sa.BigInteger(),
            sa.ForeignKey("product_types.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "manufacturer_id",
            sa.BigInteger(),
            sa.ForeignKey("manufacturers.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("slug", sa.String(180), nullable=False, unique=True),
        sa.Column("sku", sa.String(80), unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("price", MONEY, nullable=False),
        sa.Column("stock_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("color", sa.String(80)),
        sa.Column("graphics_chip_brand", sa.String(40)),
        sa.Column(
            "spec_lines", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
        ),
        sa.Column(
            "short_specs",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "technical_specs",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("on_sale", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "listed_at",
            sa.Date(),
            nullable=False,
            server_default=sa.text("CURRENT_DATE"),
        ),
        _created(),
        _updated(),
        sa.CheckConstraint("price >= 0", name="ck_products_price_nonnegative"),
        sa.CheckConstraint("stock_quantity >= 0", name="ck_products_stock_nonnegative"),
        sa.CheckConstraint(
            "jsonb_typeof(spec_lines) = 'array'", name="ck_products_spec_lines_array"
        ),
        sa.CheckConstraint(
            "jsonb_typeof(short_specs) = 'array'", name="ck_products_short_specs_array"
        ),
        sa.CheckConstraint(
            "jsonb_typeof(technical_specs) = 'object'",
            name="ck_products_technical_specs_object",
        ),
    )
    op.create_index("ix_products_product_type_id", "products", ["product_type_id"])
    op.create_index("ix_products_manufacturer_id", "products", ["manufacturer_id"])
    op.create_index("ix_products_price", "products", ["price"])
    op.create_index("ix_products_listed_at", "products", ["listed_at"])
    op.execute(
        "CREATE INDEX ix_products_name_trgm ON products USING GIN (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_products_fts ON products USING GIN "
        "(to_tsvector('simple'::regconfig, name || ' ' || description))"
    )

    op.create_table(
        "product_images",
        _id(),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("image_url", sa.Text(), nullable=False),
        sa.Column("alt_text", sa.String(255)),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint(
            "sort_order >= 0", name="ck_product_images_sort_order_nonnegative"
        ),
        sa.UniqueConstraint("product_id", "sort_order", name="uq_product_images_order"),
    )

    op.create_table(
        "favorites",
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        _created(),
    )
    op.create_index("ix_favorites_product_id", "favorites", ["product_id"])

    op.create_table(
        "saved_builds",
        _id(),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("image_url", sa.Text()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        _created(),
        _updated(),
        sa.CheckConstraint(
            "length(btrim(name)) > 0", name="ck_saved_builds_name_nonempty"
        ),
        sa.CheckConstraint("version >= 1", name="ck_saved_builds_version_positive"),
    )
    op.create_index("ix_saved_builds_user_id", "saved_builds", ["user_id"])

    op.create_table(
        "saved_build_items",
        sa.Column(
            "build_id",
            sa.BigInteger(),
            sa.ForeignKey("saved_builds.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("slot", sa.String(16), primary_key=True),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "slot IN ('cpu','mobo','gpu','ram','storage','psu','case','cooling')",
            name="ck_saved_build_items_slot",
        ),
    )
    op.create_index(
        "ix_saved_build_items_product_id", "saved_build_items", ["product_id"]
    )

    op.create_table(
        "carts",
        _id(),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        _created(),
        _updated(),
    )

    op.create_table(
        "cart_items",
        _id(),
        sa.Column(
            "cart_id",
            sa.BigInteger(),
            sa.ForeignKey("carts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "saved_build_id",
            sa.BigInteger(),
            sa.ForeignKey("saved_builds.id", ondelete="SET NULL"),
        ),
        sa.Column("build_snapshot", JSONB()),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        _created(),
        _updated(),
        sa.CheckConstraint("quantity > 0", name="ck_cart_items_quantity_positive"),
        sa.CheckConstraint(
            "(kind = 'product' AND product_id IS NOT NULL AND build_snapshot IS NULL) "
            "OR (kind = 'custom_build' AND product_id IS NULL AND build_snapshot IS NOT NULL "
            "AND jsonb_typeof(build_snapshot) = 'object')",
            name="ck_cart_items_kind_payload",
        ),
        sa.UniqueConstraint("cart_id", "product_id", name="uq_cart_items_cart_product"),
    )
    op.create_index("ix_cart_items_cart_id", "cart_items", ["cart_id"])
    op.create_index("ix_cart_items_saved_build_id", "cart_items", ["saved_build_id"])

    op.create_table(
        "orders",
        _id(),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status", sa.String(24), nullable=False, server_default="completed_demo"
        ),
        sa.Column("total_amount", MONEY, nullable=False),
        sa.Column("item_count", sa.Integer(), nullable=False),
        _created(),
        sa.CheckConstraint("status = 'completed_demo'", name="ck_orders_demo_only"),
        sa.CheckConstraint("total_amount >= 0", name="ck_orders_total_nonnegative"),
        sa.CheckConstraint("item_count > 0", name="ck_orders_item_count_positive"),
    )
    op.create_index("ix_orders_user_created", "orders", ["user_id", "created_at"])

    op.create_table(
        "order_items",
        _id(),
        sa.Column(
            "order_id",
            sa.BigInteger(),
            sa.ForeignKey("orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
        ),
        sa.Column(
            "saved_build_id",
            sa.BigInteger(),
            sa.ForeignKey("saved_builds.id", ondelete="SET NULL"),
        ),
        sa.Column("sku_snapshot", sa.String(80)),
        sa.Column("name_snapshot", sa.String(255), nullable=False),
        sa.Column("image_url_snapshot", sa.Text()),
        sa.Column("unit_price", MONEY, nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column(
            "line_total", MONEY, sa.Computed("unit_price * quantity", persisted=True)
        ),
        sa.Column(
            "specs_snapshot",
            JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("components_snapshot", JSONB()),
        sa.CheckConstraint("unit_price >= 0", name="ck_order_items_price_nonnegative"),
        sa.CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
        sa.CheckConstraint(
            "(kind = 'product' AND product_id IS NOT NULL AND components_snapshot IS NULL) "
            "OR (kind = 'custom_build' AND product_id IS NULL AND components_snapshot IS NOT NULL "
            "AND jsonb_typeof(components_snapshot) = 'array')",
            name="ck_order_items_kind_payload",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(specs_snapshot) = 'array'", name="ck_order_items_specs_array"
        ),
    )
    op.create_index("ix_order_items_order_id", "order_items", ["order_id"])
    op.create_index("ix_order_items_product_id", "order_items", ["product_id"])
    op.create_index("ix_order_items_saved_build_id", "order_items", ["saved_build_id"])

    op.create_table(
        "reviews",
        _id(),
        sa.Column(
            "user_id",
            sa.BigInteger(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.BigInteger(),
            sa.ForeignKey("products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("rating", sa.SmallInteger(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        _created(),
        _updated(),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_reviews_rating_range"),
        sa.CheckConstraint("length(btrim(body)) > 0", name="ck_reviews_body_nonempty"),
        sa.UniqueConstraint("user_id", "product_id", name="uq_reviews_user_product"),
    )
    op.create_index("ix_reviews_product_id", "reviews", ["product_id"])

    # Enforce the agreed purchase-before-review rule even for direct SQL writes.
    # A custom build's internal components are NOT individually eligible here;
    # only an explicitly purchased catalog product qualifies.
    op.execute("""
        CREATE FUNCTION enforce_review_purchase() RETURNS trigger AS $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM order_items oi
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
        BEFORE INSERT OR UPDATE OF user_id, product_id ON reviews
        FOR EACH ROW EXECUTE FUNCTION enforce_review_purchase()
    """)


def downgrade() -> None:
    # Destructive: downgrade removes all application tables and their contents.
    # Never run downgrade against a database whose data you need to preserve.
    op.execute("DROP TRIGGER IF EXISTS trg_reviews_require_purchase ON reviews")
    op.execute("DROP FUNCTION IF EXISTS enforce_review_purchase()")
    for table in (
        "reviews",
        "order_items",
        "orders",
        "cart_items",
        "carts",
        "saved_build_items",
        "saved_builds",
        "favorites",
        "product_images",
        "products",
        "manufacturers",
        "product_types",
        "categories",
        "auth_sessions",
        "users",
    ):
        op.drop_table(table)
    # pg_trgm is intentionally left installed; it may be shared with other apps.
