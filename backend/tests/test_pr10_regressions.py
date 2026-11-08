"""Regression tests for PR10 transaction timing, review edits, and catalog facets."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from secrets import token_hex
from types import SimpleNamespace

import jwt
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api import auth as auth_api
from app.core.security import create_refresh_token, get_settings
from app.db.session import get_db_session
from app.main import app
from app.models import Product


def test_failed_transaction_cannot_return_no_content(monkeypatch) -> None:
    """A failed database commit must not masquerade as a successful HTTP 204."""

    def fake_delete_user(db, user) -> None:
        pass

    def failing_transaction():
        yield object()
        raise RuntimeError("simulated database commit failure")

    monkeypatch.setattr(auth_api.auth_svc, "delete_user", fake_delete_user)
    previous_db = app.dependency_overrides.get(get_db_session)
    previous_user = app.dependency_overrides.get(auth_api.get_current_user)
    app.dependency_overrides[get_db_session] = failing_transaction
    app.dependency_overrides[auth_api.get_current_user] = lambda: SimpleNamespace(
        id=1000
    )
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.delete("/api/v1/auth")
        assert response.status_code == 500
    finally:
        if previous_db is None:
            app.dependency_overrides.pop(get_db_session, None)
        else:
            app.dependency_overrides[get_db_session] = previous_db
        if previous_user is None:
            app.dependency_overrides.pop(auth_api.get_current_user, None)
        else:
            app.dependency_overrides[auth_api.get_current_user] = previous_user


def test_failed_transaction_cannot_return_created(monkeypatch) -> None:
    def fake_register(db, email, username, password, display_name):
        return SimpleNamespace(
            id=1000,
            email=email,
            username=username,
            display_name=display_name,
            avatar_url=None,
            created_at=None,
            updated_at=None,
        )

    def failing_transaction():
        yield object()
        raise RuntimeError("simulated database commit failure")

    monkeypatch.setattr(auth_api.auth_svc, "register_user", fake_register)
    original = app.dependency_overrides.get(get_db_session)
    app.dependency_overrides[get_db_session] = failing_transaction
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            response = client.post(
                "/api/v1/auth/register",
                json={
                    "email": "failure@example.com",
                    "username": "failureuser",
                    "password": "StrongPassword123!",
                    "display_name": "Failure Probe",
                },
            )
        assert response.status_code == 500
    finally:
        if original is None:
            app.dependency_overrides.pop(get_db_session, None)
        else:
            app.dependency_overrides[get_db_session] = original


def test_expired_and_wrong_type_access_tokens_are_rejected(
    api_client: TestClient, registered_user: dict
) -> None:
    key = get_settings().jwt_secret_key
    assert key is not None
    now = datetime.now(UTC)
    expired = jwt.encode(
        {
            "sub": str(registered_user["id"]),
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
            "type": "access",
            "jti": token_hex(12),
        },
        key.get_secret_value(),
        algorithm="HS256",
    )
    assert (
        api_client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"}
        ).status_code
        == 401
    )
    refresh = create_refresh_token(str(registered_user["id"]))
    assert (
        api_client.get(
            "/api/v1/auth/me", headers={"Authorization": f"Bearer {refresh}"}
        ).status_code
        == 401
    )


def test_filter_options_are_scoped_and_manufacturers_unique(
    api_client: TestClient, test_db_session: Session, sample_products: dict
) -> None:
    source = sample_products["cpu"]
    clone = Product(
        product_type_id=source.product_type_id,
        manufacturer_id=source.manufacturer_id,
        slug=f"extra-{token_hex(8)}",
        name=f"ExtraCPU {token_hex(5)}",
        price=Decimal("149.99"),
        stock_quantity=2,
        color="AQUA_TEST_ONLY",
        spec_lines=[],
        short_specs=[],
        technical_specs={},
        is_active=True,
    )
    test_db_session.add(clone)
    test_db_session.flush()
    result = api_client.get(
        "/api/v1/products/filters",
        params={"types": source.product_type.slug},
    )
    assert result.status_code == 200, result.text
    facets = result.json()
    assert facets["colors"] == ["AQUA_TEST_ONLY"]
    assert [t["id"] for t in facets["types"]] == [source.product_type_id]
    assert [m["id"] for m in facets["manufacturers"]] == [source.manufacturer_id]


def test_order_snapshot_remains_unchanged_after_product_edit(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
) -> None:
    product = sample_products["gpu"]
    product.spec_lines = ["Before purchase"]
    test_db_session.flush()
    headers = registered_user["headers"]
    add = api_client.post(
        "/api/v1/cart/products",
        headers=headers,
        json={"product_id": product.id, "quantity": 2},
    )
    assert add.status_code == 200, add.text
    checkout = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert checkout.status_code == 200, checkout.text
    item = checkout.json()["order"]["items"][0]
    original_name = item["name_snapshot"]
    assert item["unit_price"] == "199.99"
    assert item["quantity"] == 2
    assert item["specs_snapshot"] == ["Before purchase"]
    product.name = "CHANGED AFTER PURCHASE"
    product.price = Decimal("777.77")
    product.spec_lines = ["After purchase"]
    test_db_session.flush()
    orders = api_client.get("/api/v1/cart/orders", headers=headers)
    assert orders.status_code == 200
    saved = orders.json()[0]["items"][0]
    assert saved["name_snapshot"] == original_name
    assert saved["unit_price"] == "199.99"
    assert saved["specs_snapshot"] == ["Before purchase"]


def test_edit_review_updates_timestamp(
    api_client: TestClient, registered_user: dict, sample_products: dict
) -> None:
    pid = sample_products["cpu"].id
    headers = registered_user["headers"]
    add = api_client.post(
        "/api/v1/cart/products",
        headers=headers,
        json={"product_id": pid, "quantity": 1},
    )
    assert add.status_code == 200, add.text
    checkout = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert checkout.status_code == 200, checkout.text
    url = f"/api/v1/products/{pid}/reviews"
    created = api_client.post(
        url, headers=headers, json={"rating": 4, "body": "Original review"}
    )
    assert created.status_code == 201, created.text
    old_timestamp = datetime.fromisoformat(created.json()["updated_at"])
    modified = api_client.patch(
        url, headers=headers, json={"rating": 5, "body": "Updated review"}
    )
    assert modified.status_code == 200, modified.text
    new_timestamp = datetime.fromisoformat(modified.json()["updated_at"])
    assert new_timestamp > old_timestamp
