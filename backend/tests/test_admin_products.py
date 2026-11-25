"""Product, characteristic and image administration."""

from __future__ import annotations

import shutil
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.models import (
    Category,
    Characteristic,
    CharacteristicOption,
    Manufacturer,
    ProductCharacteristic,
    ProductImage,
    ProductType,
    User,
)
from app.schemas.admin_products import (
    AdminProductUpdate,
    CharacteristicOptionSelectionIn,
    CharacteristicOptionsIn,
)
from app.services import product_admin_service, product_image_service
from app.services.errors import InvalidInputError

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


def _option_id(db: Session, definition: Characteristic, value: str) -> int:
    """Dictionary id of one definition value, created inside the test transaction.

    Values are resolved by their canonical text from the isolated test database, so
    no identifier is hardcoded and a definition added by another test cannot leak
    into this one.
    """
    option = db.scalar(
        select(CharacteristicOption).where(
            CharacteristicOption.characteristic_name_id == definition.id,
            CharacteristicOption.value == value,
        )
    )
    if option is None:
        option = CharacteristicOption(characteristic_name_id=definition.id, value=value)
        db.add(option)
        db.flush()
    return option.id


def _absent_option_id(db: Session, definition: Characteristic) -> int:
    """An option id the definition's dictionary does not hold.

    Derived from the database instead of being hardcoded: the dictionary only grows,
    so a fixed sentinel would eventually name a real option and the negative test
    would stop proving anything.
    """
    used = set(db.scalars(select(CharacteristicOption.id)).all())
    candidate = max(used, default=0) + 1
    assert candidate not in used
    return candidate


def _wattage_associations(db: Session, product_id: int) -> set[tuple[int, int]]:
    """`(option id, quantity)` of the product's `test_probe_wattage` rows."""
    return {
        (int(option_id), int(quantity))
        for option_id, quantity in db.execute(
            select(
                ProductCharacteristic.characteristic_option_id,
                ProductCharacteristic.quantity,
            )
            .join(
                Characteristic,
                Characteristic.id == ProductCharacteristic.characteristic_id,
            )
            .where(
                ProductCharacteristic.product_id == product_id,
                Characteristic.code == "test_probe_wattage",
            )
        ).all()
    }


def _selection(code: str, *picks: int | tuple[int, int]) -> dict[str, Any]:
    """One characteristic write of the current contract.

    A bare id stores `quantity = 1`; a `(option_id, quantity)` pair stores an
    explicit repeat count, which only a connector field may use.
    """
    options = [
        {"option_id": pick, "quantity": 1}
        if isinstance(pick, int)
        else {"option_id": pick[0], "quantity": pick[1]}
        for pick in picks
    ]
    return {"code": code, "options": options}


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
def gpu_number_definition(
    test_db_session: Session, sample_products: dict
) -> Characteristic:
    """A required numeric definition scoped to the GPU category."""
    category_id = sample_products["gpu"].product_type.category_id
    definition = Characteristic(
        category_id=category_id,
        code="test_probe_wattage",
        name="Тестовая мощность",
        data_type="number",
        unit="Вт",
        sort_order=900,
        is_required=True,
    )
    test_db_session.add(definition)
    test_db_session.flush()
    return definition


@pytest.fixture()
def gpu_number_options(
    test_db_session: Session, gpu_number_definition: Characteristic
) -> dict[str, int]:
    """Dictionary of the probe wattage definition: `{"250": id, "300": id}`."""
    return {
        value: _option_id(test_db_session, gpu_number_definition, value)
        for value in ("250", "300")
    }


@pytest.fixture()
def gpu_optional_definition(
    test_db_session: Session, sample_products: dict
) -> Characteristic:
    """A non-required text definition scoped to the GPU category."""
    category_id = sample_products["gpu"].product_type.category_id
    definition = Characteristic(
        category_id=category_id,
        code="test_probe_note",
        name="Тестовая заметка",
        data_type="string",
        sort_order=901,
        is_required=False,
    )
    test_db_session.add(definition)
    test_db_session.flush()
    return definition


@pytest.fixture()
def gpu_optional_options(
    test_db_session: Session, gpu_optional_definition: Characteristic
) -> dict[str, int]:
    """Dictionary of the optional note definition."""
    return {
        value: _option_id(test_db_session, gpu_optional_definition, value)
        for value in ("Заметка",)
    }


