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
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.db.session import get_db_session
from app.db.session import settings as app_db_settings
from app.main import app
from app.models import Category, Manufacturer, Product, ProductType


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
            spec_lines=[],
            short_specs=[],
            technical_specs={},
            on_sale=False,
            is_active=True,
        )
        test_db_session.add(product)
        test_db_session.flush()
        products[category] = product
    return products


@pytest.fixture()
def registered_user(api_client: TestClient) -> dict:
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
    return {
        "id": registration.json()["id"],
        "email": email,
        "username": username,
        "token": login.json()["access_token"],
        "headers": {"Authorization": f"Bearer {login.json()['access_token']}"},
    }
