"""Metadata-only ORM checks for the schema of Alembic revision d4e5f6a7b8c9.

These tests inspect `Base.metadata` directly, so they need no database
connection and never modify data. The applied migration file is the source of
truth for every expected name, type, default and constraint.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import configure_mappers

from app.db.base import Base
from app.models import (
    Review,
    SaleLineFact,
    SiteEvent,
    User,
)

PLATFORM_TABLES = (
    "site_events",
    "sales_line_facts",
)


def _table(name: str):
    return Base.metadata.tables[name]


def _default_text(column) -> str | None:
    """Return the SQL text of a column's server default, if any."""
    default = column.server_default
    if default is None:
        return None
    argument = default.arg
    return getattr(argument, "text", argument)


def _check_names(table) -> set[str]:
    return {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, CheckConstraint) and constraint.name
    }


def _check_sql(table, name: str) -> str:
    for constraint in table.constraints:
        if isinstance(constraint, CheckConstraint) and constraint.name == name:
            return str(constraint.sqltext)
    raise AssertionError(f"CHECK constraint {name!r} is not declared")


def _unique_names(table) -> set[str]:
    return {
        constraint.name
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint) and constraint.name
    }


def _index_names(table) -> set[str]:
    return {index.name for index in table.indexes}


def _index_columns(table, name: str) -> list[str]:
    for index in table.indexes:
        if index.name == name:
            return [column.name for column in index.columns]
    raise AssertionError(f"index {name!r} is not declared")


# ── Registration ─────────────────────────────────────────────────────────────


def test_platform_tables_are_registered_on_shared_metadata() -> None:
    for name in PLATFORM_TABLES:
        assert name in Base.metadata.tables, name
    assert Base.metadata.tables["site_events"] is SiteEvent.__table__
    assert Base.metadata.tables["sales_line_facts"] is SaleLineFact.__table__
    # The legacy specification template tables were dropped by the applied
    # migration and must never come back in the ORM metadata.
    assert "product_spec_fields" not in Base.metadata.tables
    assert "product_spec_options" not in Base.metadata.tables


def test_every_mapped_table_is_registered_exactly_once() -> None:
    configure_mappers()
    mapped = [mapper.local_table.name for mapper in Base.registry.mappers]
    assert len(mapped) == len(set(mapped))
    assert set(mapped) == set(Base.metadata.tables)


def test_database_views_are_not_registered_as_tables() -> None:
    assert "v_monthly_sales" not in Base.metadata.tables
    assert "v_product_sales" not in Base.metadata.tables


# ── Columns / types / nullability ────────────────────────────────────────────


def test_platform_table_columns() -> None:
    assert set(_table("site_events").c.keys()) == {
        "id",
        "event_key",
        "occurred_at",
        "actor_user_id",
        "actor_role",
        "category",
        "event_type",
        "outcome",
        "target_type",
        "target_id",
        "reason",
        "details",
    }
    assert set(_table("sales_line_facts").c.keys()) == {
        "id",
        "source_order_item_id",
        "source_order_id",
        "product_id",
        "kind",
        "sku_snapshot",
        "name_snapshot",
        "unit_price",
        "quantity",
        "line_total",
        "ordered_at",
    }


def test_user_and_review_columns_match_migration() -> None:
    assert set(_table("users").c.keys()) == {
        "id",
        "email",
        "username",
        "display_name",
        "password_hash",
        "avatar_url",
        "created_at",
        "updated_at",
        "role",
        "status",
        "blocked_at",
        "blocked_reason",
    }
    assert set(_table("reviews").c.keys()) == {
        "id",
        "user_id",
        "product_id",
        "rating",
        "body",
        "source",
        "author_name",
        "is_published",
        "store_reply",
        "displayed_at",
        "created_at",
        "updated_at",
    }


