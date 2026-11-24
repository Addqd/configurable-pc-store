"""Metadata-only ORM checks for the normalized characteristics schema.

These tests inspect `Base.metadata` and the configured mappers directly, so they
need no database connection and never modify data. The tables declared here are
not part of the applied PostgreSQL schema yet: the Alembic revision is generated
and applied by the project owner in a separate, reviewed step.
"""

from __future__ import annotations

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
    inspect,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import configure_mappers

from app.db.base import Base
from app.models import (
    Category,
    Characteristic,
    Product,
    ProductCharacteristic,
)

NEW_TABLES = ("characteristics", "product_characteristics")


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


def _index_columns(table, name: str) -> list[str]:
    for index in table.indexes:
        if index.name == name:
            return [column.name for column in index.columns]
    raise AssertionError(f"index {name!r} is not declared")


def _foreign_key(table, column_name: str) -> ForeignKey:
    for foreign_key in table.foreign_keys:
        if foreign_key.parent.name == column_name:
            return foreign_key
    raise AssertionError(f"foreign key on {column_name!r} is not declared")


# ── Registration ─────────────────────────────────────────────────────────────


def test_new_tables_are_registered_on_shared_metadata() -> None:
    for name in NEW_TABLES:
        assert name in Base.metadata.tables, name
    assert _table("characteristics") is Characteristic.__table__
    assert _table("product_characteristics") is ProductCharacteristic.__table__


def test_new_models_are_configured_with_the_existing_base() -> None:
    configure_mappers()
    assert Characteristic.__tablename__ == "characteristics"
    assert ProductCharacteristic.__tablename__ == "product_characteristics"
    assert Characteristic.metadata is Base.metadata
    assert ProductCharacteristic.metadata is Base.metadata


def test_all_related_mappers_configure_with_their_relationships() -> None:
    configure_mappers()
    assert set(inspect(Category).relationships.keys()) >= {
        "product_types",
        "characteristics",
    }
    assert set(inspect(Characteristic).relationships.keys()) == {
        "category",
        "values",
    }
    assert set(inspect(ProductCharacteristic).relationships.keys()) == {
        "product",
        "characteristic",
    }
    assert set(inspect(Product).relationships.keys()) >= {"characteristics"}


# ── Columns / types / nullability ────────────────────────────────────────────


def test_characteristics_columns() -> None:
    assert set(_table("characteristics").c.keys()) == {
        "id",
        "category_id",
        "code",
        "name",
        "data_type",
        "unit",
        "sort_order",
        "is_required",
        "show_in_short",
        "show_in_details",
    }


def test_product_characteristics_columns_have_no_surrogate_id() -> None:
    assert set(_table("product_characteristics").c.keys()) == {
        "product_id",
        "characteristic_id",
        "value",
    }


def test_characteristics_types_and_nullability() -> None:
    table = _table("characteristics")
    assert isinstance(table.c.id.type, BigInteger)
    assert isinstance(table.c.category_id.type, BigInteger)
    assert table.c.category_id.nullable is False
    assert isinstance(table.c.code.type, String)
    assert table.c.code.type.length == 64
    assert table.c.code.nullable is False
    assert isinstance(table.c.name.type, String)
    assert table.c.name.type.length == 120
    assert table.c.name.nullable is False
    assert isinstance(table.c.data_type.type, String)
    assert table.c.data_type.type.length == 24
    assert table.c.data_type.nullable is False
    assert isinstance(table.c.unit.type, String)
    assert table.c.unit.type.length == 32
    assert table.c.unit.nullable is True
    assert isinstance(table.c.sort_order.type, Integer)
    assert table.c.sort_order.nullable is False
    for boolean_column in ("is_required", "show_in_short", "show_in_details"):
        assert isinstance(table.c[boolean_column].type, Boolean), boolean_column
        assert table.c[boolean_column].nullable is False, boolean_column


def test_product_characteristics_types_and_nullability() -> None:
    table = _table("product_characteristics")
    assert isinstance(table.c.product_id.type, BigInteger)
    assert table.c.product_id.nullable is False
    assert isinstance(table.c.characteristic_id.type, BigInteger)
    assert table.c.characteristic_id.nullable is False
    assert table.c.value.nullable is False


