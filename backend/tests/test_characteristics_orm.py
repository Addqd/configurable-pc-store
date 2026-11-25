"""Metadata-only ORM checks for the normalized characteristics schema.

These tests inspect `Base.metadata` and the configured mappers directly, so they
need no database connection and never modify data. Tables declared here are not
part of the applied PostgreSQL schema until the project owner reviews and applies
the generated Alembic revision; nothing in this module creates or alters tables.

Approved structure: `characteristics` (definitions) -> `characteristic_options`
(value dictionary) <- `product_characteristics` (associations with quantity).
"""

from __future__ import annotations

import warnings

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    UniqueConstraint,
    inspect,
)
from sqlalchemy.exc import SAWarning
from sqlalchemy.orm import configure_mappers

from app.db.base import Base
from app.models import (
    Category,
    Characteristic,
    CharacteristicOption,
    Product,
    ProductCharacteristic,
)

TABLES = ("characteristics", "characteristic_options", "product_characteristics")


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


def _unique(table, name: str) -> UniqueConstraint:
    for constraint in table.constraints:
        if isinstance(constraint, UniqueConstraint) and constraint.name == name:
            return constraint
    raise AssertionError(f"unique constraint {name!r} is not declared")


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


def _single_column_foreign_keys(table) -> dict[str, ForeignKeyConstraint]:
    """Foreign keys that constrain exactly one local column, keyed by that column."""
    single: dict[str, ForeignKeyConstraint] = {}
    for constraint in table.foreign_key_constraints:
        if len(constraint.columns) == 1:
            single[next(iter(constraint.columns)).name] = constraint
    return single


def _foreign_key_named(table, name: str) -> ForeignKeyConstraint:
    for constraint in table.foreign_key_constraints:
        if constraint.name == name:
            return constraint
    raise AssertionError(f"foreign key constraint {name!r} is not declared")


# ── Registration ─────────────────────────────────────────────────────────────


def test_three_characteristics_tables_are_registered_on_shared_metadata() -> None:
    for name in TABLES:
        assert name in Base.metadata.tables, name
    assert _table("characteristics") is Characteristic.__table__
    assert _table("characteristic_options") is CharacteristicOption.__table__
    assert _table("product_characteristics") is ProductCharacteristic.__table__


def test_characteristics_models_use_the_existing_declarative_base() -> None:
    configure_mappers()
    for model, table_name in (
        (Characteristic, "characteristics"),
        (CharacteristicOption, "characteristic_options"),
        (ProductCharacteristic, "product_characteristics"),
    ):
        assert model.__tablename__ == table_name
        assert model.metadata is Base.metadata
        assert issubclass(model, Base)


def test_all_related_mappers_configure_with_their_relationships() -> None:
    configure_mappers()
    assert set(inspect(Category).relationships.keys()) >= {
        "product_types",
        "characteristics",
    }
    assert set(inspect(Characteristic).relationships.keys()) == {
        "category",
        "values",
        "options",
    }
    assert set(inspect(CharacteristicOption).relationships.keys()) == {"characteristic"}
    assert set(inspect(ProductCharacteristic).relationships.keys()) == {
        "product",
        "characteristic",
        "option",
    }
    assert set(inspect(Product).relationships.keys()) >= {"characteristics"}


def test_mapper_configuration_emits_no_sqlalchemy_warnings() -> None:
    # `characteristic_id` belongs to both the definition foreign key and the
    # composite option foreign key. An unannotated join would make the flush
    # order non-deterministic and emit an SAWarning about conflicting columns.
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        configure_mappers()
    sqlalchemy_warnings = [
        str(record.message)
        for record in caught
        if issubclass(record.category, SAWarning)
    ]
    assert sqlalchemy_warnings == []


# ── Columns / types / nullability ────────────────────────────────────────────


def test_characteristics_definition_columns_are_preserved() -> None:
    # The approved change must not alter existing characteristic definitions.
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


def test_characteristic_options_columns() -> None:
    assert set(_table("characteristic_options").c.keys()) == {
        "id",
        "characteristic_name_id",
        "value",
    }


def test_product_characteristics_columns_have_no_value_and_no_surrogate_id() -> None:
    assert set(_table("product_characteristics").c.keys()) == {
        "product_id",
        "characteristic_id",
        "characteristic_option_id",
        "quantity",
    }
    assert "value" not in _table("product_characteristics").c
    assert not hasattr(ProductCharacteristic, "value")
    assert "position" not in _table("product_characteristics").c


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


