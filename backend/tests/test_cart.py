"""Tests for Cart and Demo Checkout API."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.main import app

# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def db_session() -> Iterator[Session]:
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def authed_client(client: TestClient, db_session: Session) -> tuple[TestClient, str]:
    """Register a user and return (client, access_token)."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "cartuser@example.com",
            "username": "carttestuser",
            "password": "strongpassword123",
            "display_name": "Cart Test User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "cartuser@example.com",
            "password": "strongpassword123",
        },
    )
    return client, login.json()["access_token"]


# ── Cart Tests ───────────────────────────────────────────────────────────────


def test_get_cart_empty(authed_client: tuple):
    """Empty cart returns 200 with empty items."""
    client, token = authed_client
    response = client.get(
        "/api/v1/cart",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"] == []


def test_add_product_to_cart(authed_client: tuple):
    """Adding a product to cart works."""
    client, token = authed_client
    response = client.post(
        "/api/v1/cart/products",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": 7, "quantity": 2},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["item_count"] > 0


def test_update_quantity(authed_client: tuple):
    """Updating cart item quantity works."""
    client, token = authed_client
    add = client.post(
        "/api/v1/cart/products",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": 7, "quantity": 1},
    )
    item_id = add.json()["items"][0]["id"]

    response = client.patch(
        f"/api/v1/cart/{item_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"quantity": 3},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["quantity"] == 3


def test_remove_from_cart(authed_client: tuple):
    """Removing cart items works."""
    client, token = authed_client
    add = client.post(
        "/api/v1/cart/products",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": 7, "quantity": 1},
    )
    item_id = add.json()["items"][0]["id"]

    response = client.delete(
        f"/api/v1/cart/{item_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert len(response.json()["items"]) == 0


# ── Demo Checkout Tests ──────────────────────────────────────────────────────


def test_demo_checkout(authed_client: tuple):
    """Demo checkout creates an order with snapshot."""
    client, token = authed_client

    # Add a product to cart
    client.post(
        "/api/v1/cart/products",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": 7, "quantity": 1},
    )

    response = client.post(
        "/api/v1/cart/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 200
    data = response.json()
    assert "order" in data
    assert data["order"]["status"] == "completed_demo"
    assert float(data["order"]["total_amount"]) > 0
    assert len(data["order"]["items"]) > 0


def test_checkout_empty_cart(authed_client: tuple):
    """Checkout with empty cart returns 400."""
    client, token = authed_client
    response = client.post(
        "/api/v1/cart/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 400


def test_order_history(authed_client: tuple):
    """GET /api/v1/cart/orders returns order history."""
    client, token = authed_client

    # Do a checkout first
    client.post(
        "/api/v1/cart/products",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": 7, "quantity": 1},
    )
    client.post(
        "/api/v1/cart/checkout",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )

    response = client.get(
        "/api/v1/cart/orders",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    assert data[0]["status"] == "completed_demo"


def test_checkout_auth_required(client: TestClient):
    """Checkout without auth returns 401."""
    response = client.post(
        "/api/v1/cart/checkout",
        json={},
    )
    assert response.status_code == 401
