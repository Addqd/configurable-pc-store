"""Rollback-safe demo checkout integration tests."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.api.cart import _cart_to_out
from app.models import Cart, CartItem, ProductImage, User
from tests.conftest import apply_characteristics as conftest_apply_characteristics
from tests.test_compatibility_engine import _parts


def test_checkout_is_atomic_and_not_repeated(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    pid = sample_products["gpu"].id
    headers = registered_user["headers"]
    add = api_client.post(
        "/api/v1/cart/products",
        headers=headers,
        json={"product_id": pid, "quantity": 2},
    )
    assert add.status_code == 200, add.text
    purchased = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert purchased.status_code == 200, purchased.text
    order = purchased.json()["order"]
    assert order["item_count"] == 2
    assert order["total_amount"] == "399.98"
    assert len(order["items"]) == 1
    assert order["items"][0]["product_id"] == pid
    assert order["items"][0]["name_snapshot"] == sample_products["gpu"].name
    retry = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert retry.status_code == 409
    cart = api_client.get("/api/v1/cart", headers=headers).json()
    assert cart["items"] == []
    orders = api_client.get("/api/v1/cart/orders", headers=headers).json()
    assert len(orders) == 1


def test_cart_item_must_belong_to_user(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    add = api_client.post(
        "/api/v1/cart/products",
        headers=registered_user["headers"],
        json={"product_id": sample_products["cpu"].id, "quantity": 1},
    )
    assert add.status_code == 200
    item_id = add.json()["items"][0]["id"]
    assert (
        api_client.patch(f"/api/v1/cart/{item_id}", json={"quantity": 2}).status_code
        == 401
    )
    assert api_client.delete(f"/api/v1/cart/{item_id}").status_code == 401
    assert (
        api_client.patch(
            f"/api/v1/cart/{item_id}",
            headers=registered_user["headers"],
            json={"quantity": 0},
        ).status_code
        == 422
    )


def test_insufficient_stock_rejected(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    response = api_client.post(
        "/api/v1/cart/products",
        headers=registered_user["headers"],
        json={"product_id": sample_products["gpu"].id, "quantity": 500},
    )
    assert response.status_code == 422
    assert (
        api_client.get("/api/v1/cart", headers=registered_user["headers"]).json()[
            "items"
        ]
        == []
    )


def test_buy_now_preserves_cart_and_creates_separate_order(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    key = str(uuid4())
    headers = registered_user["headers"]
    first = sample_products["cpu"].id
    second = sample_products["gpu"].id
    assert (
        api_client.post(
            "/api/v1/cart/products",
            headers=headers,
            json={"product_id": first, "quantity": 1},
        ).status_code
        == 200
    )
    before = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    bought = api_client.post(
        "/api/v1/cart/buy-now",
        headers=headers,
        json={"product_id": second, "quantity": 2, "idempotency_key": key},
    )
    assert bought.status_code == 200
    order = bought.json()["order"]
    assert [item["product_id"] for item in order["items"]] == [second]
    assert order["item_count"] == 2
    assert api_client.get("/api/v1/cart", headers=headers).json()["items"] == before
    assert any(
        item["id"] == order["id"]
        for item in api_client.get("/api/v1/cart/orders", headers=headers).json()
    )
    assert (
        api_client.post(
            "/api/v1/cart/buy-now",
            headers=headers,
            json={
                "product_id": second,
                "quantity": 99999,
                "idempotency_key": str(uuid4()),
            },
        ).status_code
        == 409
    )
    assert (
        api_client.post(
            "/api/v1/cart/buy-now",
            json={"product_id": second, "quantity": 1, "idempotency_key": str(uuid4())},
        ).status_code
        == 401
    )


def test_buy_now_replay_and_key_payload_conflict(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    headers = registered_user["headers"]
    key = str(uuid4())
    payload = {
        "product_id": sample_products["gpu"].id,
        "quantity": 2,
        "idempotency_key": key,
    }
    first = api_client.post("/api/v1/cart/buy-now", headers=headers, json=payload)
    replay = api_client.post("/api/v1/cart/buy-now", headers=headers, json=payload)
    assert first.status_code == replay.status_code == 200
    assert first.json()["order"]["id"] == replay.json()["order"]["id"]
    assert (
        api_client.post(
            "/api/v1/cart/buy-now", headers=headers, json={**payload, "quantity": 3}
        ).status_code
        == 409
    )
    another = api_client.post(
        "/api/v1/cart/buy-now",
        headers=headers,
        json={**payload, "idempotency_key": str(uuid4())},
    )
    assert another.status_code == 200
    assert another.json()["order"]["id"] != first.json()["order"]["id"]
    assert len(api_client.get("/api/v1/cart/orders", headers=headers).json()) == 2


@pytest.mark.parametrize(
    "scenario,expected",
    [
        ("renamed", "Сборка: Gaming PC"),
        ("deleted", "Сборка: Gaming PC"),
        ("legacy", "Сборка: Workstation"),
    ],
)
def test_build_order_name_uses_cart_snapshot(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
    scenario: str,
    expected: str,
):
    fake, slots = _parts()
    for slot, product in sample_products.items():
        conftest_apply_characteristics(
            test_db_session, product, fake.parts[slots[slot]].values
        )
    headers = registered_user["headers"]
    items = [
        {"slot": slot, "product_id": product.id}
        for slot, product in sample_products.items()
    ]
    build = api_client.post(
        "/api/v1/builds", headers=headers, json={"name": "Gaming PC", "items": items}
    )
    assert build.status_code == 201, build.text
    bid = build.json()["id"]
    add = api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"saved_build_id": bid}
    )
    assert add.status_code == 200, add.text
    item_id = add.json()["items"][0]["id"]
    assert (
        api_client.put(
            f"/api/v1/builds/{bid}", headers=headers, json={"name": "Workstation"}
        ).status_code
        == 200
    )
    updated = api_client.patch(
        f"/api/v1/cart/{item_id}", headers=headers, json={"quantity": 2}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["items"][0]["build_snapshot"]["name"] == "Gaming PC"
    if scenario == "deleted":
        assert (
            api_client.delete(f"/api/v1/builds/{bid}", headers=headers).status_code
            == 204
        )
    if scenario == "legacy":
        row = test_db_session.get(CartItem, item_id)
        row.build_snapshot = {
            k: v for k, v in row.build_snapshot.items() if k != "name"
        }
        test_db_session.flush()
    checkout = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert checkout.status_code == 200, checkout.text
    entry = checkout.json()["order"]["items"][0]
    assert entry["name_snapshot"] == expected
    assert entry["quantity"] == 2
    assert len(entry["components_snapshot"]) == 8


# ── Characteristic payload and query growth ──────────────────────────────────


def test_cart_product_payload_carries_structured_short_characteristics(
    api_client: TestClient,
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """The cart exposes the same structured rows the storefront localizes."""
    product = sample_products["gpu"]
    conftest_apply_characteristics(
        test_db_session, product, {"cart_probe_length_mm": 269.1}
    )
    add = api_client.post(
        "/api/v1/cart/products",
        headers=registered_user["headers"],
        json={"product_id": product.id, "quantity": 1},
    )
    assert add.status_code == 200, add.text
    info = add.json()["items"][0]["product"]

    rows = info["short_characteristics"]
    assert [row["code"] for row in rows] == ["cart_probe_length_mm"]
    row = rows[0]
    assert row["value"] == 269.1
    assert isinstance(row["value"], float)
    assert row["data_type"] == "number"
    assert row["display_value"] == "269.1"
    # `specs` stays the ready-to-render list derived from the same rows.
    assert info["specs"] == ["269.1"]


def _count_statements(db: Session, action) -> list[str]:
    """Statements emitted while `action()` runs, including its flushes."""
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return statements


def _cart_with_items(db: Session, user_id: int, products: list) -> Cart:
    cart = Cart(user_id=user_id)
    db.add(cart)
    db.flush()
    for product in products:
        db.add(
            CartItem(
                cart_id=cart.id,
                kind="product",
                product_id=product.id,
                quantity=1,
                build_snapshot=None,
            )
        )
    db.flush()
    return cart


def test_cart_serialization_query_count_does_not_grow_with_items(
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """Images are eager-loaded once, not per cart line."""
    everything = list(sample_products.values())
    for product in everything:
        test_db_session.add(
            ProductImage(
                product_id=product.id,
                image_url=f"/media/probe-{product.id}.jpg",
                sort_order=0,
            )
        )
    test_db_session.flush()

    user = test_db_session.get(User, registered_user["id"])
    assert user is not None
    small = _cart_with_items(test_db_session, user.id, everything[:2])
    large = _cart_with_items(test_db_session, user.id, everything)

    def serialization_statements(cart_id: int) -> list[str]:
        # Start every measurement from an empty identity map so nothing is served
        # from a collection loaded by a previous run.
        test_db_session.expire_all()
        loaded = _cart_to_out(test_db_session.get(Cart, cart_id), test_db_session)
        assert loaded.items
        return _count_statements(
            test_db_session,
            lambda: _cart_to_out(test_db_session.get(Cart, cart_id), test_db_session),
        )

    small_statements = serialization_statements(small.id)
    large_statements = serialization_statements(large.id)

    assert len(large_statements) == len(small_statements)
    assert len([s for s in large_statements if "product_images" in s]) == 1
    product_queries = [
        s for s in large_statements if "FROM products" in s and "cart_items" not in s
    ]
    assert len(product_queries) == 1
