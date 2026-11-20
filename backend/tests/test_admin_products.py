"""Product, specification and image administration."""

from __future__ import annotations

import shutil
from io import BytesIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.models import (
    Manufacturer,
    ProductImage,
    ProductSpecField,
    ProductSpecOption,
    User,
)
from app.services import product_admin_service, product_image_service

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64
MEDIA_URL_PREFIX = "/api/v1/media/products"


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


@pytest.fixture()
def chipset_template(test_db_session: Session, sample_products: dict) -> int:
    """A required GPU template field with a closed dropdown list."""
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
    return type_id


@pytest.fixture()
def cpu_socket_template(test_db_session: Session, sample_products: dict) -> int:
    type_id = sample_products["cpu"].product_type_id
    field = ProductSpecField(
        product_type_id=type_id,
        code="socket",
        label="Сокет",
        sort_order=0,
        is_required=True,
    )
    test_db_session.add(field)
    test_db_session.flush()
    test_db_session.add_all(
        [
            ProductSpecOption(field_id=field.id, value="AM5", sort_order=0),
            ProductSpecOption(field_id=field.id, value="LGA1700", sort_order=1),
        ]
    )
    test_db_session.flush()
    return type_id


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
    chipset_template: int,
):
    type_id = chipset_template

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
    assert cover["url"].startswith(MEDIA_URL_PREFIX + "/")
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


def test_media_urls_are_served_through_the_api_prefix(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    media_root: Path,
):
    """F3: stored URLs work through the existing `/api` proxy prefix."""
    created = _create(api_client, admin_user, sample_products)
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    upload = api_client.post(
        f"/api/v1/admin/products/{product_id}/images",
        headers=admin_user["headers"],
        files={"file": ("cover.jpg", JPEG, "image/jpeg")},
    )
    assert upload.status_code == 201, upload.text
    url = upload.json()["url"]
    filename = url.rsplit("/", 1)[-1]
    assert url == f"{MEDIA_URL_PREFIX}/{filename}"

    served = api_client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/jpeg"
    assert served.headers["x-content-type-options"] == "nosniff"

    detail = api_client.get(
        f"/api/v1/admin/products/{product_id}", headers=admin_user["headers"]
    ).json()
    assert detail["cover_image_url"] == url
    assert [image["url"] for image in detail["images"]] == [url]
    public = api_client.get(f"/api/v1/products/{detail['slug']}").json()
    assert public["cover_image_url"] == url
    assert [image["url"] for image in public["images"]] == [url]

    # Already stored legacy URLs keep resolving.
    assert api_client.get(f"/media/products/{filename}").status_code == 200

    for path in (
        f"{MEDIA_URL_PREFIX}/" + "b" * 32 + ".jpg",
        f"{MEDIA_URL_PREFIX}/" + "b" * 32 + ".exe",
        f"{MEDIA_URL_PREFIX}/" + "b" * 31 + ".jpg",
        f"{MEDIA_URL_PREFIX}/nested/{filename}",
    ):
        assert api_client.get(path).status_code == 404, path


