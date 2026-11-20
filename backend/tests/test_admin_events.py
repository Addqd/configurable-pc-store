"""Event journal recording, filtering, deduplication and retention."""

from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import event as sa_event
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Product, SiteEvent, User
from app.services import event_service
from tests.conftest import create_account


def _event_count(session: Session, event_type: str) -> int:
    return int(
        session.scalar(
            select(func.count(SiteEvent.id)).where(SiteEvent.event_type == event_type)
        )
        or 0
    )


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


def test_success_event_rolls_back_with_the_business_operation(
    isolated_connection, test_db_session: Session, sample_products: dict
):
    """F1: a rolled back operation must not leave a success entry behind."""
    event_type = "catalog.rollback_probe"
    with Session(
        bind=isolated_connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    ) as db:
        product = db.get(Product, sample_products["gpu"].id)
        assert event_service.record_event(
            db,
            category=event_service.CATEGORY_CATALOG,
            event_type=event_type,
            target_type="product",
            target_id=product.id,
        )
        db.flush()
        # Written inside the caller's transaction ...
        assert _event_count(db, event_type) == 1
        db.rollback()
        # ... and gone together with the business change of that transaction.
        assert _event_count(db, event_type) == 0
    test_db_session.expire_all()
    assert _event_count(test_db_session, event_type) == 0