def test_user_role_and_status_columns() -> None:
    users = _table("users")
    assert isinstance(users.c.role.type, String)
    assert users.c.role.type.length == 16
    assert users.c.role.nullable is False
    assert isinstance(users.c.status.type, String)
    assert users.c.status.type.length == 16
    assert users.c.status.nullable is False
    assert isinstance(users.c.blocked_at.type, DateTime)
    assert users.c.blocked_at.type.timezone is True
    assert users.c.blocked_at.nullable is True
    assert isinstance(users.c.blocked_reason.type, Text)
    assert users.c.blocked_reason.nullable is True


def test_review_columns_added_by_migration() -> None:
    reviews = _table("reviews")
    assert reviews.c.user_id.nullable is True
    assert isinstance(reviews.c.source.type, String)
    assert reviews.c.source.type.length == 16
    assert reviews.c.source.nullable is False
    assert isinstance(reviews.c.author_name.type, String)
    assert reviews.c.author_name.type.length == 120
    assert reviews.c.author_name.nullable is True
    assert isinstance(reviews.c.is_published.type, Boolean)
    assert reviews.c.is_published.nullable is False
    assert isinstance(reviews.c.store_reply.type, Text)
    assert reviews.c.store_reply.nullable is True
    assert isinstance(reviews.c.displayed_at.type, DateTime)
    assert reviews.c.displayed_at.type.timezone is True
    assert reviews.c.displayed_at.nullable is False


def test_platform_column_types_and_nullability() -> None:
    events = _table("site_events")
    assert isinstance(events.c.event_key.type, String)
    assert events.c.event_key.type.length == 160
    assert events.c.event_key.nullable is True
    assert isinstance(events.c.actor_user_id.type, BigInteger)
    assert events.c.actor_user_id.nullable is True
    assert isinstance(events.c.actor_role.type, String)
    assert events.c.actor_role.type.length == 16
    assert isinstance(events.c.category.type, String)
    assert events.c.category.type.length == 24
    assert isinstance(events.c.event_type.type, String)
    assert events.c.event_type.type.length == 80
    assert isinstance(events.c.outcome.type, String)
    assert events.c.outcome.type.length == 16
    assert isinstance(events.c.target_type.type, String)
    assert events.c.target_type.type.length == 32
    assert isinstance(events.c.target_id.type, BigInteger)
    assert isinstance(events.c.reason.type, Text)
    assert isinstance(events.c.details.type, JSONB)
    assert events.c.details.nullable is False
    assert isinstance(events.c.occurred_at.type, DateTime)
    assert events.c.occurred_at.type.timezone is True
    assert events.c.occurred_at.nullable is False

    facts = _table("sales_line_facts")
    assert isinstance(facts.c.source_order_item_id.type, BigInteger)
    assert facts.c.source_order_item_id.nullable is False
    assert isinstance(facts.c.source_order_id.type, BigInteger)
    assert facts.c.source_order_id.nullable is False
    assert isinstance(facts.c.product_id.type, BigInteger)
    assert facts.c.product_id.nullable is True
    assert isinstance(facts.c.kind.type, String) and facts.c.kind.type.length == 16
    assert isinstance(facts.c.sku_snapshot.type, String)
    assert facts.c.sku_snapshot.type.length == 80
    assert facts.c.sku_snapshot.nullable is True
    assert isinstance(facts.c.name_snapshot.type, String)
    assert facts.c.name_snapshot.type.length == 255
    assert facts.c.name_snapshot.nullable is False
    assert isinstance(facts.c.unit_price.type, Numeric)
    assert (facts.c.unit_price.type.precision, facts.c.unit_price.type.scale) == (12, 2)
    assert isinstance(facts.c.line_total.type, Numeric)
    assert (facts.c.line_total.type.precision, facts.c.line_total.type.scale) == (12, 2)
    assert isinstance(facts.c.quantity.type, Integer)
    assert isinstance(facts.c.ordered_at.type, DateTime)
    assert facts.c.ordered_at.type.timezone is True
    assert facts.c.ordered_at.nullable is False


# ── Server defaults ──────────────────────────────────────────────────────────