def test_characteristic_options_types_and_nullability() -> None:
    table = _table("characteristic_options")
    assert isinstance(table.c.id.type, BigInteger)
    assert isinstance(table.c.characteristic_name_id.type, BigInteger)
    assert table.c.characteristic_name_id.nullable is False
    assert isinstance(table.c.value.type, String)
    assert table.c.value.type.length == 500
    assert table.c.value.nullable is False
    # Values are plain, display-ready strings: no JSON, numbers or units.
    assert table.c.value.default is None
    assert table.c.value.server_default is None
    assert set(table.c.keys()) == {"id", "characteristic_name_id", "value"}


def test_product_characteristics_types_and_nullability() -> None:
    table = _table("product_characteristics")
    assert isinstance(table.c.product_id.type, BigInteger)
    assert table.c.product_id.nullable is False
    assert isinstance(table.c.characteristic_id.type, BigInteger)
    assert table.c.characteristic_id.nullable is False
    assert isinstance(table.c.characteristic_option_id.type, BigInteger)
    assert table.c.characteristic_option_id.nullable is False
    assert isinstance(table.c.quantity.type, Integer)
    assert table.c.quantity.nullable is False


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


def test_quantity_defaults_to_one_single_value() -> None:
    quantity = _table("product_characteristics").c.quantity
    assert _default_text(quantity) == "1"
    # PostgreSQL owns the default so repeated values need no Python-side value.
    assert quantity.default is None
    assert quantity.server_default is not None


# ── Primary keys ─────────────────────────────────────────────────────────────


def test_characteristics_identity_primary_key() -> None:
    table = _table("characteristics")
    assert [column.name for column in table.primary_key.columns] == ["id"]
    # BIGINT GENERATED BY DEFAULT AS IDENTITY, matching the existing tables.
    assert isinstance(table.c.id.server_default, Identity)
    assert table.c.id.autoincrement in (True, "auto")


def test_characteristic_options_identity_primary_key() -> None:
    table = _table("characteristic_options")
    assert [column.name for column in table.primary_key.columns] == ["id"]
    assert isinstance(table.c.id.server_default, Identity)
    assert table.c.id.autoincrement in (True, "auto")


def test_product_characteristics_composite_primary_key() -> None:
    primary_key = list(_table("product_characteristics").primary_key.columns)
    assert [column.name for column in primary_key] == [
        "product_id",
        "characteristic_id",
        "characteristic_option_id",
    ]
    assert all(column.nullable is False for column in primary_key)


# ── Unique constraints ───────────────────────────────────────────────────────


def test_option_values_are_unique_within_each_characteristic() -> None:
    table = _table("characteristic_options")
    assert _unique_names(table) == {
        "uq_characteristic_options_name_value",
        "uq_characteristic_options_name_id",
    }
    pairs = _unique(table, "uq_characteristic_options_name_value")
    assert [column.name for column in pairs.columns] == [
        "characteristic_name_id",
        "value",
    ]


def test_option_referenced_key_supports_the_composite_foreign_key() -> None:
    referenced = _unique(
        _table("characteristic_options"), "uq_characteristic_options_name_id"
    )
    assert [column.name for column in referenced.columns] == [
        "characteristic_name_id",
        "id",
    ]


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


# ── CHECK constraints ────────────────────────────────────────────────────────


def test_option_values_reject_empty_and_whitespace_only_strings() -> None:
    table = _table("characteristic_options")
    assert _check_names(table) == {"ck_characteristic_options_value_nonempty"}
    # btrim removes the whitespace a plain length() check would accept.
    assert _check_sql(table, "ck_characteristic_options_value_nonempty") == (
        "length(btrim(value)) > 0"
    )


def test_product_characteristics_only_rejects_non_positive_quantity() -> None:
    table = _table("product_characteristics")
    # The JSONB null check is gone together with the JSONB column.
    assert _check_names(table) == {"ck_product_characteristics_quantity_positive"}
    assert _check_sql(table, "ck_product_characteristics_quantity_positive") == (
        "quantity > 0"
    )


# ── Indexes ──────────────────────────────────────────────────────────────────


def test_characteristics_category_index() -> None:
    assert _index_columns(
        _table("characteristics"), "ix_characteristics_category_id"
    ) == ["category_id"]


def test_product_characteristics_lookup_indexes_are_not_redundant() -> None:
    table = _table("product_characteristics")
    assert _index_columns(table, "ix_product_characteristics_characteristic_id") == [
        "characteristic_id"
    ]
    assert _index_columns(
        table, "ix_product_characteristics_characteristic_option_id"
    ) == ["characteristic_option_id"]
    # The composite primary key already covers product-oriented access.
    product_indexes = [
        index
        for index in table.indexes
        if isinstance(index, Index)
        and [column.name for column in index.columns] == ["product_id"]
    ]
    assert product_indexes == []