def test_success_event_commits_with_the_business_operation(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """F1: a committed operation keeps exactly one matching success entry."""
    created = api_client.post(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        json={
            "name": "Журнал успеха",
            "product_type_id": sample_products["gpu"].product_type_id,
            "manufacturer_id": sample_products["gpu"].manufacturer_id,
            "price": "199.99",
        },
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]

    test_db_session.expire_all()
    events = test_db_session.scalars(
        select(SiteEvent).where(
            SiteEvent.event_type == "catalog.product_created",
            SiteEvent.outcome == "success",
            SiteEvent.target_type == "product",
            SiteEvent.target_id == product_id,
        )
    ).all()
    assert len(events) == 1
    assert events[0].actor_user_id == admin_user["id"]


def test_rejected_operation_is_journaled_only_as_a_failure(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """F1: the rejected attempt is recorded independently, the success is not."""
    headers = admin_user["headers"]
    base = {
        "product_type_id": sample_products["gpu"].product_type_id,
        "manufacturer_id": sample_products["gpu"].manufacturer_id,
        "price": "99.99",
    }
    first = api_client.post(
        "/api/v1/admin/products", headers=headers, json={**base, "name": "Регресс А"}
    )
    assert first.status_code == 201, first.text
    duplicate = api_client.post(
        "/api/v1/admin/products",
        headers=headers,
        json={**base, "name": "Регресс Б", "sku": first.json()["sku"]},
    )
    assert duplicate.status_code == 409

    test_db_session.expire_all()
    events = test_db_session.scalars(
        select(SiteEvent).where(
            SiteEvent.event_type == "catalog.product_created",
            SiteEvent.actor_user_id == admin_user["id"],
        )
    ).all()
    rejected = [
        event
        for event in events
        if event.outcome == "failure"
        and (event.details or {}).get("name") == "Регресс Б"
    ]
    assert rejected, "the rejected attempt must be recorded in its own transaction"
    assert not [
        event
        for event in events
        if event.outcome == "success"
        and (event.details or {}).get("name") == "Регресс Б"
    ]


def test_event_journal_resolves_actor_usernames(
    api_client: TestClient, admin_user: dict, registered_user: dict
):
    """The journal shows the real username next to the numeric actor id."""
    body = _events(api_client, admin_user, actor_user_id=registered_user["id"])
    assert body["items"], "a fresh account must have at least one auth event"
    for item in body["items"]:
        assert item["actor_user_id"] == registered_user["id"]
        assert item["actor_username"] == registered_user["username"]


def test_event_journal_keeps_owner_role_and_actor_snapshot(
    api_client: TestClient,
    owner_user: dict,
    registered_user: dict,
    test_db_session: Session,
):
    """Owner actions keep their role distinction and snapshot the actor, not the target."""
    promoted = api_client.patch(
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=owner_user["headers"],
        json={"role": "admin"},
    )
    assert promoted.status_code == 200, promoted.text

    body = _events(
        api_client,
        owner_user,
        target_type="user",
        target_id=registered_user["id"],
        page_size=50,
    )
    changes = [
        item
        for item in body["items"]
        if item["event_type"] == "admin.user_role_changed"
    ]
    assert changes
    assert all(item["actor_role"] == "owner" for item in changes)
    assert all(item["actor_username"] == owner_user["username"] for item in changes)
    assert all(item["actor_user_id"] == owner_user["id"] for item in changes)

    test_db_session.expire_all()
    stored = test_db_session.scalars(
        select(SiteEvent).where(
            SiteEvent.event_type == "admin.user_role_changed",
            SiteEvent.actor_user_id == owner_user["id"],
        )
    ).all()
    assert stored
    # The snapshot belongs to the actor, never to the edited target account.
    assert all(
        (item.details or {}).get("actor_username") == owner_user["username"]
        for item in stored
    )


def test_deleted_actor_keeps_the_recorded_username_snapshot(
    api_client: TestClient, admin_user: dict, test_db_session: Session
):
    victim = create_account(api_client, role="user")
    deleted = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{victim['id']}",
        headers=admin_user["headers"],
        json={"confirm": True},
    )
    assert deleted.status_code == 204
    test_db_session.expire_all()
    assert test_db_session.get(User, victim["id"]) is None

    body = _events(api_client, admin_user, actor_user_id=victim["id"])
    assert body["items"], "the deleted actor keeps its journal entries"
    for item in body["items"]:
        assert item["actor_user_id"] == victim["id"]
        assert item["actor_username"] == victim["username"]


def test_unknown_and_system_actors_have_no_invented_username(
    api_client: TestClient, admin_user: dict, test_db_session: Session
):
    orphan = SiteEvent(
        actor_user_id=987654321,
        actor_role="admin",
        category="account",
        event_type="account.deleted",
        outcome="success",
        details={},
    )
    system_event = SiteEvent(
        actor_user_id=None,
        actor_role=None,
        category="system",
        event_type="system.retention_cleanup",
        outcome="success",
        details={},
    )
    test_db_session.add_all([orphan, system_event])
    test_db_session.flush()

    body = _events(api_client, admin_user, page_size=200)
    by_id = {item["id"]: item for item in body["items"]}

    # No live row and no snapshot: the id is preserved, the name is not invented.
    assert by_id[orphan.id]["actor_user_id"] == 987654321
    assert by_id[orphan.id]["actor_username"] is None
    # System events carry neither an actor id nor a username.
    assert by_id[system_event.id]["actor_user_id"] is None
    assert by_id[system_event.id]["actor_username"] is None


def test_event_page_resolves_usernames_with_a_single_users_query(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    isolated_connection,
):
    """Pagination must not degrade into one username lookup per journal row."""
    for _ in range(3):
        api_client.post(
            "/api/v1/auth/login",
            json={
                "email_or_username": registered_user["username"],
                "password": "StrongPassword123!",
            },
        )

    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        if "users.username" in statement:
            statements.append(statement)

    sa_event.listen(isolated_connection.engine, "before_cursor_execute", record)
    try:
        body = _events(api_client, admin_user, page_size=50)
    finally:
        sa_event.remove(isolated_connection.engine, "before_cursor_execute", record)

    assert body["items"]
    assert len(statements) == 1, statements
    resolved = [item for item in body["items"] if item["actor_username"] is not None]
    assert resolved, "at least one event on the page has a resolvable actor"


def test_event_key_is_idempotent_inside_one_transaction(isolated_connection):
    """F1: a retried idempotent operation keeps a single success entry."""
    key = f"probe:{uuid4().hex}"
    with Session(
        bind=isolated_connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    ) as db:
        first = event_service.record_event(
            db,
            category=event_service.CATEGORY_SYSTEM,
            event_type="system.probe",
            event_key=key,
        )
        second = event_service.record_event(
            db,
            category=event_service.CATEGORY_SYSTEM,
            event_type="system.probe",
            event_key=key,
        )
        db.flush()
        assert first is True
        assert second is False
        assert (
            db.scalar(
                select(func.count(SiteEvent.id)).where(SiteEvent.event_key == key)
            )
            == 1
        )
        db.rollback()
