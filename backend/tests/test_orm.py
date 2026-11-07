"""Read-only ORM integration checks against the existing seeded DB.

Requires the same POSTGRES_* configuration as the application. Do not place
credentials in test source or modify the production development database.
"""

from collections.abc import Iterator
from decimal import Decimal

import pytest
from sqlalchemy import CheckConstraint, inspect, select
from sqlalchemy.orm import Session, configure_mappers

from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.models import (
    AuthSession,
    Cart,
    CartItem,
    Category,
    Favorite,
    Manufacturer,
    Order,
    OrderItem,
    Product,
    ProductImage,
    ProductType,
    Review,
    SavedBuild,
    SavedBuildItem,
    User,
)
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
)


@pytest.fixture()
def db_session() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session


def test_all_models_mapped() -> None:
    configure_mappers()
    assert len(EXPECTED_MODELS) == 15
    expected_names = {model.__tablename__ for model in EXPECTED_MODELS}
    assert set(Base.metadata.tables) == expected_names


def test_models_match_database_tables(db_session: Session) -> None:
    inspector = inspect(engine)
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


def test_seeded_catalog_products_exist(db_session: Session) -> None:
    # Other products can be added without invalidating the demo seed test.
    expected_slugs = {str(row["slug"]) for row in parse_catalog()}
    assert expected_slugs
    actual_slugs = set(
        db_session.scalars(select(Product.slug).where(Product.slug.in_(expected_slugs)))
    )
    assert actual_slugs == expected_slugs


def test_get_product_by_slug(db_session: Session) -> None:
    product = db_session.scalar(
        select(Product).where(Product.slug == "gpu-rtx-4070-super")
    )
    assert product is not None
    assert product.name == "MSI GeForce RTX 4070 SUPER Gaming X Slim 12G"
    assert product.price == Decimal("64990.00")
    assert product.color == "Чёрный"
    assert product.graphics_chip_brand == "NVIDIA"


def test_product_relationships(db_session: Session) -> None:
    product = db_session.scalar(
        select(Product).where(Product.slug == "gpu-rtx-4070-super")
    )
    assert product is not None
    assert product.product_type.category.slug == "gpu"
    assert product.manufacturer.name == "MSI"
    assert isinstance(product.spec_lines, list)
    assert isinstance(product.short_specs, list)
    assert isinstance(product.technical_specs, dict)


def test_category_has_product_types(db_session: Session) -> None:
    category = db_session.scalar(select(Category).where(Category.slug == "gpu"))
    assert category is not None
    assert len(category.product_types) > 0


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
        "spec_lines",
        "short_specs",
        "technical_specs",
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
