"""Isolated PostgreSQL-only API integration tests.

Set PC_BUILDER_TEST_DATABASE_URL to an existing, Alembic-migrated PostgreSQL
DB whose name starts with test_ or ends with _test. Never use the development DB.
Each API test uses an outer transaction that rolls back even if the app commits.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from secrets import token_hex

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.db.session import get_db_session
from app.db.session import settings as app_db_settings
from app.main import app
from app.models import Category, Manufacturer, Product, ProductType, User


@pytest.fixture(scope="session")
def test_engine():
    raw = os.environ.get("PC_BUILDER_TEST_DATABASE_URL", "")
    if not raw:
        pytest.skip(
            "API write tests require explicit isolated PC_BUILDER_TEST_DATABASE_URL"
        )
    url = make_url(raw)
    name = url.database or ""
    if url.get_backend_name() != "postgresql" or not (
        name.startswith("test_") or name.endswith("_test")
    ):
        pytest.fail(
            "Refusing unsafe test database URL: PostgreSQL *_test/test_* database required"
        )
    if (
        str(url) == str(app_db_settings.database_url)
        or name == app_db_settings.postgres_db
    ):
        pytest.fail("Refusing test writes to the application development database")
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        required = {
            "users",
            "products",
            "auth_sessions",
            "orders",
            "order_items",
            "cart_items",
            "reviews",
            "saved_builds",
        }
        existing = set(inspect(conn).get_table_names())
        if not required.issubset(existing):
            pytest.fail(
                "Isolated PostgreSQL database must be migrated with Alembic first"
            )
    yield engine
    engine.dispose()


@pytest.fixture()
def isolated_connection(test_engine):
    conn = test_engine.connect()
    outer = conn.begin()
    try:
        yield conn
    finally:
        if outer.is_active:
            outer.rollback()
        conn.close()


@pytest.fixture()
def test_db_session(isolated_connection) -> Iterator[Session]:
    with Session(
        bind=isolated_connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    ) as db:
        yield db


@pytest.fixture()
def api_client(isolated_connection, monkeypatch) -> Iterator[TestClient]:
    # Only for the lifetime of this test. Tests do not rely on a real .env JWT key.
    monkeypatch.setenv("JWT_SECRET_KEY", token_hex(40))
    get_settings.cache_clear()

    def isolated_session():
        with Session(
            bind=isolated_connection,
            join_transaction_mode="create_savepoint",
            expire_on_commit=False,
        ) as db:
            try:
                yield db
                db.commit()  # Ends an inner SAVEPOINT, not the outer test transaction.
            except Exception:
                db.rollback()
                raise

    previous = app.dependency_overrides.get(get_db_session)
    app.dependency_overrides[get_db_session] = isolated_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db_session, None)
        else:
            app.dependency_overrides[get_db_session] = previous
        get_settings.cache_clear()


@pytest.fixture()
def sample_products(test_db_session: Session) -> dict:
    suffix = token_hex(6)
    products = {}
    maker = Manufacturer(slug=f"test-maker-{suffix}", name=f"TestMaker {suffix}")
    test_db_session.add(maker)
    test_db_session.flush()
    for category in ("cpu", "mobo", "gpu", "ram", "storage", "psu", "case", "cooling"):
        cat = Category(
            slug=f"test-{category}-{suffix}", name=f"Test {category} {suffix}"
        )
        # Use actual category slug for slot checks; isolate by one-off test DB
        # values only if no real category exists.
        existing = test_db_session.query(Category).filter_by(slug=category).first()
        if existing is not None:
            cat = existing
        else:
            cat.slug = category
            test_db_session.add(cat)
            test_db_session.flush()
        kind = ProductType(
            category_id=cat.id,
            slug=f"test-{category}-{suffix}",
            name=f"Test {category} {suffix}",
        )
        test_db_session.add(kind)
        test_db_session.flush()
        product = Product(
            product_type_id=kind.id,
            manufacturer_id=maker.id,
            slug=f"test-{category}-{suffix}",
            sku=f"TEST-{category}-{suffix}",
            name=f"Probe{suffix} {category.upper()}",
            description="Test-only item",
            price="199.99",
            stock_quantity=20,
            on_sale=False,
            is_active=True,
        )
        test_db_session.add(product)
        test_db_session.flush()
        products[category] = product
    return products


# Every characteristic the approved compatibility rule set reads, with values
# that agree with each other. Applied by `apply_compatible_build`.
COMPATIBLE_SPECS: dict[str, dict[str, object]] = {
    "cpu": {"socket": "AM5", "memory_type": ["DDR5"]},
    "mobo": {
        "socket": "AM5",
        "memory_type": "DDR5",
        "max_memory_gb": 128,
        "ram_slots": 4,
        "form_factor": "ATX",
        "gpu_interfaces": ["pcie_x16"],
        "storage_interfaces": ["nvme", "sata"],
        "supported_nvme_lengths_mm": [60, 80],
        "required_cpu_power_connectors": ["eps8"],
        "required_board_power_connectors": ["atx24"],
    },
    "gpu": {"interface": "pcie_x16", "required_power_connectors": ["8pin"]},
    "ram": {"memory_type": "DDR5", "capacity_gb": 32, "module_count": 2},
    "storage": {"interface": "nvme", "length_mm": 80},
    "psu": {
        "wattage_w": 750,
        "form_factor": "ATX",
        "available_gpu_power_connectors": ["8pin", "8pin"],
        "available_cpu_power_connectors": ["eps8", "eps8"],
        "available_board_power_connectors": ["atx24"],
    },
    "case": {
        "supported_motherboard_form_factors": ["ATX", "MATX"],
        "supported_psu_form_factors": ["ATX"],
    },
    "cooling": {"supported_sockets": ["AM5"], "cooling_type": "air"},
}


def apply_compatible_build(db: Session, products: dict) -> dict[str, int]:
    """Give every sample product a mutually compatible set of characteristics."""
    for slot, values in COMPATIBLE_SPECS.items():
        apply_characteristics(db, products[slot], dict(values))
    return {slot: product.id for slot, product in products.items()}


def apply_characteristics(
    db: Session, product: Product, values: dict[str, object]
) -> None:
    """Attach structured values to a product through the normalized tables.

    Missing definitions are created in the product's category with a data type
    inferred from the Python value; an existing definition keeps its declared
    type. Every value becomes a row of the `characteristic_options` dictionary of
    that definition, and repeated list items are folded into one association with
    a `quantity`, exactly like the production writers do.
    """
    from collections import Counter

    from app.models import Characteristic, CharacteristicOption, ProductCharacteristic
    from app.services import spec_service

    category_id = product.product_type.category_id
    known = {
        definition.code: definition
        for definition in spec_service.definitions_for_category(db, category_id)
    }

    def _type_of(value: object) -> str:
        if isinstance(value, bool):
            return "boolean"
        if isinstance(value, int | float):
            return "number"
        if isinstance(value, str):
            return "string"
        if isinstance(value, list) and all(isinstance(x, str) for x in value):
            return "string_list"
        return "number_list"

    def _display(value: object) -> str:
        if isinstance(value, bool):
            return spec_service.TRUE_LABEL if value else spec_service.FALSE_LABEL
        return str(value)

    for code, value in values.items():
        definition = known.get(code)
        if definition is None:
            row = Characteristic(
                category_id=category_id,
                code=code,
                name=code,
                data_type=_type_of(value),
                sort_order=900,
            )
            db.add(row)
            db.flush()
            definition = spec_service.CharacteristicDefinition.from_row(
                row, product.product_type.category.slug
            )
            known[code] = definition
        items = value if isinstance(value, list) else [value]
        for text, quantity in Counter(_display(item) for item in items).items():
            option = db.scalar(
                select(CharacteristicOption).where(
                    CharacteristicOption.characteristic_name_id == definition.id,
                    CharacteristicOption.value == text,
                )
            )
            if option is None:
                option = CharacteristicOption(
                    characteristic_name_id=definition.id, value=text
                )
                db.add(option)
                db.flush()
            db.add(
                ProductCharacteristic(
                    product_id=product.id,
                    characteristic_id=definition.id,
                    characteristic_option_id=option.id,
                    quantity=quantity,
                )
            )
    db.flush()


@pytest.fixture()
def registered_user(api_client: TestClient) -> dict:
    return create_account(api_client)


def create_account(api_client: TestClient, role: str = "user") -> dict:
    """Register + log in a fresh account; `role` labels the fixture only."""
    suffix = token_hex(6)
    email = f"test-{suffix}@example.com"
    username = f"testuser{suffix}"
    registration = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "username": username,
            "password": "StrongPassword123!",
            "display_name": "Test Person",
        },
    )
    assert registration.status_code == 201, registration.text
    login = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": username,
            "password": "StrongPassword123!",
        },
    )
    assert login.status_code == 200, login.text
    account = {
        "id": registration.json()["id"],
        "email": email,
        "username": username,
        "role": role,
        "token": login.json()["access_token"],
        "headers": {"Authorization": f"Bearer {login.json()['access_token']}"},
    }
    return account


@pytest.fixture()
def admin_user(api_client: TestClient, test_db_session: Session) -> dict:
    account = create_account(api_client, role="admin")
    # Role changes are owner-only through the API, so provision it directly.
    test_db_session.get(User, account["id"]).role = "admin"
    test_db_session.flush()
    return account


@pytest.fixture()
def owner_user(api_client: TestClient, test_db_session: Session) -> dict:
    account = create_account(api_client, role="owner")
    test_db_session.get(User, account["id"]).role = "owner"
    test_db_session.flush()
    return account
