"""Rollback-safe demo checkout integration tests."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import CartItem
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
        product.technical_specs = fake.parts[slots[slot]].technical_specs
    test_db_session.flush()
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