def test_server_defaults_match_migration() -> None:
    users = _table("users")
    assert _default_text(users.c.role) == "user"
    assert _default_text(users.c.status) == "active"
    assert _default_text(users.c.blocked_at) is None
    assert _default_text(users.c.blocked_reason) is None

    reviews = _table("reviews")
    assert _default_text(reviews.c.source) == "user"
    assert _default_text(reviews.c.is_published) == "true"
    assert _default_text(reviews.c.displayed_at) == "CURRENT_TIMESTAMP"
    assert _default_text(reviews.c.author_name) is None
    assert _default_text(reviews.c.store_reply) is None

    events = _table("site_events")
    assert _default_text(events.c.occurred_at) == "CURRENT_TIMESTAMP"
    assert _default_text(events.c.details) == "'{}'::jsonb"

    facts = _table("sales_line_facts")
    assert _default_text(facts.c.ordered_at) is None


def test_new_columns_have_no_python_side_default_that_could_send_null() -> None:
    # INSERTs that omit these columns must let PostgreSQL apply its own default;
    # a Python default of None would send NULL and violate NOT NULL.
    users = _table("users")
    reviews = _table("reviews")
    columns = (
        users.c.role,
        users.c.status,
        reviews.c.source,
        reviews.c.is_published,
    )
    for column in columns:
        assert column.default is None
        assert column.server_default is not None
    assert reviews.c.displayed_at.default is None
    assert reviews.c.displayed_at.server_default is not None


# ── Constraints and indexes ──────────────────────────────────────────────────


def test_user_check_constraints_and_composite_index() -> None:
    users = _table("users")
    assert _check_names(users) == {
        "ck_users_email_nonempty",
        "ck_users_username_valid",
        "ck_users_role",
        "ck_users_status",
    }
    assert _check_sql(users, "ck_users_role") == "role IN ('user', 'admin', 'owner')"
    assert _check_sql(users, "ck_users_status") == "status IN ('active', 'blocked')"
    assert _index_columns(users, "ix_users_role_status") == [
        "role",
        "status",
    ]


def test_review_check_constraints_unique_and_indexes() -> None:
    reviews = _table("reviews")
    assert _check_names(reviews) == {
        "ck_reviews_rating_range",
        "ck_reviews_body_nonempty",
        "ck_reviews_source_author",
        "ck_reviews_store_reply_nonempty",
    }
    assert _check_sql(reviews, "ck_reviews_source_author") == (
        "(source = 'user' AND user_id IS NOT NULL AND author_name IS NULL) OR "
        "(source = 'admin' AND user_id IS NULL AND author_name IS NOT NULL "
        "AND length(btrim(author_name)) > 0)"
    )
    assert _check_sql(reviews, "ck_reviews_store_reply_nonempty") == (
        "store_reply IS NULL OR length(btrim(store_reply)) > 0"
    )
    assert "uq_reviews_user_product" in _unique_names(reviews)
    assert _index_columns(reviews, "ix_reviews_product_published_date") == [
        "product_id",
        "is_published",
        "displayed_at",
    ]
    assert "ix_reviews_product_id" in _index_names(reviews)


def test_site_event_constraints_and_indexes() -> None:
    events = _table("site_events")
    assert _check_names(events) == {
        "ck_site_events_category",
        "ck_site_events_outcome",
        "ck_site_events_actor_role",
        "ck_site_events_details_object",
    }
    assert _check_sql(events, "ck_site_events_category") == (
        "category IN "
        "('auth','account','order','build','review','admin','catalog','system')"
    )
    assert _check_sql(events, "ck_site_events_outcome") == (
        "outcome IN ('success', 'failure')"
    )
    assert _check_sql(events, "ck_site_events_details_object") == (
        "jsonb_typeof(details) = 'object'"
    )
    assert _index_names(events) == {
        "ix_site_events_occurred",
        "ix_site_events_category_occurred",
        "ix_site_events_actor_occurred",
        "ix_site_events_outcome_occurred",
        "ix_site_events_event_type",
    }
    assert _index_columns(events, "ix_site_events_category_occurred") == [
        "category",
        "occurred_at",
    ]
    assert _index_columns(events, "ix_site_events_actor_occurred") == [
        "actor_user_id",
        "occurred_at",
    ]
    assert _index_columns(events, "ix_site_events_outcome_occurred") == [
        "outcome",
        "occurred_at",
    ]