@pytest.fixture()
def gpu_model_options(
    test_db_session: Session, sample_products: dict
) -> dict[str, int]:
    """Real dictionary ids of the seeded `gpu_model` definition."""
    definition = test_db_session.scalar(
        select(Characteristic).where(
            Characteristic.category_id
            == sample_products["gpu"].product_type.category_id,
            Characteristic.code == "gpu_model",
        )
    )
    assert definition is not None, "the seeded catalogue defines gpu_model"
    return {
        value: _option_id(test_db_session, definition, value)
        for value in ("GeForce RTX", "Radeon RX")
    }


@pytest.fixture()
def cpu_text_definition(
    test_db_session: Session, sample_products: dict
) -> Characteristic:
    """A required text definition scoped to the CPU category."""
    category_id = sample_products["cpu"].product_type.category_id
    definition = Characteristic(
        category_id=category_id,
        code="test_probe_socket",
        name="Тестовый сокет",
        data_type="string",
        sort_order=900,
        is_required=True,
    )
    test_db_session.add(definition)
    test_db_session.flush()
    return definition


@pytest.fixture()
def cpu_text_options(
    test_db_session: Session, cpu_text_definition: Characteristic
) -> dict[str, int]:
    """Dictionary of the CPU probe socket definition."""
    return {
        value: _option_id(test_db_session, cpu_text_definition, value)
        for value in ("AM5",)
    }


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
    assert created["characteristics"] == []

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