def test_technical_specs_cannot_bypass_template_validation(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    chipset_template: int,
):
    """F4: the same dropdown/required rules apply to both input properties."""
    headers = admin_user["headers"]

    disallowed = _create(
        api_client, admin_user, sample_products, technical_specs={"chipset": "Intel"}
    )
    assert disallowed.status_code == 422
    assert "not allowed" in disallowed.json()["detail"]

    conflict = _create(
        api_client,
        admin_user,
        sample_products,
        technical_specs={"chipset": "Intel"},
        specifications={"chipset": "GeForce"},
    )
    assert conflict.status_code == 422
    assert "Conflicting" in conflict.json()["detail"]

    missing = _create(
        api_client, admin_user, sample_products, technical_specs={"tdp": 250}
    )
    assert missing.status_code == 422
    assert "Чипсет" in missing.json()["detail"]

    valid = _create(
        api_client,
        admin_user,
        sample_products,
        technical_specs={"chipset": "Radeon", "tdp": 250},
    )
    assert valid.status_code == 201, valid.text
    body = valid.json()
    assert body["technical_specs"] == {"chipset": "Radeon", "tdp": 250}
    assert body["specifications"] == {"chipset": "Radeon"}

    path = f"/api/v1/admin/products/{body['id']}"
    bypass = api_client.patch(
        path, headers=headers, json={"technical_specs": {"chipset": "Intel"}}
    )
    assert bypass.status_code == 422
    cleared = api_client.patch(
        path, headers=headers, json={"technical_specs": {"chipset": "", "tdp": 250}}
    )
    assert cleared.status_code == 422

    updated = api_client.patch(
        path,
        headers=headers,
        json={"technical_specs": {"chipset": "GeForce", "tdp": 250}},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["technical_specs"] == {"chipset": "GeForce", "tdp": 250}

    # `technical_specs` replaces the stored value, so dropping the required
    # template code is refused instead of silently removing it.
    dropped = api_client.patch(
        path, headers=headers, json={"technical_specs": {"tdp": 300}}
    )
    assert dropped.status_code == 422
    assert "Чипсет" in dropped.json()["detail"]

    # Non-template legacy specifications keep working and stay readable.
    legacy = api_client.patch(
        path,
        headers=headers,
        json={"technical_specs": {"chipset": "GeForce", "tdp": 300, "length_mm": 320}},
    )
    assert legacy.status_code == 200, legacy.text
    assert legacy.json()["technical_specs"] == {
        "chipset": "GeForce",
        "tdp": 300,
        "length_mm": 320,
    }
    assert legacy.json()["specifications"] == {"chipset": "GeForce"}


def test_product_type_change_revalidates_specifications(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    chipset_template: int,
    cpu_socket_template: int,
):
    created = _create(
        api_client, admin_user, sample_products, specifications={"chipset": "GeForce"}
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    path = f"/api/v1/admin/products/{product_id}"
    headers = admin_user["headers"]

    without_socket = api_client.patch(
        path, headers=headers, json={"product_type_id": cpu_socket_template}
    )
    assert without_socket.status_code == 422
    assert "Сокет" in without_socket.json()["detail"]

    bypass_attempt = api_client.patch(
        path,
        headers=headers,
        json={
            "product_type_id": cpu_socket_template,
            "technical_specs": {"socket": "AM4"},
        },
    )
    assert bypass_attempt.status_code == 422
    assert "not allowed" in bypass_attempt.json()["detail"]

    switched = api_client.patch(
        path,
        headers=headers,
        json={
            "product_type_id": cpu_socket_template,
            "specifications": {"socket": "AM5"},
        },
    )
    assert switched.status_code == 200, switched.text
    body = switched.json()
    assert body["product_type"]["id"] == cpu_socket_template
    assert body["specifications"] == {"socket": "AM5"}
    # Non-template legacy keys survive a product-type change.
    assert body["technical_specs"]["chipset"] == "GeForce"
    assert body["technical_specs"]["socket"] == "AM5"


def _service_session(isolated_connection) -> Session:
    return Session(
        bind=isolated_connection,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )


def _jpeg_upload(name: str = "probe.jpg") -> UploadFile:
    return UploadFile(file=BytesIO(JPEG), filename=name)


def test_rolled_back_upload_removes_the_new_file(
    isolated_connection,
    media_root: Path,
    sample_products: dict,
    admin_user: dict,
):
    """F2: an upload that never commits leaves no orphaned managed file."""
    product_id = sample_products["gpu"].id
    with _service_session(isolated_connection) as db:
        product = product_admin_service.load_product(db, product_id)
        actor = db.get(User, admin_user["id"])
        stored = product_image_service.save_upload(db, actor, product, _jpeg_upload())
        path = media_root / "products" / stored.url.rsplit("/", 1)[-1]
        assert stored.url.startswith(MEDIA_URL_PREFIX + "/")
        assert path.is_file()
        db.rollback()
    assert not path.exists()


def test_deleted_image_file_survives_a_rolled_back_transaction(
    isolated_connection,
    media_root: Path,
    sample_products: dict,
    admin_user: dict,
):
    """F2: the file outlives a rolled back delete; the row does too."""
    product_id = sample_products["gpu"].id
    with _service_session(isolated_connection) as db:
        product = product_admin_service.load_product(db, product_id)
        actor = db.get(User, admin_user["id"])
        stored = product_image_service.save_upload(db, actor, product, _jpeg_upload())
        db.flush()
        path = media_root / "products" / stored.url.rsplit("/", 1)[-1]
        assert path.is_file()

        savepoint = db.begin_nested()
        product_image_service.delete_image(db, actor, product, stored.id)
        db.flush()
        assert path.is_file(), "the file must never be unlinked before the commit"
        savepoint.rollback()
        db.flush()
        assert db.get(ProductImage, stored.id) is not None
        assert path.is_file()
        db.rollback()
    assert not path.exists(), "the file still follows the transaction that made it"


def test_deleted_image_file_is_removed_after_commit(
    isolated_connection,
    media_root: Path,
    sample_products: dict,
    admin_user: dict,
):
    """F2: a committed delete unlinks the file, a committed upload keeps it."""
    product_id = sample_products["gpu"].id
    with _service_session(isolated_connection) as db:
        product = product_admin_service.load_product(db, product_id)
        actor = db.get(User, admin_user["id"])
        stored = product_image_service.save_upload(db, actor, product, _jpeg_upload())
        db.commit()
        path = media_root / "products" / stored.url.rsplit("/", 1)[-1]
        assert path.is_file(), "a committed upload keeps its file"

        product = product_admin_service.load_product(db, product_id)
        product_image_service.delete_image(db, actor, product, stored.id)
        db.flush()
        assert path.is_file(), "the file must survive until the commit"
        db.commit()
        assert not path.exists()


def test_nested_upload_rolled_back_leaves_no_row_and_no_file(
    isolated_connection,
    media_root: Path,
    sample_products: dict,
    admin_user: dict,
):
    """Scenario B: a SAVEPOINT rollback discards the row and its new file."""
    product_id = sample_products["gpu"].id
    with _service_session(isolated_connection) as db:
        product = product_admin_service.load_product(db, product_id)
        actor = db.get(User, admin_user["id"])
        savepoint = db.begin_nested()
        stored = product_image_service.save_upload(db, actor, product, _jpeg_upload())
        image_id = stored.id
        path = media_root / "products" / stored.url.rsplit("/", 1)[-1]
        assert path.is_file()

        savepoint.rollback()
        assert db.get(ProductImage, image_id) is None
        assert not path.exists(), "the file must follow the rolled back SAVEPOINT"
        db.commit()
    assert not path.exists()


def test_nested_committed_deletion_survives_the_outer_rollback(
    isolated_connection,
    media_root: Path,
    sample_products: dict,
    admin_user: dict,
):
    """Scenario A's counterpart: the outer rollback keeps row and file."""
    product_id = sample_products["gpu"].id
    with _service_session(isolated_connection) as db:
        product = product_admin_service.load_product(db, product_id)
        actor = db.get(User, admin_user["id"])
        stored = product_image_service.save_upload(db, actor, product, _jpeg_upload())
        image_id = stored.id
        path = media_root / "products" / stored.url.rsplit("/", 1)[-1]
        db.commit()
        assert path.is_file()

        product = product_admin_service.load_product(db, product_id)
        savepoint = db.begin_nested()
        product_image_service.delete_image(db, actor, product, image_id)
        savepoint.commit()
        assert path.is_file(), "a SAVEPOINT release must not unlink the file"

        db.rollback()
        assert db.get(ProductImage, image_id) is not None
        assert path.is_file()


def test_legacy_stored_image_urls_are_normalized_in_api_responses(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
    media_root: Path,
):
    """Stored `/media/products/...` values are exposed through `/api/v1`."""
    directory = media_root / "products"
    directory.mkdir(parents=True, exist_ok=True)
    names = [f"{uuid4().hex}.jpg", f"{uuid4().hex}.png"]
    for name in names:
        (directory / name).write_bytes(JPEG)
    external = "https://cdn.example.com/gpu.png"
    legacy_url = f"/media/products/{names[0]}"
    current_url = f"{MEDIA_URL_PREFIX}/{names[1]}"
    expected = [f"{MEDIA_URL_PREFIX}/{names[0]}", current_url, external]

    product = sample_products["gpu"]
    rows = [
        ProductImage(product_id=product.id, image_url=legacy_url, sort_order=0),
        ProductImage(product_id=product.id, image_url=current_url, sort_order=1),
        ProductImage(product_id=product.id, image_url=external, sort_order=2),
    ]
    test_db_session.add_all(rows)
    test_db_session.flush()
    headers = admin_user["headers"]

    admin_detail = api_client.get(
        f"/api/v1/admin/products/{product.id}", headers=headers
    )
    assert admin_detail.status_code == 200, admin_detail.text
    detail_body = admin_detail.json()
    assert [image["url"] for image in detail_body["images"]] == expected
    assert detail_body["cover_image_url"] == expected[0]

    admin_images = api_client.get(
        f"/api/v1/admin/products/{product.id}/images", headers=headers
    )
    assert admin_images.status_code == 200, admin_images.text
    assert [image["url"] for image in admin_images.json()] == expected

    public_detail = api_client.get(f"/api/v1/products/{product.slug}")
    assert public_detail.status_code == 200, public_detail.text
    public_body = public_detail.json()
    assert [image["url"] for image in public_body["images"]] == expected
    assert public_body["cover_image_url"] == expected[0]

    public_images = api_client.get(f"/api/v1/products/{product.id}/images")
    assert public_images.status_code == 200, public_images.text
    assert [image["url"] for image in public_images.json()["images"]] == expected
    assert public_images.json()["cover_image_url"] == expected[0]

    maker = test_db_session.get(Manufacturer, product.manufacturer_id)
    listing = api_client.get("/api/v1/products", params={"manufacturers": maker.slug})
    assert listing.status_code == 200, listing.text
    items = listing.json()["items"]
    summary = next(item for item in items if item["id"] == product.id)
    assert summary["cover_image_url"] == expected[0]
    assert [image["url"] for image in summary["images"]] == expected
    assert not any(
        image["url"].startswith("/media/products/") for image in summary["images"]
    )

    # No stored value was rewritten and the legacy endpoint still serves it.
    test_db_session.expire_all()
    query = (
        select(ProductImage.image_url)
        .where(ProductImage.product_id == product.id)
        .order_by(ProductImage.sort_order)
    )
    stored = list(test_db_session.scalars(query).all())
    assert stored == [legacy_url, current_url, external]
    assert api_client.get(legacy_url).status_code == 200