def test_characteristic_options_has_no_extra_indexes() -> None:
    # Both lookup paths are already served by the two unique constraints.
    table = _table("characteristic_options")
    assert {index.name for index in table.indexes} == set()


# ── Foreign keys ─────────────────────────────────────────────────────────────


def test_characteristics_foreign_key_restricts_category_delete() -> None:
    table = _table("characteristics")
    assert len(list(table.foreign_keys)) == 1
    foreign_key = _single_column_foreign_keys(table)["category_id"]
    assert foreign_key.referred_table.name == "categories"
    assert foreign_key.elements[0].column.name == "id"
    assert foreign_key.ondelete == "RESTRICT"


def test_characteristics_are_category_scoped_not_product_type_scoped() -> None:
    table = _table("characteristics")
    assert "product_type_id" not in table.c
    targets = {foreign_key.column.table.name for foreign_key in table.foreign_keys}
    assert targets == {"categories"}


def test_options_are_definition_scoped_and_product_independent() -> None:
    table = _table("characteristic_options")
    assert len(table.foreign_key_constraints) == 1
    foreign_key = _single_column_foreign_keys(table)["characteristic_name_id"]
    assert foreign_key.referred_table.name == "characteristics"
    assert foreign_key.elements[0].column.name == "id"
    assert foreign_key.ondelete == "RESTRICT"
    # The value dictionary must not depend on products.
    assert "product_id" not in table.c
    assert {fk.column.table.name for fk in table.foreign_keys} == {"characteristics"}


def test_product_characteristics_single_column_foreign_keys_and_delete_rules() -> None:
    table = _table("product_characteristics")
    single = _single_column_foreign_keys(table)
    assert set(single) == {"product_id", "characteristic_id"}

    product_fk = single["product_id"]
    assert product_fk.referred_table.name == "products"
    assert product_fk.ondelete == "CASCADE"

    characteristic_fk = single["characteristic_id"]
    assert characteristic_fk.referred_table.name == "characteristics"
    assert characteristic_fk.ondelete == "RESTRICT"


def test_composite_foreign_key_prevents_cross_characteristic_options() -> None:
    table = _table("product_characteristics")
    constraint = _foreign_key_named(table, "fk_product_characteristics_option")
    assert [column.name for column in constraint.columns] == [
        "characteristic_id",
        "characteristic_option_id",
    ]
    assert constraint.referred_table.name == "characteristic_options"
    assert [element.column.name for element in constraint.elements] == [
        "characteristic_name_id",
        "id",
    ]
    assert constraint.ondelete == "RESTRICT"
    # Both referenced columns are covered by one unique constraint, otherwise
    # PostgreSQL could not enforce the pair and an option of another
    # characteristic would be linkable.
    referenced = _unique(
        _table("characteristic_options"), "uq_characteristic_options_name_id"
    )
    assert {column.name for column in referenced.columns} == {
        element.column.name for element in constraint.elements
    }


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


def test_characteristic_options_relationship_is_bidirectional() -> None:
    configure_mappers()
    forward = Characteristic.options.property
    assert forward.uselist is True
    assert forward.mapper.class_ is CharacteristicOption
    assert forward.back_populates == "characteristic"

    back = CharacteristicOption.characteristic.property
    assert back.uselist is False
    assert back.mapper.class_ is Characteristic
    assert back.back_populates == "options"


def test_product_characteristics_option_relationship_uses_the_composite_key() -> None:
    configure_mappers()
    prop = ProductCharacteristic.option.property
    assert prop.uselist is False
    assert prop.mapper.class_ is CharacteristicOption
    # The join carries the definition column, so the ORM reads through the same
    # pair the database enforces...
    pairs = {(local.name, remote.name) for local, remote in prop.local_remote_pairs}
    assert pairs == {
        ("characteristic_id", "characteristic_name_id"),
        ("characteristic_option_id", "id"),
    }
    # ...while only the option id is written, so `characteristic` owns
    # characteristic_id and the flush stays deterministic.
    assert {(remote.name, local.name) for remote, local in prop.synchronize_pairs} == {
        ("id", "characteristic_option_id")
    }


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
# product_characteristics, whose characteristic_id / characteristic_option_id
# are part of its primary key.


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


def test_characteristic_options_delegates_delete_to_database() -> None:
    configure_mappers()
    forward = Characteristic.options.property
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