def test_characteristic_definitions_are_category_scoped(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_number_definition: Characteristic,
):
    category_id = gpu_number_definition.category_id
    response = api_client.get(
        f"/api/v1/admin/categories/{category_id}/characteristics",
        headers=admin_user["headers"],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["category_id"] == category_id
    field = next(
        item for item in body["fields"] if item["code"] == "test_probe_wattage"
    )
    assert field["name"] == "Тестовая мощность"
    assert field["data_type"] == "number"
    assert field["unit"] == "Вт"
    assert field["is_required"] is True
    # Ordered by `sort_order`.
    orders = [item["sort_order"] for item in body["fields"]]
    assert orders == sorted(orders)

    # Definitions belong to the category, so a different category never sees them.
    other = api_client.get(
        f"/api/v1/admin/categories/{sample_products['cpu'].product_type.category_id}"
        "/characteristics",
        headers=admin_user["headers"],
    )
    assert other.status_code == 200, other.text
    assert "test_probe_wattage" not in {item["code"] for item in other.json()["fields"]}


def test_create_rejects_invalid_characteristics(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_number_definition: Characteristic,
    gpu_number_options: dict[str, int],
):
    """Rejections the service owns keep a readable `detail` string.

    Every negative case fails for its own business reason — not because the
    request still uses the removed free-text contract.
    """
    wattage = gpu_number_options
    cases = [
        pytest.param({}, "Тестовая мощность", id="missing-required"),
        pytest.param(
            {"characteristics": [_selection("unknown_code", wattage["250"])]},
            "Unknown characteristic code",
            id="unknown-code",
        ),
        pytest.param(
            {
                "characteristics": [
                    _selection("test_probe_wattage", wattage["250"], wattage["300"])
                ]
            },
            "only one option may be selected",
            id="two-options-for-a-scalar",
        ),
        pytest.param(
            {
                "characteristics": [
                    _selection("test_probe_wattage", wattage["250"], wattage["250"])
                ]
            },
            "must not be selected twice",
            id="duplicate-option",
        ),
        pytest.param(
            {
                "characteristics": [
                    _selection("test_probe_wattage", wattage["250"]),
                    _selection("test_probe_wattage", wattage["300"]),
                ]
            },
            "Duplicate characteristic code",
            id="duplicate-code",
        ),
        pytest.param(
            {"characteristics": [_selection("test_probe_wattage", 999_999)]},
            "unknown option id",
            id="unknown-option-id",
        ),
        pytest.param(
            {"characteristics": [_selection("dimensions_mm", wattage["250"])]},
            "exactly three measurements are required",
            id="dictionary-pick-for-dimensions",
        ),
    ]
    for payload, expected in cases:
        response = _create(api_client, admin_user, sample_products, **payload)
        assert response.status_code == 422, response.text
        assert expected in response.json()["detail"], response.text


def test_create_rejects_malformed_characteristic_shapes(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_number_definition: Characteristic,
    gpu_number_options: dict[str, int],
):
    """A malformed body fails while the request is parsed, before any service call."""
    option_id = gpu_number_options["250"]

    def rejected(payload: list[dict[str, Any]], field: str) -> None:
        response = _create(
            api_client, admin_user, sample_products, characteristics=payload
        )
        assert response.status_code == 422, response.text
        detail = response.json()["detail"]
        assert isinstance(detail, list), detail
        assert any(field in error["loc"] for error in detail), detail

    # Strict integers: no booleans, fractions or numeric strings.
    rejected(
        [{"code": "test_probe_wattage", "options": [{"option_id": True}]}],
        "option_id",
    )
    rejected(
        [{"code": "test_probe_wattage", "options": [{"option_id": str(option_id)}]}],
        "option_id",
    )
    rejected(
        [
            {
                "code": "test_probe_wattage",
                "options": [{"option_id": option_id, "quantity": 1.5}],
            }
        ],
        "quantity",
    )
    rejected(
        [
            {
                "code": "test_probe_wattage",
                "options": [{"option_id": option_id, "quantity": 0}],
            }
        ],
        "quantity",
    )
    rejected(
        [
            {
                "code": "test_probe_wattage",
                "options": [{"option_id": option_id, "quantity": 33}],
            }
        ],
        "quantity",
    )
    # The removed contract and an empty selection are not accepted either.
    rejected([{"code": "test_probe_wattage", "value": 250}], "characteristics")
    rejected([{"code": "test_probe_wattage"}], "characteristics")
    rejected([{"code": "test_probe_wattage", "options": []}], "characteristics")


def test_create_and_update_store_typed_values(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_number_definition: Characteristic,
    gpu_number_options: dict[str, int],
    gpu_optional_definition: Characteristic,
    gpu_optional_options: dict[str, int],
    gpu_model_options: dict[str, int],
):
    created = _create(
        api_client,
        admin_user,
        sample_products,
        characteristics=[
            _selection("test_probe_wattage", gpu_number_options["250"]),
            _selection("test_probe_note", gpu_optional_options["Заметка"]),
            _selection("gpu_model", gpu_model_options["GeForce RTX"]),
        ],
    )
    assert created.status_code == 201, created.text
    body = created.json()
    rows = {row["code"]: row for row in body["characteristics"]}
    assert rows["test_probe_wattage"]["value"] == 250
    assert rows["test_probe_wattage"]["display_value"] == "250 Вт"
    # The stored option ids are the ones the dictionary offered.
    assert rows["test_probe_wattage"]["options"] == [
        {
            "option_id": gpu_number_options["250"],
            "value": "250",
            "quantity": 1,
        }
    ]
    assert rows["test_probe_note"]["value"] == "Заметка"
    assert rows["gpu_model"]["value"] == "GeForce RTX"
    assert rows["test_probe_wattage"]["is_required"] is True

    path = f"/api/v1/admin/products/{body['id']}"
    headers = admin_user["headers"]

    # An omitted code keeps its stored value; only the submitted one changes.
    updated = api_client.patch(
        path,
        headers=headers,
        json={
            "characteristics": [_selection("gpu_model", gpu_model_options["Radeon RX"])]
        },
    )
    assert updated.status_code == 200, updated.text
    after = {row["code"]: row for row in updated.json()["characteristics"]}
    assert after["gpu_model"]["value"] == "Radeon RX"
    assert (
        after["gpu_model"]["options"][0]["option_id"] == gpu_model_options["Radeon RX"]
    )
    assert after["test_probe_wattage"]["value"] == 250

    # An explicit removal is honoured for a non-required definition.
    removed = api_client.patch(
        path, headers=headers, json={"remove_characteristics": ["test_probe_note"]}
    )
    assert removed.status_code == 200, removed.text
    assert "test_probe_note" not in {
        row["code"] for row in removed.json()["characteristics"]
    }

    # A required definition can never be removed.
    forced = api_client.patch(
        path,
        headers=headers,
        json={"remove_characteristics": ["test_probe_wattage"]},
    )
    assert forced.status_code == 422
    assert "Тестовая мощность" in forced.json()["detail"]


def test_rolled_back_characteristic_write_leaves_no_rows(
    isolated_connection,
    sample_products: dict,
    admin_user: dict,
    gpu_number_definition: Characteristic,
    gpu_number_options: dict[str, int],
):
    """A failed transaction must not leave partial characteristic rows."""
    product = sample_products["gpu"]
    option_id = gpu_number_options["250"]

    def _wattage(selected_id: int) -> AdminProductUpdate:
        # `CharacteristicValueIn` is an annotated union, so the concrete member is
        # instantiated here; the union itself is not a model and cannot be called.
        return AdminProductUpdate(
            characteristics=[
                CharacteristicOptionsIn(
                    code="test_probe_wattage",
                    options=[
                        CharacteristicOptionSelectionIn(
                            option_id=selected_id, quantity=1
                        )
                    ],
                )
            ]
        )

    with _service_session(isolated_connection) as db:
        actor = db.get(User, admin_user["id"])
        dictionary_ids = set(
            db.scalars(
                select(CharacteristicOption.id).where(
                    CharacteristicOption.characteristic_name_id
                    == gpu_number_definition.id
                )
            ).all()
        )
        unknown_id = _absent_option_id(db, gpu_number_definition)
        assert unknown_id not in dictionary_ids

        product_admin_service.update_product(db, actor, product.id, _wattage(option_id))
        # The accepted write really is in the current transaction, not only in the
        # service's return value.
        assert _wattage_associations(db, product.id) == {(option_id, 1)}

        with pytest.raises(InvalidInputError, match=f"unknown option id {unknown_id}"):
            product_admin_service.update_product(
                db, actor, product.id, _wattage(unknown_id)
            )
        db.rollback()

    with _service_session(isolated_connection) as db:
        codes = set(
            db.scalars(
                select(Characteristic.code)
                .join(
                    ProductCharacteristic,
                    ProductCharacteristic.characteristic_id == Characteristic.id,
                )
                .where(ProductCharacteristic.product_id == product.id)
            ).all()
        )
        assert "test_probe_wattage" not in codes
        # The rolled-back write left no association behind.
        assert _wattage_associations(db, product.id) == set()


def test_category_transition_never_drops_values_silently(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_number_definition: Characteristic,
    gpu_number_options: dict[str, int],
    cpu_text_definition: Characteristic,
    cpu_text_options: dict[str, int],
):
    created = _create(
        api_client,
        admin_user,
        sample_products,
        characteristics=[_selection("test_probe_wattage", gpu_number_options["250"])],
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    path = f"/api/v1/admin/products/{product_id}"
    headers = admin_user["headers"]
    cpu_type_id = sample_products["cpu"].product_type_id

    blocked = api_client.patch(
        path, headers=headers, json={"product_type_id": cpu_type_id}
    )
    assert blocked.status_code == 422, blocked.text
    detail = blocked.json()["detail"]
    assert "test_probe_wattage" in detail
    # The rejected transition did not change the product.
    unchanged = api_client.get(path, headers=headers).json()
    assert unchanged["product_type"]["id"] != cpu_type_id
    assert {row["code"]: row["value"] for row in unchanged["characteristics"]} == {
        "test_probe_wattage": 250
    }

    # An explicit removal plus the target-category requirements is accepted.
    switched = api_client.patch(
        path,
        headers=headers,
        json={
            "product_type_id": cpu_type_id,
            "remove_characteristics": ["test_probe_wattage"],
            "characteristics": [
                _selection("test_probe_socket", cpu_text_options["AM5"])
            ],
        },
    )
    assert switched.status_code == 200, switched.text
    body = switched.json()
    assert body["product_type"]["id"] == cpu_type_id
    assert {row["code"]: row["value"] for row in body["characteristics"]} == {
        "test_probe_socket": "AM5"
    }


# ── Connector quantities ──────────────────────────────────────────────────────


def test_connector_quantities_round_trip_through_the_dictionary(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """A repeated connector is one option with a quantity, not repeated rows."""
    definition = test_db_session.scalar(
        select(Characteristic).where(
            Characteristic.category_id
            == sample_products["gpu"].product_type.category_id,
            Characteristic.code == "required_power_connectors",
        )
    )
    assert definition is not None, "the seeded catalogue defines the connector field"
    eight_pin = _option_id(test_db_session, definition, "PCIe 8-pin")
    sixteen_pin = _option_id(test_db_session, definition, "PCIe 16-pin")

    created = _create(
        api_client,
        admin_user,
        sample_products,
        characteristics=[
            _selection("required_power_connectors", (eight_pin, 3), (sixteen_pin, 1))
        ],
    )
    assert created.status_code == 201, created.text
    rows = {item["code"]: item for item in created.json()["characteristics"]}
    connectors = rows["required_power_connectors"]
    stored = {option["option_id"]: option for option in connectors["options"]}
    assert stored[eight_pin] == {
        "option_id": eight_pin,
        "value": "PCIe 8-pin",
        "quantity": 3,
    }
    assert stored[sixteen_pin]["quantity"] == 1
    # The structured value repeats the option by its quantity.
    assert connectors["value"].count("PCIe 8-pin") == 3
    assert "PCIe 8-pin × 3" in connectors["display_value"]

    # The quantity is bounded by the schema and by the service.
    for quantity in (0, 33):
        rejected = _create(
            api_client,
            admin_user,
            sample_products,
            name=f"Connector probe {quantity}",
            characteristics=[
                _selection("required_power_connectors", (eight_pin, quantity))
            ],
        )
        assert rejected.status_code == 422, rejected.text


def test_an_explicit_negative_boolean_is_a_stored_value(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """`Нет` is a real dictionary option, never an absent value."""
    cpu = sample_products["cpu"]
    definition = test_db_session.scalar(
        select(Characteristic).where(
            Characteristic.category_id == cpu.product_type.category_id,
            Characteristic.code == "has_3d_vcache",
        )
    )
    assert definition is not None, "the seeded CPU category defines has_3d_vcache"
    no_id = _option_id(test_db_session, definition, "Нет")
    yes_id = _option_id(test_db_session, definition, "Да")

    created = api_client.post(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        json={
            "name": "Boolean probe CPU",
            "product_type_id": cpu.product_type_id,
            "manufacturer_id": cpu.manufacturer_id,
            "price": "249.00",
            "stock_quantity": 2,
            "description": "Отрицательное логическое значение",
            "characteristics": [_selection("has_3d_vcache", no_id)],
        },
    )
    assert created.status_code == 201, created.text
    rows = {row["code"]: row for row in created.json()["characteristics"]}
    # A stored `Нет` is present in the payload, unlike a missing value.
    assert rows["has_3d_vcache"]["value"] is False
    assert rows["has_3d_vcache"]["display_value"] == "Нет"
    assert rows["has_3d_vcache"]["options"] == [
        {"option_id": no_id, "value": "Нет", "quantity": 1}
    ]

    # Switching to the positive option replaces the stored one.
    switched = api_client.patch(
        f"/api/v1/admin/products/{created.json()['id']}",
        headers=admin_user["headers"],
        json={"characteristics": [_selection("has_3d_vcache", yes_id)]},
    )
    assert switched.status_code == 200, switched.text
    after = {row["code"]: row for row in switched.json()["characteristics"]}
    assert after["has_3d_vcache"]["value"] is True
    assert after["has_3d_vcache"]["display_value"] == "Да"


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


# ── Required list characteristics ────────────────────────────────────────────


@pytest.fixture()
def gpu_required_list_definitions(
    test_db_session: Session, sample_products: dict
) -> tuple[Characteristic, Characteristic]:
    """Required string-list and number-list definitions of the GPU category."""
    category_id = sample_products["gpu"].product_type.category_id
    strings = Characteristic(
        category_id=category_id,
        code="test_probe_connectors",
        name="Тестовые разъёмы",
        data_type="string_list",
        sort_order=910,
        is_required=True,
    )
    numbers = Characteristic(
        category_id=category_id,
        code="test_probe_lengths",
        name="Тестовые длины",
        data_type="number_list",
        unit="мм",
        sort_order=911,
        is_required=True,
    )
    test_db_session.add_all([strings, numbers])
    test_db_session.flush()
    return strings, numbers


def _list_payload(connectors: list[int], lengths: list[int]) -> list[dict[str, Any]]:
    """Both required list definitions as explicit dictionary selections."""
    return [
        _selection("test_probe_connectors", *connectors),
        _selection("test_probe_lengths", *lengths),
    ]


@pytest.fixture()
def gpu_required_list_options(
    test_db_session: Session,
    gpu_required_list_definitions: tuple[Characteristic, Characteristic],
) -> dict[str, dict[str, int]]:
    """Dictionaries of the two required list definitions, resolved by value."""
    strings, numbers = gpu_required_list_definitions
    return {
        "connectors": {
            value: _option_id(test_db_session, strings, value)
            for value in ("pcie-8pin", "pcie-16pin")
        },
        "lengths": {
            value: _option_id(test_db_session, numbers, value) for value in ("80", "60")
        },
    }


def test_create_rejects_empty_required_lists(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_required_list_definitions: tuple[Characteristic, Characteristic],
    gpu_required_list_options: dict[str, dict[str, int]],
):
    """An empty selection is refused while the body is parsed.

    The definition-name wording of the service ("at least one option is required")
    is unreachable through the API because the request contract itself asks for at
    least one option; the service rule is unit-tested separately.
    """
    dictionaries = gpu_required_list_options

    def rejected(payload: list[dict[str, Any]], index: int, name: str) -> None:
        response = _create(
            api_client,
            admin_user,
            sample_products,
            name=name,
            characteristics=payload,
        )
        assert response.status_code == 422, response.text
        detail = response.json()["detail"]
        assert isinstance(detail, list), detail
        assert any(
            error["loc"][:5] == ["body", "characteristics", index, "options"]
            or error["loc"][:4] == ["body", "characteristics", index]
            for error in detail
        ), detail

    rejected(
        _list_payload([], [dictionaries["lengths"]["80"]]),
        0,
        "Empty connectors",
    )
    rejected(
        _list_payload([dictionaries["connectors"]["pcie-8pin"]], []),
        1,
        "Empty lengths",
    )

    # Rejected requests persist nothing at all.
    listing = api_client.get("/api/v1/products", params={"q": "Empty connectors"})
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 0


def test_create_accepts_required_lists_with_real_values(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_required_list_definitions: tuple[Characteristic, Characteristic],
    gpu_required_list_options: dict[str, dict[str, int]],
):
    dictionaries = gpu_required_list_options
    eight, sixteen = (
        dictionaries["connectors"]["pcie-8pin"],
        dictionaries["connectors"]["pcie-16pin"],
    )
    lengths = dictionaries["lengths"]

    created = _create(
        api_client,
        admin_user,
        sample_products,
        characteristics=_list_payload([eight, sixteen], [lengths["80"], lengths["60"]]),
    )
    assert created.status_code == 201, created.text
    rows = {row["code"]: row for row in created.json()["characteristics"]}

    connectors = rows["test_probe_connectors"]
    assert {option["value"] for option in connectors["options"]} == {
        "pcie-8pin",
        "pcie-16pin",
    }
    assert {option["quantity"] for option in connectors["options"]} == {1}
    assert sorted(connectors["value"]) == ["pcie-16pin", "pcie-8pin"]

    stored_lengths = rows["test_probe_lengths"]
    assert set(stored_lengths["value"]) == {60, 80}
    assert stored_lengths["display_value"].endswith(" мм")

    # An ordinary multiselect stores one row per option: no repeats, no quantity.
    duplicated = _create(
        api_client,
        admin_user,
        sample_products,
        name="Repeated connector",
        characteristics=_list_payload([eight, eight], [lengths["80"]]),
    )
    assert duplicated.status_code == 422, duplicated.text
    assert "must not be selected twice" in duplicated.json()["detail"]

    quantified = _create(
        api_client,
        admin_user,
        sample_products,
        name="Quantified length",
        characteristics=[
            _selection("test_probe_connectors", eight),
            _selection("test_probe_lengths", (lengths["80"], 2)),
        ],
    )
    assert quantified.status_code == 422, quantified.text
    assert "does not accept a quantity" in quantified.json()["detail"]


def test_update_cannot_empty_a_required_list_and_rolls_back(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    gpu_required_list_definitions: tuple[Characteristic, Characteristic],
    gpu_required_list_options: dict[str, dict[str, int]],
):
    dictionaries = gpu_required_list_options
    eight = dictionaries["connectors"]["pcie-8pin"]
    eighty = dictionaries["lengths"]["80"]

    created = _create(
        api_client,
        admin_user,
        sample_products,
        characteristics=_list_payload([eight], [eighty]),
    )
    assert created.status_code == 201, created.text
    product_id = created.json()["id"]
    path = f"/api/v1/admin/products/{product_id}"
    headers = admin_user["headers"]

    rejected = api_client.patch(
        path,
        headers=headers,
        json={
            "name": "Renamed while invalid",
            "characteristics": _list_payload([], [eighty]),
        },
    )
    assert rejected.status_code == 422, rejected.text

    # The unrelated field of the rejected request was never committed either.
    after = api_client.get(path, headers=headers)
    assert after.status_code == 200, after.text
    body = after.json()
    assert body["name"] == created.json()["name"]
    rows = {row["code"]: row for row in body["characteristics"]}
    assert [
        option["option_id"] for option in rows["test_probe_connectors"]["options"]
    ] == [eight]

    # Removing a required list is rejected the same way.
    removal = api_client.patch(
        path,
        headers=headers,
        json={"remove_characteristics": ["test_probe_lengths"]},
    )
    assert removal.status_code == 422, removal.text
    assert "Тестовые длины" in removal.json()["detail"]
    unchanged = api_client.get(path, headers=headers)
    assert unchanged.json()["characteristics"] != []


# ── Category transitions with explicitly replaced values ─────────────────────


@pytest.fixture()
def transition_spec(test_db_session: Session) -> dict:
    """Two throwaway categories that share one code with a different data type.

    `test_probe_memory_type` is a ``string_list`` in the source category and a
    plain ``string`` in the target one, exactly like the real `memory_type` of a
    CPU (`string_list`) and of a motherboard (`string`). The categories are
    created by this test, so the seeded definitions of the real categories cannot
    influence the required-field checks.
    """
    suffix = uuid4().hex[:8]
    source_category = Category(
        slug=f"test-transition-source-{suffix}", name=f"Test source {suffix}"
    )
    target_category = Category(
        slug=f"test-transition-target-{suffix}", name=f"Test target {suffix}"
    )
    test_db_session.add_all([source_category, target_category])
    test_db_session.flush()
    source_type = ProductType(
        category_id=source_category.id,
        slug=f"test-transition-source-type-{suffix}",
        name=f"Test source type {suffix}",
    )
    target_type = ProductType(
        category_id=target_category.id,
        slug=f"test-transition-target-type-{suffix}",
        name=f"Test target type {suffix}",
    )
    test_db_session.add_all([source_type, target_type])
    test_db_session.flush()
    source_memory = Characteristic(
        category_id=source_category.id,
        code="test_probe_memory_type",
        name="Тестовый тип памяти",
        data_type="string_list",
        sort_order=0,
    )
    source_wattage = Characteristic(
        category_id=source_category.id,
        code="test_probe_source_wattage",
        name="Мощность источника",
        data_type="number",
        sort_order=1,
        is_required=True,
    )
    target_memory = Characteristic(
        category_id=target_category.id,
        code="test_probe_memory_type",
        name="Тестовый тип памяти",
        data_type="string",
        sort_order=0,
    )
    target_socket = Characteristic(
        category_id=target_category.id,
        code="test_probe_target_socket",
        name="Сокет цели",
        data_type="string",
        sort_order=1,
        is_required=True,
    )
    test_db_session.add_all(
        [source_memory, source_wattage, target_memory, target_socket]
    )
    test_db_session.flush()
    return {
        "suffix": suffix,
        "source_type": source_type,
        "target_type": target_type,
        "source_memory": source_memory,
        "source_wattage": source_wattage,
        "target_memory": target_memory,
        "target_socket": target_socket,
        # Both categories define the same code with their own dictionary, so the
        # option ids are different and an option of the previous category can
        # never be reused after the transition.
        "options": {
            "source_memory": _option_id(test_db_session, source_memory, "ddr5"),
            "source_wattage": _option_id(test_db_session, source_wattage, "250"),
            "target_memory": _option_id(test_db_session, target_memory, "ddr5"),
            "target_socket": _option_id(test_db_session, target_socket, "AM5"),
        },
    }


def _transition_product(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    transition_spec: dict,
) -> dict:
    """Product of the source category storing a list value in the shared code."""
    options = transition_spec["options"]
    created = api_client.post(
        "/api/v1/admin/products",
        headers=admin_user["headers"],
        json={
            "name": f"Transition probe {transition_spec['suffix']}",
            "product_type_id": transition_spec["source_type"].id,
            "manufacturer_id": sample_products["gpu"].manufacturer_id,
            "price": "199.99",
            "stock_quantity": 3,
            "description": "Переход категории",
            "characteristics": [
                _selection("test_probe_source_wattage", options["source_wattage"]),
                _selection("test_probe_memory_type", options["source_memory"]),
            ],
        },
    )
    assert created.status_code == 201, created.text
    return created.json()


def _stored_rows(
    isolated_connection, product_id: int
) -> dict[int, list[tuple[str, int]]]:
    """Stored associations as `{definition id: [(dictionary value, quantity)]}`."""
    with _service_session(isolated_connection) as db:
        rows = db.execute(
            select(
                ProductCharacteristic.characteristic_id,
                CharacteristicOption.value,
                ProductCharacteristic.quantity,
            )
            .join(
                CharacteristicOption,
                CharacteristicOption.id
                == ProductCharacteristic.characteristic_option_id,
            )
            .where(ProductCharacteristic.product_id == product_id)
        ).all()
    collected: dict[int, list[tuple[str, int]]] = {}
    for characteristic_id, value, quantity in rows:
        collected.setdefault(characteristic_id, []).append((value, quantity))
    return {key: sorted(items) for key, items in collected.items()}


def _patch_product(
    api_client: TestClient, admin_user: dict, product_id: int, payload: dict
):
    return api_client.patch(
        f"/api/v1/admin/products/{product_id}",
        headers=admin_user["headers"],
        json=payload,
    )


def _assert_transition_rejected(
    api_client: TestClient,
    admin_user: dict,
    product_id: int,
    payload: dict,
    source_type_id: int,
    expected: str,
    stored: dict[str, Any],
) -> None:
    """Rejected transition: clear error, untouched category and untouched values."""
    response = _patch_product(api_client, admin_user, product_id, payload)
    assert response.status_code == 422, response.text
    assert expected in response.json()["detail"]
    current = api_client.get(
        f"/api/v1/admin/products/{product_id}", headers=admin_user["headers"]
    ).json()
    assert current["product_type"]["id"] == source_type_id
    assert {row["code"]: row["value"] for row in current["characteristics"]} == stored


def test_category_transition_replaces_a_value_of_another_data_type(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    isolated_connection,
    transition_spec: dict,
):
    """A stored list is replaced by the valid string of the target category."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    product_id = product["id"]
    options = transition_spec["options"]

    response = _patch_product(
        api_client,
        admin_user,
        product_id,
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection("test_probe_memory_type", options["target_memory"]),
                _selection("test_probe_target_socket", options["target_socket"]),
            ],
            "remove_characteristics": ["test_probe_source_wattage"],
        },
    )
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated["product_type"]["id"] == transition_spec["target_type"].id
    assert {row["code"]: row["value"] for row in updated["characteristics"]} == {
        "test_probe_memory_type": "ddr5",
        "test_probe_target_socket": "AM5",
    }

    # The previous category's row is gone: the replacement belongs to the target
    # category's definition of the same code.
    assert _stored_rows(isolated_connection, product_id) == {
        transition_spec["target_memory"].id: [("ddr5", 1)],
        transition_spec["target_socket"].id: [("AM5", 1)],
    }


def test_category_transition_allows_an_explicit_removal(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    isolated_connection,
    transition_spec: dict,
):
    """Explicit removal keeps working when the code changed its data type."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    product_id = product["id"]
    options = transition_spec["options"]

    response = _patch_product(
        api_client,
        admin_user,
        product_id,
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection("test_probe_target_socket", options["target_socket"]),
            ],
            "remove_characteristics": [
                "test_probe_source_wattage",
                "test_probe_memory_type",
            ],
        },
    )
    assert response.status_code == 200, response.text
    assert _stored_rows(isolated_connection, product_id) == {
        transition_spec["target_socket"].id: [("AM5", 1)]
    }


def test_category_transition_rejects_an_incompatible_value_without_replacement(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    transition_spec: dict,
):
    """The stored value is never silently carried into the target category."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    _assert_transition_rejected(
        api_client,
        admin_user,
        product["id"],
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection(
                    "test_probe_target_socket",
                    transition_spec["options"]["target_socket"],
                ),
            ],
            "remove_characteristics": ["test_probe_source_wattage"],
        },
        transition_spec["source_type"].id,
        "test_probe_memory_type",
        {"test_probe_source_wattage": 250, "test_probe_memory_type": ["ddr5"]},
    )


def test_category_transition_rejects_an_option_of_the_previous_category(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    transition_spec: dict,
):
    """A replacement has to be an option of the *target* category's definition."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    options = transition_spec["options"]
    assert options["source_memory"] != options["target_memory"]
    _assert_transition_rejected(
        api_client,
        admin_user,
        product["id"],
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection("test_probe_memory_type", options["source_memory"]),
                _selection("test_probe_target_socket", options["target_socket"]),
            ],
            "remove_characteristics": ["test_probe_source_wattage"],
        },
        transition_spec["source_type"].id,
        "unknown option id",
        {"test_probe_source_wattage": 250, "test_probe_memory_type": ["ddr5"]},
    )


