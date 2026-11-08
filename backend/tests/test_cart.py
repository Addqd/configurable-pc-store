"""Rollback-safe demo checkout integration tests."""

from fastapi.testclient import TestClient


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
        json={"product_id": second, "quantity": 2},
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
            json={"product_id": second, "quantity": 99999},
        ).status_code
        == 409
    )
    assert (
        api_client.post(
            "/api/v1/cart/buy-now", json={"product_id": second, "quantity": 1}
        ).status_code
        == 401
    )