def test_value_column_is_jsonb_without_default() -> None:
    # One definition can hold a string, number, boolean, string list or number
    # list; no type may be forced and no arbitrary default is allowed.
    value = _table("product_characteristics").c.value
    assert isinstance(value.type, JSONB)
    assert value.default is None
    assert value.server_default is None


# ── Server defaults ──────────────────────────────────────────────────────────


def test_characteristics_server_defaults() -> None:
    table = _table("characteristics")
    assert _default_text(table.c.sort_order) == "0"
    assert _default_text(table.c.is_required) == "false"
    assert _default_text(table.c.show_in_short) == "false"
    assert _default_text(table.c.show_in_details) == "true"
    assert _default_text(table.c.unit) is None
    for column_name in (
        "sort_order",
        "is_required",
        "show_in_short",
        "show_in_details",
    ):
        # PostgreSQL owns the default; a Python-side None would send NULL.
        assert table.c[column_name].default is None, column_name
        assert table.c[column_name].server_default is not None, column_name


# ── Primary keys ─────────────────────────────────────────────────────────────


def test_characteristics_identity_primary_key() -> None:
    table = _table("characteristics")
    assert [column.name for column in table.primary_key.columns] == ["id"]
    # BIGINT GENERATED BY DEFAULT AS IDENTITY, matching the existing tables.
    assert isinstance(table.c.id.server_default, Identity)
    assert table.c.id.autoincrement in (True, "auto")


def test_product_characteristics_composite_primary_key() -> None:
    primary_key = list(_table("product_characteristics").primary_key.columns)
    assert [column.name for column in primary_key] == [
        "product_id",
        "characteristic_id",
    ]
    assert all(column.nullable is False for column in primary_key)


# ── Constraints and indexes ──────────────────────────────────────────────────


def test_characteristics_unique_and_check_constraints() -> None:
    table = _table("characteristics")
    assert _unique_names(table) == {"uq_characteristics_category_code"}
    assert _check_names(table) == {
        "ck_characteristics_data_type",
        "ck_characteristics_sort_order_nonnegative",
        "ck_characteristics_code_nonempty",
        "ck_characteristics_name_nonempty",
    }
    assert _check_sql(table, "ck_characteristics_data_type") == (
        "data_type IN ('string','number','boolean','string_list','number_list')"
    )
    assert _check_sql(table, "ck_characteristics_sort_order_nonnegative") == (
        "sort_order >= 0"
    )
    assert _check_sql(table, "ck_characteristics_code_nonempty") == (
        "length(btrim(code)) > 0"
    )
    assert _check_sql(table, "ck_characteristics_name_nonempty") == (
        "length(btrim(name)) > 0"
    )


def test_characteristics_category_index() -> None:
    assert _index_columns(
        _table("characteristics"), "ix_characteristics_category_id"
    ) == ["category_id"]


def test_product_characteristics_json_null_check() -> None:
    table = _table("product_characteristics")
    assert _check_names(table) == {"ck_product_characteristics_value_not_null"}
    assert _check_sql(table, "ck_product_characteristics_value_not_null") == (
        "value <> 'null'::jsonb"
    )


def test_product_characteristics_characteristic_index() -> None:
    table = _table("product_characteristics")
    assert _index_columns(table, "ix_product_characteristics_characteristic_id") == [
        "characteristic_id"
    ]
    # The composite primary key covers product-oriented access.
    product_indexes = [
        index
        for index in table.indexes
        if isinstance(index, Index)
        and [column.name for column in index.columns] == ["product_id"]
    ]
    assert product_indexes == []


# ── Foreign keys ─────────────────────────────────────────────────────────────


def test_characteristics_foreign_key_restricts_category_delete() -> None:
    table = _table("characteristics")
    assert len(list(table.foreign_keys)) == 1
    foreign_key = _foreign_key(table, "category_id")
    assert foreign_key.column.table.name == "categories"
    assert foreign_key.column.name == "id"
    assert foreign_key.ondelete == "RESTRICT"


def test_characteristics_are_category_scoped_not_product_type_scoped() -> None:
    table = _table("characteristics")
    assert "product_type_id" not in table.c
    targets = {foreign_key.column.table.name for foreign_key in table.foreign_keys}
    assert targets == {"categories"}