def test_sales_line_fact_constraints_and_indexes() -> None:
    facts = _table("sales_line_facts")
    assert _check_names(facts) == {
        "ck_sales_facts_kind",
        "ck_sales_facts_quantity_positive",
        "ck_sales_facts_amount_nonnegative",
    }
    assert _check_sql(facts, "ck_sales_facts_kind") == (
        "kind IN ('product','custom_build')"
    )
    assert _check_sql(facts, "ck_sales_facts_quantity_positive") == "quantity > 0"
    assert _index_columns(facts, "ix_sales_facts_product_date") == [
        "product_id",
        "ordered_at",
    ]
    assert _index_columns(facts, "ix_sales_facts_order_date") == [
        "source_order_id",
        "ordered_at",
    ]
    assert _index_columns(facts, "ix_sales_facts_ordered_at") == ["ordered_at"]


# ── Foreign keys ─────────────────────────────────────────────────────────────


def test_site_events_has_no_foreign_key_to_users() -> None:
    # Audit rows must survive account deletion, so the column is not an FK.
    assert list(_table("site_events").foreign_keys) == []


def test_sales_line_facts_foreign_keys() -> None:
    foreign_keys = list(_table("sales_line_facts").foreign_keys)
    assert len(foreign_keys) == 1
    (foreign_key,) = foreign_keys
    assert foreign_key.parent.name == "product_id"
    assert foreign_key.column.table.name == "products"
    assert foreign_key.column.name == "id"
    assert foreign_key.ondelete == "SET NULL"
    # No FK to orders / order_items / users: the ledger is independent.
    assert [item.parent.name for item in foreign_keys] == ["product_id"]


def test_review_user_foreign_key_stays_nullable_cascade() -> None:
    user_fks = [
        foreign_key
        for foreign_key in _table("reviews").foreign_keys
        if foreign_key.parent.name == "user_id"
    ]
    assert len(user_fks) == 1
    assert user_fks[0].column.table.name == "users"
    assert user_fks[0].ondelete == "CASCADE"
    assert user_fks[0].parent.nullable is True


# ── Relationships ────────────────────────────────────────────────────────────


def test_review_user_relationship_allows_admin_authored_rows() -> None:
    configure_mappers()
    relationship = Review.user.property
    assert relationship.uselist is False
    assert relationship.mapper.class_ is User
    assert relationship.back_populates == "reviews"

    back = User.reviews.property
    assert back.uselist is True
    assert back.mapper.class_ is Review
    assert back.back_populates == "user"


# ── Pre-existing mappings preserved ─────────────────────────────────────────


def test_existing_relationships_are_still_configured() -> None:
    configure_mappers()
    assert User.auth_sessions.property.mapper.class_.__name__ == "AuthSession"
    assert User.cart.property.uselist is False
    assert User.orders.property.mapper.class_.__name__ == "Order"
    assert User.saved_builds.property.mapper.class_.__name__ == "SavedBuild"
    assert User.favorites.property.mapper.class_.__name__ == "Favorite"
    assert Review.product.property.mapper.class_.__name__ == "Product"


def test_existing_important_constraints_are_preserved() -> None:
    assert {
        "uq_users_email_ci",
        "uq_users_username_ci",
    }.issubset(_index_names(_table("users")))
    assert {
        "ck_reviews_rating_range",
        "ck_reviews_body_nonempty",
    }.issubset(_check_names(_table("reviews")))
    assert {
        "ix_products_fts",
        "ix_products_name_trgm",
    }.issubset(_index_names(_table("products")))
