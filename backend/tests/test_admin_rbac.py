"""Role boundaries, blocked accounts and account deletion semantics.

These tests write data and therefore require an isolated PostgreSQL database
(`PC_BUILDER_TEST_DATABASE_URL`); they are skipped otherwise, like every other
API test in this suite.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Order, Review, SaleLineFact, SiteEvent, User
from tests.conftest import create_account

ADMIN_ENDPOINTS = [
    "/api/v1/admin/users",
    "/api/v1/admin/products",
    "/api/v1/admin/product-options",
    "/api/v1/admin/reviews",
    "/api/v1/admin/events",
    "/api/v1/admin/events/filters",
    "/api/v1/admin/stats/overview",
    "/api/v1/admin/stats/products",
]


def _promote(session: Session, account: dict, role: str) -> None:
    user = session.get(User, account["id"])
    assert user is not None
    user.role = role
    session.flush()
    account["role"] = role


def test_admin_endpoints_require_authentication(api_client: TestClient):
    for path in ADMIN_ENDPOINTS:
        assert api_client.get(path).status_code == 401, path
    created = api_client.post("/api/v1/admin/products", json={})
    assert created.status_code == 401


def test_ordinary_user_is_forbidden(api_client: TestClient, registered_user: dict):
    headers = registered_user["headers"]
    for path in ADMIN_ENDPOINTS:
        assert api_client.get(path, headers=headers).status_code == 403, path
    assert (
        api_client.patch(
            f"/api/v1/admin/users/{registered_user['id']}",
            headers=headers,
            json={"status": "blocked", "blocked_reason": "self block"},
        ).status_code
        == 403
    )


def test_admin_reads_and_manages_ordinary_users(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    for path in ADMIN_ENDPOINTS:
        response = api_client.get(path, headers=admin_user["headers"])
        assert response.status_code == 200, (path, response.text)

    listing = api_client.get(
        "/api/v1/admin/users",
        headers=admin_user["headers"],
        params={"q": registered_user["username"], "page_size": 5},
    ).json()
    assert listing["total"] == 1
    assert listing["items"][0]["username"] == registered_user["username"]

    blocked = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"status": "blocked", "blocked_reason": "spam"},
    )
    assert blocked.status_code == 200, blocked.text
    assert blocked.json()["status"] == "blocked"
    assert blocked.json()["blocked_at"] is not None
    assert blocked.json()["blocked_reason"] == "spam"

    unblocked = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"status": "active"},
    )
    assert unblocked.status_code == 200
    assert unblocked.json()["blocked_at"] is None
    assert unblocked.json()["blocked_reason"] is None


def test_admin_cannot_change_roles(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    response = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"role": "admin"},
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "Only the owner can change user roles"


def test_admin_cannot_modify_admin_or_owner(
    api_client: TestClient,
    admin_user: dict,
    owner_user: dict,
    test_db_session: Session,
):
    other_admin = create_account(api_client, role="admin")
    _promote(test_db_session, other_admin, "admin")

    for target, label in ((other_admin, "admin"), (owner_user, "owner")):
        response = api_client.patch(
            f"/api/v1/admin/users/{target['id']}",
            headers=admin_user["headers"],
            json={"status": "blocked", "blocked_reason": "attempt"},
        )
        assert response.status_code == 403, label
        deleted = api_client.request(
            "DELETE",
            f"/api/v1/admin/users/{target['id']}",
            headers=admin_user["headers"],
            json={"confirm": True},
        )
        assert deleted.status_code == 403, label


def test_owner_role_management_takes_effect_immediately(
    api_client: TestClient,
    owner_user: dict,
    registered_user: dict,
    test_db_session: Session,
):
    promoted = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=owner_user["headers"],
        json={"role": "admin"},
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["role"] == "admin"
    # The existing access token is enough: the role is read per request.
    assert (
        api_client.get(
            "/api/v1/admin/users", headers=registered_user["headers"]
        ).status_code
        == 200
    )
    demoted = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=owner_user["headers"],
        json={"role": "user"},
    )
    assert demoted.status_code == 200
    assert (
        api_client.get(
            "/api/v1/admin/users", headers=registered_user["headers"]
        ).status_code
        == 403
    )


def test_owner_role_is_not_assignable_and_owner_is_protected(
    api_client: TestClient, owner_user: dict, registered_user: dict
):
    grant_owner = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=owner_user["headers"],
        json={"role": "owner"},
    )
    assert grant_owner.status_code == 422

    own_role = api_client.patch(
        f"/api/v1/admin/users/{owner_user['id']}",
        headers=owner_user["headers"],
        json={"role": "user"},
    )
    assert own_role.status_code == 403
    own_block = api_client.patch(
        f"/api/v1/admin/users/{owner_user['id']}",
        headers=owner_user["headers"],
        json={"status": "blocked", "blocked_reason": "self"},
    )
    assert own_block.status_code == 403

    for headers in (owner_user["headers"],):
        assert (
            api_client.request(
                "DELETE",
                f"/api/v1/admin/users/{owner_user['id']}",
                headers=headers,
                json={"confirm": True},
            ).status_code
            == 403
        )
    # Ordinary self-deletion must not remove the owner either.
    assert (
        api_client.delete("/api/v1/auth", headers=owner_user["headers"]).status_code
        == 403
    )
    assert (
        api_client.get("/api/v1/auth/me", headers=owner_user["headers"]).status_code
        == 200
    )


def test_blocked_account_is_denied_everywhere(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    blocked = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"status": "blocked", "blocked_reason": "terms violation"},
    )
    assert blocked.status_code == 200

    login = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": registered_user["username"],
            "password": "StrongPassword123!",
        },
    )
    assert login.status_code == 403
    assert login.json()["detail"] == "Account is blocked"

    # An already issued access token stops working immediately.
    assert (
        api_client.get(
            "/api/v1/auth/me", headers=registered_user["headers"]
        ).status_code
        == 403
    )
    csrf = api_client.cookies.get("csrf_token")
    assert csrf
    refreshed = api_client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert refreshed.status_code == 403

    restored = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"status": "active"},
    )
    assert restored.status_code == 200
    relogin = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": registered_user["username"],
            "password": "StrongPassword123!",
        },
    )
    assert relogin.status_code == 200, relogin.text


def test_delete_requires_explicit_confirmation(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    path = f"/api/v1/admin/users/{registered_user['id']}"
    assert api_client.delete(path, headers=admin_user["headers"]).status_code == 422
    assert (
        api_client.request(
            "DELETE", path, headers=admin_user["headers"], json={"confirm": False}
        ).status_code
        == 422
    )


def test_delete_ordinary_user_keeps_ledger_and_events(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    headers = registered_user["headers"]
    product_id = sample_products["gpu"].id
    assert (
        api_client.post(
            "/api/v1/cart/products",
            headers=headers,
            json={"product_id": product_id, "quantity": 1},
        ).status_code
        == 200
    )
    order = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert order.status_code == 200, order.text
    order_id = order.json()["order"]["id"]
    review = api_client.post(
        f"/api/v1/products/{product_id}/reviews",
        headers=headers,
        json={"rating": 5, "body": "Отличная карта"},
    )
    assert review.status_code == 201, review.text

    facts = list(
        test_db_session.scalars(
            select(SaleLineFact).where(SaleLineFact.source_order_id == order_id)
        ).all()
    )
    assert facts, "checkout must write the historical ledger"
    user_id = registered_user["id"]

    deleted = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{user_id}",
        headers=admin_user["headers"],
        json={"confirm": True, "reason": "test cleanup"},
    )
    assert deleted.status_code == 204, deleted.text

    test_db_session.expire_all()
    assert test_db_session.get(User, user_id) is None
    assert (
        test_db_session.scalar(
            select(func.count(Order.id)).where(Order.user_id == user_id)
        )
        == 0
    )
    assert (
        test_db_session.scalar(
            select(func.count(Review.id)).where(Review.user_id == user_id)
        )
        == 0
    )
    assert test_db_session.scalar(
        select(func.count(SaleLineFact.id)).where(
            SaleLineFact.source_order_id == order_id
        )
    ) == len(facts)
    event = test_db_session.scalar(
        select(SiteEvent)
        .where(
            SiteEvent.event_type == "admin.user_deleted",
            SiteEvent.target_id == user_id,
        )
        .order_by(SiteEvent.id.desc())
    )
    assert event is not None
    assert event.actor_user_id == admin_user["id"]
    assert event.outcome == "success"


def test_admin_cannot_delete_self_through_user_admin(
    api_client: TestClient, admin_user: dict
):
    response = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{admin_user['id']}",
        headers=admin_user["headers"],
        json={"confirm": True},
    )
    assert response.status_code == 403