def test_category_transition_requires_the_target_characteristics(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    transition_spec: dict,
):
    """A valid replacement does not excuse a missing required target value."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    _assert_transition_rejected(
        api_client,
        admin_user,
        product["id"],
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection(
                    "test_probe_memory_type",
                    transition_spec["options"]["target_memory"],
                ),
            ],
            "remove_characteristics": ["test_probe_source_wattage"],
        },
        transition_spec["source_type"].id,
        "Сокет цели",
        {"test_probe_source_wattage": 250, "test_probe_memory_type": ["ddr5"]},
    )


def test_category_transition_rejects_a_replace_and_remove_conflict(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    isolated_connection,
    transition_spec: dict,
):
    """The same code may not be replaced and removed by one request."""
    product = _transition_product(
        api_client, admin_user, sample_products, transition_spec
    )
    product_id = product["id"]
    options = transition_spec["options"]
    before = _stored_rows(isolated_connection, product_id)

    response = _patch_product(
        api_client,
        admin_user,
        product_id,
        {
            "product_type_id": transition_spec["target_type"].id,
            "characteristics": [
                _selection("test_probe_memory_type", options["target_memory"]),
                _selection("test_probe_target_socket", options["target_socket"]),
            ],
            # The very code that is being replaced is also being removed.
            "remove_characteristics": [
                "test_probe_source_wattage",
                "test_probe_memory_type",
            ],
        },
    )
    assert response.status_code == 422, response.text
    assert "test_probe_memory_type" in response.json()["detail"]
    assert "replaced and removed" in response.json()["detail"]

    # Nothing was written: neither the category nor the associations changed.
    current = api_client.get(
        f"/api/v1/admin/products/{product_id}", headers=admin_user["headers"]
    ).json()
    assert current["product_type"]["id"] == transition_spec["source_type"].id
    assert _stored_rows(isolated_connection, product_id) == before
