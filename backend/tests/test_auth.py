"""Authentication/CSRF/rotation integration checks against isolated PostgreSQL."""

from secrets import token_hex

from fastapi.testclient import TestClient


def test_refresh_is_httponly_unique_and_never_in_response(
    api_client: TestClient, registered_user: dict
):
    first = api_client.cookies.get("refresh_token")
    csrf = api_client.cookies.get("csrf_token")
    assert first and csrf
    assert (
        "refresh_token"
        not in api_client.post(
            "/api/v1/auth/login",
            json={
                "email_or_username": registered_user["username"],
                "password": "StrongPassword123!",
            },
        ).json()
    )
    second = api_client.cookies.get("refresh_token")
    assert first != second
    login = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": registered_user["username"],
            "password": "StrongPassword123!",
        },
    )
    assert "httponly" in login.headers["set-cookie"].lower()
    assert "refresh_token" not in login.json()


def test_csrf_rotation_reuse_and_logout(api_client: TestClient, registered_user: dict):
    refresh = api_client.cookies.get("refresh_token")
    csrf = api_client.cookies.get("csrf_token")
    assert refresh and csrf
    assert api_client.post("/api/v1/auth/refresh").status_code == 403
    valid = api_client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert valid.status_code == 200, valid.text
    assert valid.json()["access_token"]
    assert "refresh_token" not in valid.json()
    new_refresh = api_client.cookies.get("refresh_token")
    new_csrf = api_client.cookies.get("csrf_token")
    assert refresh != new_refresh
    # Old pair is rejected even though its JWT signature remains valid.
    replay = api_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh, "csrf_token": csrf},
        headers={"X-CSRF-Token": csrf},
    )
    assert replay.status_code == 401, replay.text
    assert (
        api_client.post(
            "/api/v1/auth/logout", headers=registered_user["headers"]
        ).status_code
        == 403
    )
    result = api_client.post(
        "/api/v1/auth/logout",
        headers={
            **registered_user["headers"],
            "X-CSRF-Token": new_csrf,
        },
        cookies={"refresh_token": new_refresh, "csrf_token": new_csrf},
    )
    assert result.status_code == 200, result.text
    reused = api_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": new_refresh, "csrf_token": new_csrf},
        headers={"X-CSRF-Token": new_csrf},
    )
    assert reused.status_code == 401, reused.text


def test_auth_validation_and_ownership(api_client: TestClient, registered_user: dict):
    assert api_client.get("/api/v1/auth/me").status_code == 401
    me = api_client.get("/api/v1/auth/me", headers=registered_user["headers"])
    assert me.status_code == 200
    assert me.json()["email"] == registered_user["email"]
    assert "password_hash" not in me.json()
    wrong = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": registered_user["username"],
            "password": "incorrect",
        },
    )
    assert wrong.status_code == 401
    duplicate = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": registered_user["email"].upper(),
            "username": "other" + token_hex(4),
            "password": "StrongPassword123!",
            "display_name": "Other",
        },
    )
    assert duplicate.status_code == 409


def test_password_change_revokes_refresh(api_client: TestClient, registered_user: dict):
    refresh = api_client.cookies.get("refresh_token")
    csrf = api_client.cookies.get("csrf_token")
    changed = api_client.patch(
        "/api/v1/auth/password",
        headers=registered_user["headers"],
        json={
            "old_password": "StrongPassword123!",
            "new_password": "NewStrongerPassword987!",
        },
    )
    assert changed.status_code == 200, changed.text
    expired = api_client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": refresh, "csrf_token": csrf},
        headers={"X-CSRF-Token": csrf},
    )
    assert expired.status_code == 401
    assert (
        api_client.post(
            "/api/v1/auth/login",
            json={
                "email_or_username": registered_user["username"],
                "password": "NewStrongerPassword987!",
            },
        ).status_code
        == 200
    )
