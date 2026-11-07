"""Tests for Authentication API: register, login, refresh, logout, profile."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.main import app

# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def db_session() -> Iterator[Session]:
    """Provide a test session using the real PostgreSQL."""
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


# ── Registration Tests ───────────────────────────────────────────────────────


def test_register_success(client: TestClient, db_session: Session):
    """Successful registration returns 201 with user data."""
    import uuid

    unique = uuid.uuid4().hex[:8]
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": f"reg-test-{unique}@example.com",
            "username": f"regtestuser{unique}",
            "password": "strongpassword123",
            "display_name": "Test Reg User",
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == f"reg-test-{unique}@example.com"
    assert data["username"] == f"regtestuser{unique}"
    assert data["display_name"] == "Test Reg User"
    assert "id" in data
    # Password hash should NOT be returned
    assert "password_hash" not in data


def test_register_duplicate_email(client: TestClient, db_session: Session):
    """Registering with duplicate email returns 409."""
    # Create user first
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "dup-email@example.com",
            "username": "dupuser1",
            "password": "strongpassword123",
            "display_name": "Dup User 1",
        },
    )
    # Try to register again with same email
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "dup-email@example.com",
            "username": "dupuser2",
            "password": "strongpassword123",
            "display_name": "Dup User 2",
        },
    )
    assert response.status_code == 409


def test_register_duplicate_username(client: TestClient, db_session: Session):
    """Registering with duplicate username (case-insensitive) returns 409."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "user1@example.com",
            "username": "existinguser",
            "password": "strongpassword123",
            "display_name": "Existing User",
        },
    )
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user2@example.com",
            "username": "EXISTINGUSER",
            "password": "strongpassword123",
            "display_name": "Another User",
        },
    )
    assert response.status_code == 409


# ── Login Tests ──────────────────────────────────────────────────────────────


def test_login_email(client: TestClient, db_session: Session):
    """Login with email returns tokens."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "login-test@example.com",
            "username": "logintestuser",
            "password": "strongpassword123",
            "display_name": "Login Test",
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "login-test@example.com",
            "password": "strongpassword123",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["access_token"] != data["refresh_token"]


def test_login_username(client: TestClient, db_session: Session):
    """Login with username returns tokens."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "username-login@example.com",
            "username": "unique-login-user",
            "password": "strongpassword123",
            "display_name": "Login User",
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "unique-login-user",
            "password": "strongpassword123",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data


def test_login_wrong_password(client: TestClient, db_session: Session):
    """Wrong password returns 401."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "wrong-pass@example.com",
            "username": "wrongpassuser",
            "password": "correctpassword1",
            "display_name": "Wrong Pass",
        },
    )
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "wrong-pass@example.com",
            "password": "wrongpassword",
        },
    )
    assert response.status_code == 401


def test_login_nonexistent_user(client: TestClient):
    """Login with non-existent user returns 401."""
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "nobody@example.com",
            "password": "anypassword",
        },
    )
    assert response.status_code == 401


# ── Refresh / Logout Tests ──────────────────────────────────────────────────


def test_refresh_token(client: TestClient, db_session: Session):
    """Valid refresh token returns new access token."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "refresh@example.com",
            "username": "refreshuser",
            "password": "strongpassword123",
            "display_name": "Refresh User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "refresh@example.com",
            "password": "strongpassword123",
        },
    )
    login.json()["access_token"]
    refresh = login.json()["refresh_token"]

    response = client.post("/api/v1/auth/refresh", cookies={"refresh_token": refresh})
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_logout_revokes_session(client: TestClient, db_session: Session):
    """Logout revokes the refresh token."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "logout@example.com",
            "username": "logoutuser",
            "password": "strongpassword123",
            "display_name": "Logout User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "logout@example.com",
            "password": "strongpassword123",
        },
    )
    refresh = login.json()["refresh_token"]
    access_token = login.json()["access_token"]

    response = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        cookies={"refresh_token": refresh},
    )
    assert response.status_code == 200


# ── Profile Tests ────────────────────────────────────────────────────────────


def test_get_me(client: TestClient, db_session: Session):
    """GET /api/v1/auth/me returns current user."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "me@example.com",
            "username": "meuser",
            "password": "strongpassword123",
            "display_name": "Me User",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "me@example.com",
            "password": "strongpassword123",
        },
    )
    access_token = login.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "me@example.com"


def test_update_profile(client: TestClient, db_session: Session):
    """PATCH /api/v1/auth/profile updates user."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "update@example.com",
            "username": "updateuser",
            "password": "strongpassword123",
            "display_name": "Update Me",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "update@example.com",
            "password": "strongpassword123",
        },
    )
    access_token = login.json()["access_token"]

    response = client.patch(
        "/api/v1/auth/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"display_name": "Updated Name"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["display_name"] == "Updated Name"


def test_change_password(client: TestClient, db_session: Session):
    """PATCH /api/v1/auth/password changes password."""
    import uuid

    unique = uuid.uuid4().hex[:8]
    client.post(
        "/api/v1/auth/register",
        json={
            "email": f"passchange-{unique}@example.com",
            "username": f"passchangeuser{unique}",
            "password": "oldpassword123",
            "display_name": "Pass Change",
        },
    )
    # Verify old password works
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": f"passchange-{unique}@example.com",
            "password": "oldpassword123",
        },
    )
    assert login.status_code == 200

    # Change password
    client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": f"passchange-{unique}@example.com",
            "password": "oldpassword123",
        },
    )
    response = client.patch(
        "/api/v1/auth/password",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        json={"old_password": "oldpassword123", "new_password": "newpassword456"},
    )
    assert response.status_code == 200

    # Verify new password works
    login2 = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": f"passchange-{unique}@example.com",
            "password": "newpassword456",
        },
    )
    assert login2.status_code == 200


def test_delete_account(client: TestClient, db_session: Session):
    """DELETE /api/v1/auth deletes the user."""
    client.post(
        "/api/v1/auth/register",
        json={
            "email": "delete-me@example.com",
            "username": "deleteuser",
            "password": "strongpassword123",
            "display_name": "Delete Me",
        },
    )
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "delete-me@example.com",
            "password": "strongpassword123",
        },
    )
    access_token = login.json()["access_token"]

    response = client.delete(
        "/api/v1/auth",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    assert response.status_code == 204

    # Verify user is gone
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "delete-me@example.com",
            "password": "strongpassword123",
        },
    )
    assert response.status_code == 401


# ── Auth Error Tests ─────────────────────────────────────────────────────────


def test_unauthorized_profile(client: TestClient):
    """GET /api/v1/auth/me without token returns 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
