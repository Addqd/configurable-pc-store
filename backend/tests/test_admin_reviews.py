"""Review administration plus public visibility and aggregate compatibility."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient


def _create_admin_review(
    api_client: TestClient, admin_user: dict, product_id: int, **overrides
):
    payload = {
        "author_name": "Редакция PC Builder",
        "rating": 5,
        "body": "Отличная видеокарта для 1440p",
    }
    payload.update(overrides)
    return api_client.post(
        f"/api/v1/admin/products/{product_id}/reviews",
        headers=admin_user["headers"],
        json=payload,
    )


def test_admin_review_defaults_and_public_visibility(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    product = sample_products["gpu"]
    created = _create_admin_review(api_client, admin_user, product.id)
    assert created.status_code == 201, created.text
    review = created.json()
    assert review["user_id"] is None
    assert review["source"] == "admin"
    assert review["author_name"] == "Редакция PC Builder"
    assert review["store_reply"] is None
    assert review["is_published"] is True
    assert review["displayed_at"] is not None
    displayed = datetime.fromisoformat(review["displayed_at"])
    assert abs((datetime.now(UTC) - displayed).total_seconds()) < 120

    public = api_client.get(f"/api/v1/products/{product.id}/reviews")
    assert public.status_code == 200
    body = public.json()
    assert body["total"] == 1
    assert body["average_rating"] == 5.0
    item = body["items"][0]
    assert item["user_id"] is None
    assert item["reviewer_name"] == "Редакция PC Builder"
    assert item["displayed_at"] == review["displayed_at"]
    assert item["store_reply"] is None

    catalog = api_client.get(f"/api/v1/products/{product.slug}").json()
    assert catalog["average_rating"] == 5.0
    assert catalog["review_count"] == 1


def test_admin_review_explicit_fields_are_kept(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    product = sample_products["cpu"]
    created = _create_admin_review(
        api_client,
        admin_user,
        product.id,
        rating=3,
        is_published=False,
        displayed_at="2024-05-01T12:00:00+00:00",
        store_reply="Спасибо за отзыв",
    )
    assert created.status_code == 201, created.text
    review = created.json()
    assert review["rating"] == 3
    assert review["is_published"] is False
    assert review["displayed_at"].startswith("2024-05-01T12:00:00")
    assert review["store_reply"] == "Спасибо за отзыв"

    # Draft reviews are excluded from public listings and aggregates.
    public = api_client.get(f"/api/v1/products/{product.id}/reviews").json()
    assert public["total"] == 0
    assert public["items"] == []
    assert public["average_rating"] == 0.0

    admin_list = api_client.get(
        "/api/v1/admin/reviews",
        headers=admin_user["headers"],
        params={"product_id": product.id, "status": "unpublished"},
    ).json()
    assert admin_list["total"] == 1
    assert admin_list["items"][0]["store_reply"] == "Спасибо за отзыв"

    published = api_client.patch(
        f"/api/v1/admin/reviews/{review['id']}",
        headers=admin_user["headers"],
        json={"is_published": True, "rating": 4},
    )
    assert published.status_code == 200, published.text
    assert published.json()["is_published"] is True
    assert published.json()["rating"] == 4
    assert api_client.get(f"/api/v1/products/{product.id}/reviews").json()["total"] == 1


def test_published_only_average(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    product = sample_products["ram"]
    for rating, published in ((5, True), (3, True), (1, False)):
        response = _create_admin_review(
            api_client,
            admin_user,
            product.id,
            rating=rating,
            is_published=published,
            body=f"Оценка {rating}",
        )
        assert response.status_code == 201, response.text
    public = api_client.get(f"/api/v1/products/{product.id}/reviews").json()
    assert public["total"] == 2
    assert public["average_rating"] == 4.0
    assert [item["rating"] for item in public["items"]] == [5, 3] or [
        item["rating"] for item in public["items"]
    ] == [3, 5]


def test_customer_review_content_is_not_editable_by_admin(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    product = sample_products["cpu"]
    headers = registered_user["headers"]
    assert (
        api_client.post(
            "/api/v1/cart/products",
            headers=headers,
            json={"product_id": product.id, "quantity": 1},
        ).status_code
        == 200
    )
    assert (
        api_client.post("/api/v1/cart/checkout", headers=headers, json={}).status_code
        == 200
    )
    created = api_client.post(
        f"/api/v1/products/{product.id}/reviews",
        headers=headers,
        json={"rating": 4, "body": "Хороший процессор"},
    )
    assert created.status_code == 201, created.text
    review_id = created.json()["id"]

    content_edit = api_client.patch(
        f"/api/v1/admin/reviews/{review_id}",
        headers=admin_user["headers"],
        json={"rating": 1},
    )
    assert content_edit.status_code == 422
    assert "cannot be edited" in content_edit.json()["detail"]

    moderated = api_client.patch(
        f"/api/v1/admin/reviews/{review_id}",
        headers=admin_user["headers"],
        json={"is_published": False, "store_reply": "Спасибо!"},
    )
    assert moderated.status_code == 200, moderated.text
    assert moderated.json()["source"] == "user"
    assert moderated.json()["user_id"] == registered_user["id"]
    assert moderated.json()["is_published"] is False
    assert moderated.json()["store_reply"] == "Спасибо!"

    public = api_client.get(f"/api/v1/products/{product.id}/reviews").json()
    assert public["total"] == 0

    admin_list = api_client.get(
        "/api/v1/admin/reviews",
        headers=admin_user["headers"],
        params={"product_id": product.id, "status": "unpublished"},
    ).json()
    assert admin_list["total"] == 1
    assert admin_list["items"][0]["reviewer_name"] == "Test Person"


def test_customer_review_still_requires_purchase(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    product = sample_products["case"]
    denied = api_client.post(
        f"/api/v1/products/{product.id}/reviews",
        headers=registered_user["headers"],
        json={"rating": 5, "body": "Без покупки"},
    )
    assert denied.status_code == 403


def test_admin_review_delete(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    product = sample_products["psu"]
    created = _create_admin_review(api_client, admin_user, product.id)
    assert created.status_code == 201
    review_id = created.json()["id"]
    deleted = api_client.delete(
        f"/api/v1/admin/reviews/{review_id}", headers=admin_user["headers"]
    )
    assert deleted.status_code == 204
    assert api_client.get(f"/api/v1/products/{product.id}/reviews").json()["total"] == 0
    assert (
        api_client.delete(
            f"/api/v1/admin/reviews/{review_id}", headers=admin_user["headers"]
        ).status_code
        == 404
    )


def test_admin_review_creation_requires_product(
    api_client: TestClient, admin_user: dict
):
    response = _create_admin_review(api_client, admin_user, 999_999)
    assert response.status_code == 404
