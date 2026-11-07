"""Tests for Favorites and Reviews API."""

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
            "email": "socialuser@example.com",
            "username": "socialtestuser",
            "password": "strongpassword123",
            "display_name": "Social Test User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "socialuser@example.com",
            "password": "strongpassword123",
        },
    )
    return client, login.json()["access_token"]


# ── Favorites Tests ──────────────────────────────────────────────────────────


def test_toggle_favorite(authed_client: tuple):
    """Toggling a favorite adds/removes it."""
    client, token = authed_client

    # Add favorite
    response = client.post(
        "/favorites/7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200

    # Remove favorite (toggle)
    response = client.post(
        "/favorites/7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_get_favorites(authed_client: tuple):
    """GET /favorites returns user's favorites."""
    client, token = authed_client

    # Add a favorite
    client.post(
        "/favorites/7",
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get(
        "/favorites",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


def test_remove_favorite(authed_client: tuple):
    """DELETE /favorites/{id} removes a favorite."""
    client, token = authed_client

    # Add then remove
    client.post(
        "/favorites/7",
        headers={"Authorization": f"Bearer {token}"},
    )
    response = client.delete(
        "/favorites/7",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204


def test_is_favorited(authed_client: tuple):
    """GET /favorites/{id}/is_favorited returns boolean."""
    client, token = authed_client
    response = client.get(
        "/favorites/7/is_favorited",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "is_favorited" in data


# ── Reviews Tests ────────────────────────────────────────────────────────────


def test_get_product_reviews(client: TestClient):
    """GET /products/{id}/reviews returns reviews."""
    response = client.get("/products/7/reviews")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "average_rating" in data


def test_get_reviews_pagination(client: TestClient):
    """Reviews pagination works."""
    response = client.get("/products/7/reviews?page=1&page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert data["page"] == 1


# ── Profile Tests ────────────────────────────────────────────────────────────


def test_profile_counters(authed_client: tuple):
    """GET /profile returns counters."""
    client, token = authed_client
    response = client.get(
        "/profile",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "email" in data
    assert "order_count" in data
    assert "review_count" in data
    assert "favorite_count" in data
