"""ORM metadata checks plus isolated, database-backed integration checks.

Two halves, deliberately separated:

- **Metadata tests** inspect only Python ORM declarations (`Base.metadata` and
  mapper configuration). They need no database and are never skipped.
- **Integration tests** use the shared `test_engine` / `test_db_session` fixtures
  from `tests/conftest.py`. Those require an explicit, isolated
  `PC_BUILDER_TEST_DATABASE_URL` and refuse the application development
  database, so without that variable the integration tests are skipped and this
  module never opens a connection to the application database.

`test_models_match_database_tables` compares the physical schema against
`Base.metadata`, so it can only pass against an isolated database that has
already been migrated. Alembic revisions are generated, reviewed and applied by
the project owner; the test suite never creates or alters tables.
"""

from decimal import Decimal

from sqlalchemy import CheckConstraint, Engine, inspect, select
from sqlalchemy.orm import Session, configure_mappers

from app.db.base import Base
from app.models import (
    AuthSession,
    Cart,
    CartItem,
    Category,
    Characteristic,
    Favorite,
    Manufacturer,
    Order,
    OrderItem,
    Product,
    ProductCharacteristic,
    ProductImage,
    ProductType,
    Review,
    SaleLineFact,
    SavedBuild,
    SavedBuildItem,
    SiteEvent,
    User,
)
from app.services import spec_service
from scripts.seed import parse_catalog

EXPECTED_MODELS = (
    User,
    AuthSession,
    Category,
    ProductType,
    Manufacturer,
    Product,
    ProductImage,
    Favorite,
    Review,
    SavedBuild,
    SavedBuildItem,
    Cart,
    CartItem,
    Order,
    OrderItem,
    SiteEvent,
    SaleLineFact,
    Characteristic,
    ProductCharacteristic,
)


# ── Metadata-only tests (no database required) ───────────────────────────────


def test_all_models_mapped() -> None:
    configure_mappers()
    assert len(EXPECTED_MODELS) == 19
    expected_names = {model.__tablename__ for model in EXPECTED_MODELS}
    assert set(Base.metadata.tables) == expected_names


def test_user_model_columns() -> None:
    columns = {column.key for column in inspect(User).columns}
    assert columns == {
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


def test_product_model_columns() -> None:
    columns = {column.key for column in inspect(Product).columns}
    assert columns == {
        "id",
        "product_type_id",
        "manufacturer_id",
        "slug",
        "sku",
        "name",
        "description",
        "price",
        "stock_quantity",
        "color",
        "graphics_chip_brand",
        "on_sale",
        "is_active",
        "listed_at",
        "created_at",
        "updated_at",
    }


def test_order_item_computed_column() -> None:
    assert inspect(OrderItem).columns.line_total.computed is not None


def test_important_constraints_and_indexes() -> None:
    user = Base.metadata.tables["users"]
    assert {"uq_users_email_ci", "uq_users_username_ci"}.issubset(
        {index.name for index in user.indexes}
    )
    product = Base.metadata.tables["products"]
    assert {"ix_products_fts", "ix_products_name_trgm"}.issubset(
        {index.name for index in product.indexes}
    )
    assert len(list(Base.metadata.tables["favorites"].primary_key.columns)) == 2
    assert len(list(Base.metadata.tables["saved_build_items"].primary_key.columns)) == 2


# ── Integration tests (isolated database, skipped without configuration) ─────


def test_models_match_database_tables(test_engine: Engine) -> None:
    # Only meaningful against an isolated database migrated with the full
    # revision chain, including the characteristics tables.
    inspector = inspect(test_engine)
    actual_tables = set(inspector.get_table_names(schema="public")) - {
        "alembic_version"
    }
    assert actual_tables == set(Base.metadata.tables)
    for table in Base.metadata.sorted_tables:
        actual_columns = {
            column["name"]
            for column in inspector.get_columns(table.name, schema="public")
        }
        assert actual_columns == set(table.columns.keys()), table.name
        actual_pk = inspector.get_pk_constraint(table.name, schema="public")
        assert set(actual_pk["constrained_columns"]) == {
            column.name for column in table.primary_key.columns
        }, table.name

        # Indexes/check constraints already exist from the initial Alembic
        # migration. Their omission from ORM metadata risks unsafe autogenerate.
        existing_indexes = {
            index["name"]
            for index in inspector.get_indexes(table.name, schema="public")
        }
        expected_indexes = {index.name for index in table.indexes}
        assert expected_indexes.issubset(existing_indexes), table.name

        existing_checks = {
            check["name"]
            for check in inspector.get_check_constraints(table.name, schema="public")
        }
        expected_checks = {
            constraint.name
            for constraint in table.constraints
            if isinstance(constraint, CheckConstraint)
        }
        assert expected_checks.issubset(existing_checks), table.name


def test_seeded_catalog_products_exist(test_db_session: Session) -> None:
    # Other products can be added without invalidating the demo seed test.
    expected_slugs = {str(row["slug"]) for row in parse_catalog()}
    assert expected_slugs
    actual_slugs = set(
        test_db_session.scalars(
            select(Product.slug).where(Product.slug.in_(expected_slugs))
        )
    )
    assert actual_slugs == expected_slugs


def test_get_product_by_slug(test_db_session: Session) -> None:
    product = test_db_session.scalar(
        select(Product).where(Product.slug == "gpu-rtx-4070-super")
    )
    assert product is not None
    assert product.name == "MSI GeForce RTX 4070 SUPER Gaming X Slim 12G"
    assert product.price == Decimal("64990.00")
    assert product.color == "Чёрный"
    assert product.graphics_chip_brand == "NVIDIA"


def test_product_relationships(test_db_session: Session) -> None:
    product = test_db_session.scalar(
        select(Product).where(Product.slug == "gpu-rtx-4070-super")
    )
    assert product is not None
    assert product.product_type.category.slug == "gpu"
    assert product.manufacturer.name == "MSI"
    assert isinstance(product.characteristics, list)


def test_seeded_products_expose_readable_characteristics(
    test_db_session: Session,
) -> None:
    """Every imported catalog product exposes readable characteristic values."""
    seeded = {str(row["slug"]) for row in parse_catalog()}
    rows = test_db_session.scalars(
        select(Product).where(Product.slug.in_(seeded))
    ).all()
    assert {product.slug for product in rows} == seeded
    for product in rows:
        category_id = product.product_type.category.id
        definitions = spec_service.definitions_for_category(
            test_db_session, category_id
        )
        values = spec_service.values_for_product(test_db_session, product.id)
        assert definitions, product.slug
        assert values, product.slug
        serialized = spec_service.serialize_definitions(definitions, values)
        assert serialized, product.slug
        for row in serialized:
            assert row["name"].strip(), product.slug
            assert row["display_value"].strip(), product.slug
            # Native JSON types survive the round trip.
            expected = {
                "string": str,
                "number": int | float,
                "boolean": bool,
                "string_list": list,
                "number_list": list,
            }[row["data_type"]]
            assert isinstance(row["value"], expected), (product.slug, row["code"])
            if row["data_type"] == "boolean":
                assert row["value"] is not None
        # Every stored value belongs to the product's own category.
        definition_codes = {definition.code for definition in definitions}
        assert set(values).issubset(definition_codes), product.slug


def test_category_has_product_types(test_db_session: Session) -> None:
    category = test_db_session.scalar(select(Category).where(Category.slug == "gpu"))
    assert category is not None
    assert len(category.product_types) > 0
