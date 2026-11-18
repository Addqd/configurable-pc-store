"""Product, specification and image administration."""

from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.models import ProductSpecField, ProductSpecOption

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _payload(sample_products: dict, **overrides) -> dict:
    product_type = sample_products["gpu"].product_type
    payload = {
        "name": "Admin Probe GPU",
        "product_type_id": product_type.id,
        "manufacturer_id": sample_products["gpu"].manufacturer_id,
        "price": "349.99",
        "stock_quantity": 7,
        "description": "Создано администратором",
    }
    payload.update(overrides)
    return payload


def _create(api_client: TestClient, admin_user: dict, sample_products: dict, **extra):
    return api_client.post(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        json=_payload(sample_products, **extra),
    )


@pytest.fixture()
def media_root(monkeypatch):
    # Scratch media stays inside the workspace, never in the system temp dir.
    scratch = (
        Path(__file__).resolve().parents[2]
        / ".agent"
        / "tmp"
        / f"product-media-{uuid4().hex}"
    )
    monkeypatch.setenv("MEDIA_ROOT", str(scratch / "media"))
    get_settings.cache_clear()
    yield scratch / "media"
    get_settings.cache_clear()
    shutil.rmtree(scratch, ignore_errors=True)


def test_create_generates_unique_sku_and_slug(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    first = _create(api_client, admin_user, sample_products)
    assert first.status_code == 201, first.text
    created = first.json()
    assert created["sku"].startswith("TEST-")
    assert created["sku"] != sample_products["gpu"].sku
    assert created["slug"] == "admin-probe-gpu"
    assert created["is_active"] is True
    assert created["images"] == []
    assert created["cover_image_url"].endswith("/product-placeholder.jpg")
    assert created["specifications"] == {}

    second = _create(api_client, admin_user, sample_products)
    assert second.status_code == 201, second.text
    assert second.json()["slug"] == "admin-probe-gpu-2"
    assert second.json()["sku"] != created["sku"]

    duplicate_sku = _create(
        api_client, admin_user, sample_products, sku=created["sku"], name="Other card"
    )
    assert duplicate_sku.status_code == 409
    duplicate_slug = _create(
        api_client, admin_user, sample_products, slug=created["slug"], name="Other card"
    )
    assert duplicate_slug.status_code == 409

    public = api_client.get("/api/v1/products", params={"q": "Admin Probe GPU"})
    assert public.status_code == 200
    assert public.json()["total"] == 2


def test_create_validation(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    unknown_manufacturer = _create(
        api_client, admin_user, sample_products, manufacturer_id=999_999
    )
    assert unknown_manufacturer.status_code == 422
    assert "manufacturer" in unknown_manufacturer.json()["detail"].lower()

    unknown_type = _create(
        api_client, admin_user, sample_products, product_type_id=999_999
    )
    assert unknown_type.status_code == 422

    negative_price = _create(api_client, admin_user, sample_products, price="-5.00")
    assert negative_price.status_code == 422

    negative_stock = _create(api_client, admin_user, sample_products, stock_quantity=-1)
    assert negative_stock.status_code == 422

    extra_field = _create(api_client, admin_user, sample_products, is_featured=True)
    assert extra_field.status_code == 422


def test_specification_template_and_validation(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    type_id = sample_products["gpu"].product_type_id
    field = ProductSpecField(
        product_type_id=type_id,
        code="chipset",
        label="Чипсет",
        sort_order=0,
        is_required=True,
    )
    test_db_session.add(field)
    test_db_session.flush()
    test_db_session.add_all(
        [
            ProductSpecOption(field_id=field.id, value="GeForce", sort_order=0),
            ProductSpecOption(field_id=field.id, value="Radeon", sort_order=1),
        ]
    )
    test_db_session.flush()

    template = api_client.get(
        f"/api/v1/admin/product-types/{type_id}/spec-fields",
        headers=admin_user["headers"],
    )
    assert template.status_code == 200
    body = template.json()
    assert body["product_type_id"] == type_id
    assert body["fields"][0]["code"] == "chipset"
    assert body["fields"][0]["is_required"] is True
    assert [option["value"] for option in body["fields"][0]["options"]] == [
        "GeForce",
        "Radeon",
    ]

    missing = _create(api_client, admin_user, sample_products)
    assert missing.status_code == 422
    assert "Чипсет" in missing.json()["detail"]

    unknown = _create(
        api_client, admin_user, sample_products, specifications={"socket": "AM5"}
    )
    assert unknown.status_code == 422
    assert "Unknown specification" in unknown.json()["detail"]

    disallowed = _create(
        api_client, admin_user, sample_products, specifications={"chipset": "Intel"}
    )
    assert disallowed.status_code == 422

    valid = _create(
        api_client, admin_user, sample_products, specifications={"chipset": "GeForce"}
    )
    assert valid.status_code == 201, valid.text
    assert valid.json()["specifications"] == {"chipset": "GeForce"}
    assert valid.json()["technical_specs"]["chipset"] == "GeForce"

    updated = api_client.patch(
        f"/api/v1/admin/products/{valid.json()['id']}",
        headers=admin_user["headers"],
        json={"specifications": {"chipset": "Radeon"}},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["specifications"] == {"chipset": "Radeon"}


def test_update_and_soft_delete(
    api_client: TestClient, admin_user: dict, sample_products: dict
):
    created = _create(api_client, admin_user, sample_products)
    assert created.status_code == 201
    product_id = created.json()["id"]
    path = f"/api/v1/admin/products/{product_id}"

    updated = api_client.patch(
        path,
        headers=admin_user["headers"],
        json={"price": "299.50", "stock_quantity": 2, "on_sale": True},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["price"] == "299.50"
    assert body["stock_quantity"] == 2
    assert body["on_sale"] is True
    assert body["slug"] == "admin-probe-gpu"

    assert (
        api_client.patch(
            path,
            headers=admin_user["headers"],
            json={"product_type_id": 999_999},
        ).status_code
        == 422
    )
    assert (
        api_client.patch(
            path, headers=admin_user["headers"], json={"price": None}
        ).status_code
        == 422
    )

    deleted = api_client.delete(path, headers=admin_user["headers"])
    assert deleted.status_code == 204
    detail = api_client.get(path, headers=admin_user["headers"]).json()
    assert detail["is_active"] is False
    assert (
        api_client.get("/api/v1/products", params={"q": "Admin Probe GPU"}).json()[
            "total"
        ]
        == 0
    )
    # Idempotent soft delete, no duplicate journal entry.
    assert api_client.delete(path, headers=admin_user["headers"]).status_code == 204

    inactive = api_client.get(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        params={"status": "inactive", "q": "Admin Probe GPU"},
    ).json()
    assert inactive["total"] == 1
    active = api_client.get(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        params={"status": "active", "q": "Admin Probe GPU"},
    ).json()
    assert active["total"] == 0


def test_soft_delete_preserves_order_history(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    created = _create(api_client, admin_user, sample_products)
    assert created.status_code == 201
    product_id = created.json()["id"]
    headers = registered_user["headers"]
    added = api_client.post(
        "/api/v1/cart/products",
        headers=headers,
        json={"product_id": product_id, "quantity": 1},
    )
    assert added.status_code == 200, added.text
    order = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert order.status_code == 200, order.text

    assert (
        api_client.delete(
            f"/api/v1/admin/products/{product_id}", headers=admin_user["headers"]
        ).status_code
        == 204
    )
    orders = api_client.get("/api/v1/cart/orders", headers=headers).json()
    assert any(
        item["product_id"] == product_id
        for order_body in orders
        for item in order_body["items"]
    )


def test_image_upload_order_delete_and_limits(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    media_root: Path,
):
    created = _create(api_client, admin_user, sample_products)
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    images_path = f"/api/v1/admin/products/{product_id}/images"
    headers = admin_user["headers"]

    first = api_client.post(
        images_path,
        headers=headers,
        files={"file": ("cover.jpg", JPEG, "image/jpeg")},
        data={"alt_text": "  Вид спереди  "},
    )
    assert first.status_code == 201, first.text
    cover = first.json()
    assert cover["url"].startswith("/media/products/")
    assert cover["alt_text"] == "Вид спереди"
    assert cover["is_cover"] is True
    assert cover["sort_order"] == 0
    assert (media_root / "products").is_dir()

    second = api_client.post(
        images_path,
        headers=headers,
        files={
            "file": ("second.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png")
        },
    )
    assert second.status_code == 201
    assert second.json()["is_cover"] is False
    assert second.json()["sort_order"] == 1

    media = api_client.get(cover["url"])
    assert media.status_code == 200
    assert media.headers["content-type"] == "image/jpeg"
    assert media.headers["x-content-type-options"] == "nosniff"

    reordered = api_client.put(
        images_path + "/order",
        headers=headers,
        json={"image_ids": [second.json()["id"], cover["id"]]},
    )
    assert reordered.status_code == 200, reordered.text
    assert [row["id"] for row in reordered.json()] == [
        second.json()["id"],
        cover["id"],
    ]
    assert reordered.json()[0]["is_cover"] is True
    assert (
        api_client.put(
            images_path + "/order",
            headers=headers,
            json={"image_ids": [cover["id"]]},
        ).status_code
        == 422
    )

    assert (
        api_client.delete(
            images_path + f"/{second.json()['id']}", headers=headers
        ).status_code
        == 204
    )
    assert api_client.get(second.json()["url"]).status_code == 404
    assert api_client.get(cover["url"]).status_code == 200

    invalid = api_client.post(
        images_path,
        headers=headers,
        files={"file": ("evil.jpg", b"GIF89a" + b"\x00" * 16, "image/jpeg")},
    )
    assert invalid.status_code == 422

    oversized = api_client.post(
        images_path,
        headers=headers,
        files={"file": ("big.jpg", JPEG + b"\x00" * (5 * 1024 * 1024), "image/jpeg")},
    )
    assert oversized.status_code == 413

    # The limit counts stored rows: fill up to ten and reject the eleventh.
    existing = api_client.get(images_path, headers=headers).json()
    for index in range(10 - len(existing)):
        response = api_client.post(
            images_path,
            headers=headers,
            files={"file": (f"extra-{index}.jpg", JPEG, "image/jpeg")},
        )
        assert response.status_code == 201, response.text
    eleventh = api_client.post(
        images_path,
        headers=headers,
        files={"file": ("eleventh.jpg", JPEG, "image/jpeg")},
    )
    assert eleventh.status_code == 409
    assert len(api_client.get(images_path, headers=headers).json()) == 10
