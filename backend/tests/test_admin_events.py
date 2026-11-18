"""Event journal recording, filtering, deduplication and retention."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import SiteEvent, User
from tests.conftest import create_account


def _events(api_client: TestClient, admin_user: dict, **params) -> dict:
    response = api_client.get(
        "/api/v1/admin/events", headers=admin_user["headers"], params=params
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_auth_events_are_recorded_without_secrets(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    failed = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": registered_user["username"],
            "password": "DefinitelyWrongPassword1!",
        },
    )
    assert failed.status_code == 401

    failures = _events(api_client, admin_user, category="auth", outcome="failure")
    assert failures["total"] >= 1
    login_failed = [
        item for item in failures["items"] if item["event_type"] == "auth.login_failed"
    ]
    assert login_failed
    assert login_failed[0]["actor_user_id"] is None
    assert login_failed[0]["reason"] == "Invalid credentials"
    assert not login_failed[0]["details"]

    successes = _events(api_client, admin_user, category="auth", outcome="success")
    assert any(
        item["event_type"] == "auth.login_succeeded" for item in successes["items"]
    )
    for item in successes["items"]:
        serialized = str(item["details"]).lower()
        for forbidden in ("password", "token", "cookie", "secret"):
            assert forbidden not in serialized


def test_admin_actions_are_journaled_and_survive_deletion(
    api_client: TestClient,
    owner_user: dict,
    registered_user: dict,
    test_db_session: Session,
):
    user_id = registered_user["id"]
    promoted = api_client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=owner_user["headers"],
        json={"role": "admin"},
    )
    assert promoted.status_code == 200, promoted.text
    blocked = api_client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=owner_user["headers"],
        json={"status": "blocked", "blocked_reason": "policy"},
    )
    assert blocked.status_code == 200
    # Demote first so the ordinary deletion operation is allowed.
    demoted = api_client.patch(
        f"/api/v1/admin/users/{user_id}",
        headers=owner_user["headers"],
        json={"role": "user", "status": "active"},
    )
    assert demoted.status_code == 200, demoted.text

    events = _events(
        api_client, owner_user, target_type="user", target_id=user_id, page_size=50
    )
    types = {item["event_type"] for item in events["items"]}
    assert {"admin.user_role_changed", "admin.user_status_changed"} <= types
    assert all(item["actor_user_id"] == owner_user["id"] for item in events["items"])

    deleted = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{user_id}",
        headers=owner_user["headers"],
        json={"confirm": True, "reason": "cleanup"},
    )
    assert deleted.status_code == 204
    test_db_session.expire_all()
    assert test_db_session.get(User, user_id) is None

    # The journal outlives the deleted account: no foreign key, actor preserved.
    remaining = list(
        test_db_session.scalars(
            select(SiteEvent).where(SiteEvent.target_id == user_id)
        ).all()
    )
    assert any(event.event_type == "admin.user_deleted" for event in remaining)
    assert all(event.actor_user_id == owner_user["id"] for event in remaining)


def test_events_for_deleted_actor_are_retained(
    api_client: TestClient, admin_user: dict, test_db_session: Session
):
    victim = create_account(api_client, role="user")
    assert (
        api_client.get("/api/v1/auth/me", headers=victim["headers"]).status_code == 200
    )
    deleted = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{victim['id']}",
        headers=admin_user["headers"],
        json={"confirm": True},
    )
    assert deleted.status_code == 204
    test_db_session.expire_all()
    actor_events = list(
        test_db_session.scalars(
            select(SiteEvent).where(SiteEvent.actor_user_id == victim["id"])
        ).all()
    )
    assert actor_events, "auth events of a deleted actor must be preserved"
    assert all(event.actor_user_id is not None for event in actor_events)


def test_order_event_is_not_duplicated_for_idempotent_retry(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    key = str(uuid4())
    payload = {
        "product_id": sample_products["storage"].id,
        "quantity": 1,
        "idempotency_key": key,
    }
    first = api_client.post(
        "/api/v1/cart/buy-now", headers=registered_user["headers"], json=payload
    )
    assert first.status_code == 200, first.text
    order_id = first.json()["order"]["id"]
    second = api_client.post(
        "/api/v1/cart/buy-now", headers=registered_user["headers"], json=payload
    )
    assert second.status_code == 200, second.text
    assert second.json()["order"]["id"] == order_id

    test_db_session.expire_all()
    count = test_db_session.scalar(
        select(func.count(SiteEvent.id)).where(
            SiteEvent.event_key == f"order.created:{order_id}"
        )
    )
    assert count == 1


def test_event_filters_sorting_and_pagination(api_client: TestClient, admin_user: dict):
    options = api_client.get(
        "/api/v1/admin/events/filters", headers=admin_user["headers"]
    )
    assert options.status_code == 200
    body = options.json()
    assert "auth" in body["categories"]
    assert body["outcomes"]

    page_one = _events(api_client, admin_user, page_size=1, page=1)
    assert page_one["page_size"] == 1
    assert len(page_one["items"]) <= 1
    page_two = _events(api_client, admin_user, page_size=1, page=2)
    if page_one["total"] > 1:
        assert page_two["items"][0]["id"] != page_one["items"][0]["id"]

    ascending = _events(api_client, admin_user, sort="occurred_asc", page_size=20)
    timestamps = [item["occurred_at"] for item in ascending["items"]]
    assert timestamps == sorted(timestamps)

    invalid = api_client.get(
        "/api/v1/admin/events",
        headers=admin_user["headers"],
        params={"category": "not-a-category"},
    )
    assert invalid.status_code == 422


def test_read_requests_are_not_journaled(
    api_client: TestClient, admin_user: dict, test_db_session: Session
):
    before = test_db_session.scalar(select(func.count(SiteEvent.id)))
    for _ in range(3):
        api_client.get("/api/v1/admin/products", headers=admin_user["headers"])
        api_client.get("/api/v1/admin/users", headers=admin_user["headers"])
        api_client.get("/api/v1/admin/stats/overview", headers=admin_user["headers"])
    test_db_session.expire_all()
    after = test_db_session.scalar(select(func.count(SiteEvent.id)))
    assert after == before
