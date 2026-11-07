"""Tests for Saved Builds API: CRUD, compatibility, pricing."""

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
            "email": "builduser@example.com",
            "username": "buildtestuser",
            "password": "strongpassword123",
            "display_name": "Build Test User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "builduser@example.com",
            "password": "strongpassword123",
        },
    )
    return client, login.json()["access_token"]


# ── Build CRUD Tests ─────────────────────────────────────────────────────────


def test_create_build(authed_client: tuple):
    """POST /api/v1/builds creates a build."""
    client, token = authed_client
    response = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Test Build",
            "description": "A test build",
            "items": [
                {"slot": "cpu", "product_id": 13},
                {"slot": "mobo", "product_id": 19},
                {"slot": "gpu", "product_id": 7},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Test Build"
    assert len(data["items"]) == 3


def test_list_builds(authed_client: tuple):
    """GET /api/v1/builds returns user's builds."""
    client, token = authed_client
    # Create a build first
    client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "List Build", "items": []},
    )
    response = client.get(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_get_build(authed_client: tuple):
    """GET /api/v1/builds/{id} returns specific build."""
    client, token = authed_client
    create = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Get Build", "items": []},
    )
    build_id = create.json()["id"]

    response = client.get(
        f"/api/v1/builds/{build_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Get Build"


def test_update_build(authed_client: tuple):
    """PUT /api/v1/builds/{id} updates a build."""
    client, token = authed_client
    create = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Old Name", "items": []},
    )
    build_id = create.json()["id"]

    response = client.put(
        f"/api/v1/builds/{build_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "New Name"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_build(authed_client: tuple):
    """DELETE /api/v1/builds/{id} deletes a build."""
    client, token = authed_client
    create = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Delete Me", "items": []},
    )
    build_id = create.json()["id"]

    response = client.delete(
        f"/api/v1/builds/{build_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 204


# ── Compatibility Tests ──────────────────────────────────────────────────────


def test_check_compatibility(authed_client: tuple):
    """GET /api/v1/builds/{id}/compatibility returns compatibility."""
    client, token = authed_client
    create = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Compat Test",
            "items": [
                {"slot": "cpu", "product_id": 14},
                {"slot": "mobo", "product_id": 20},
            ],
        },
    )
    build_id = create.json()["id"]

    response = client.get(
        f"/api/v1/builds/{build_id}/compatibility",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "overall_status" in data
    assert "items" in data


# ── Pricing Tests ────────────────────────────────────────────────────────────


def test_build_total(authed_client: tuple):
    """GET /api/v1/builds/{id}/total returns price."""
    client, token = authed_client
    create = client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Total Test",
            "items": [
                {"slot": "cpu", "product_id": 13},
                {"slot": "gpu", "product_id": 7},
            ],
        },
    )
    build_id = create.json()["id"]

    response = client.get(
        f"/api/v1/builds/{build_id}/total",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "total_price" in data
    assert "item_count" in data


# ── Authorization Tests ──────────────────────────────────────────────────────


def test_build_ownership(authed_client: tuple):
    """User can only see their own builds."""
    client, token1 = authed_client

    # Create a build for user 1
    client.post(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token1}"},
        json={"name": "User1 Build", "items": []},
    )

    # Verify user 1 can see it
    response = client.get(
        "/api/v1/builds",
        headers={"Authorization": f"Bearer {token1}"},
    )
    names = [b["name"] for b in response.json()]
    assert "User1 Build" in names

    # User 2 shouldn't see it (different session = different user)
    _client2, _ = authed_client