def test_product_characteristics_foreign_keys_and_delete_rules() -> None:
    table = _table("product_characteristics")
    assert len(list(table.foreign_keys)) == 2

    product_fk = _foreign_key(table, "product_id")
    assert product_fk.column.table.name == "products"
    assert product_fk.ondelete == "CASCADE"

    characteristic_fk = _foreign_key(table, "characteristic_id")
    assert characteristic_fk.column.table.name == "characteristics"
    assert characteristic_fk.ondelete == "RESTRICT"


# ── Relationships ────────────────────────────────────────────────────────────


def test_category_characteristics_relationship_is_bidirectional() -> None:
    configure_mappers()
    forward = Category.characteristics.property
    assert forward.uselist is True
    assert forward.mapper.class_ is Characteristic
    assert forward.back_populates == "category"

    back = Characteristic.category.property
    assert back.uselist is False
    assert back.mapper.class_ is Category
    assert back.back_populates == "characteristics"


def test_characteristic_values_relationship_is_bidirectional() -> None:
    configure_mappers()
    forward = Characteristic.values.property
    assert forward.uselist is True
    assert forward.mapper.class_ is ProductCharacteristic
    assert forward.back_populates == "characteristic"

    back = ProductCharacteristic.characteristic.property
    assert back.uselist is False
    assert back.mapper.class_ is Characteristic
    assert back.back_populates == "values"


def test_product_characteristics_relationship_is_bidirectional() -> None:
    configure_mappers()
    forward = Product.characteristics.property
    assert forward.uselist is True
    assert forward.mapper.class_ is ProductCharacteristic
    assert forward.back_populates == "product"
    # Delete-orphan + passive_deletes matches products' ON DELETE CASCADE.
    assert "delete-orphan" in forward.cascade
    assert forward.passive_deletes is True

    back = ProductCharacteristic.product.property
    assert back.uselist is False
    assert back.mapper.class_ is Product
    assert back.back_populates == "characteristics"


# ── Delete behavior for ON DELETE RESTRICT relationships ─────────────────────
# Without passive_deletes="all" the ORM would NULL the child foreign key instead
# of letting PostgreSQL reject the delete. That would break
# product_characteristics, whose characteristic_id is part of its primary key.


def test_category_characteristics_delegates_delete_to_database() -> None:
    configure_mappers()
    forward = Category.characteristics.property
    assert forward.passive_deletes == "all"
    assert forward.cascade.delete is False
    assert forward.cascade.delete_orphan is False


def test_characteristic_values_delegates_delete_to_database() -> None:
    configure_mappers()
    forward = Characteristic.values.property
    assert forward.passive_deletes == "all"
    assert forward.cascade.delete is False
    assert forward.cascade.delete_orphan is False


def test_product_characteristics_keeps_its_cascade_delete() -> None:
    # products.id FK is ON DELETE CASCADE, so the product owns its values.
    configure_mappers()
    forward = Product.characteristics.property
    assert forward.passive_deletes is True
    assert forward.cascade.delete is True
    assert forward.cascade.delete_orphan is True


# ── Pre-existing schema preserved ───────────────────────────────────────────


def test_existing_catalog_columns_are_untouched() -> None:
    products = _table("products")
    assert "color" in products.c
    assert "graphics_chip_brand" in products.c
    assert set(_table("categories").c.keys()) == {"id", "slug", "name", "sort_order"}
    assert set(_table("product_types").c.keys()) == {
        "id",
        "category_id",
        "slug",
        "name",
    }
    assert set(_table("manufacturers").c.keys()) == {"id", "slug", "name"}


def test_legacy_spec_columns_and_tables_are_gone() -> None:
    # The legacy display/specification architecture was removed by the applied
    # Alembic revision; nothing may reintroduce it in the ORM.
    products = _table("products")
    for legacy in ("spec_lines", "short_specs", "technical_specs", "display_specs"):
        assert legacy not in products.c, legacy
    assert "product_spec_fields" not in Base.metadata.tables
    assert "product_spec_options" not in Base.metadata.tables
    assert not hasattr(Product, "spec_lines")
    assert not hasattr(Product, "technical_specs")
