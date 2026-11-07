"""Favorite semantics and review purchase/uniqueness authorization."""

from fastapi.testclient import TestClient


def test_favorite_delete_is_idempotent(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    pid = sample_products["gpu"].id
    path = f"/api/v1/favorites/{pid}"
    headers = registered_user["headers"]
    assert api_client.delete(path, headers=headers).status_code == 204
    assert (
        api_client.get(path + "/is_favorited", headers=headers).json()["is_favorited"]
        is False
    )
    assert api_client.post(path, headers=headers).status_code == 200
    assert api_client.post(path, headers=headers).status_code == 200
    assert (
        api_client.get(path + "/is_favorited", headers=headers).json()["is_favorited"]
        is True
    )
    assert api_client.delete(path, headers=headers).status_code == 204
    assert api_client.delete(path, headers=headers).status_code == 204
    assert (
        api_client.get(path + "/is_favorited", headers=headers).json()["is_favorited"]
        is False
    )


def test_review_requires_individual_completed_purchase(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    pid = sample_products["cpu"].id
    path = f"/api/v1/products/{pid}/reviews"
    headers = registered_user["headers"]
    no_purchase = api_client.post(
        path, headers=headers, json={"rating": 4, "body": "Nice"}
    )
    assert no_purchase.status_code == 403
    api_client.post(
        "/api/v1/cart/products",
        headers=headers,
        json={"product_id": pid, "quantity": 1},
    )
    checkout = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert checkout.status_code == 200, checkout.text
    reviewed = api_client.post(
        path, headers=headers, json={"rating": 5, "body": "Great"}
    )
    assert reviewed.status_code == 201, reviewed.text
    assert (
        api_client.post(
            path, headers=headers, json={"rating": 4, "body": "Again"}
        ).status_code
        == 409
    )
    assert api_client.get(path).json()["total"] == 1
    assert api_client.delete(path, headers=headers).status_code == 204
    assert api_client.get(path).json()["total"] == 0


def test_private_endpoints_require_auth(api_client: TestClient, sample_products: dict):
    pid = sample_products["cpu"].id
    assert api_client.get("/api/v1/favorites").status_code == 401
    assert api_client.get("/api/v1/profile").status_code == 401
    assert (
        api_client.post(
            f"/api/v1/products/{pid}/reviews", json={"rating": 5, "body": "Fake"}
        ).status_code
        == 401
    )
