"""API-level validation of the characteristic write contract (no database).

The defects these tests cover happened while FastAPI parsed the request body, so
they have to be reproduced through an HTTP request — calling the schema functions
directly would not prove the status code. The probe app below exposes the real
`AdminProductCreate` / `AdminProductUpdate` models through real endpoints, which
is exactly how `/api/v1/admin/products` validates them, but it needs no database:
request-body validation runs before any service or ORM code.

`raise_server_exceptions=False` matters: before the fix a `TypeError` raised inside
a Pydantic validator escaped as an unhandled exception (HTTP 500) instead of being
reported as a validation error, and a raising client would hide that difference.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from app.main import handle_request_validation_error
from app.schemas.admin_products import AdminProductCreate, AdminProductUpdate

PRODUCTS_PROBE = "/_probe/products"
PRODUCT_PROBE = "/_probe/products/1"


@pytest.fixture(scope="module")
def client() -> TestClient:
    app = FastAPI()

    @app.post(PRODUCTS_PROBE, status_code=201)
    def create_product(body: AdminProductCreate) -> dict[str, bool]:
        return {"accepted": bool(body.characteristics) or body.name != ""}

    @app.patch(PRODUCT_PROBE)
    def update_product(body: AdminProductUpdate) -> dict[str, Any]:
        return {"accepted": True, "body": body.model_dump()}

    # The real API's validation handler, so the probe really returns the status
    # codes and detail shape `/api/v1/admin/products` returns.
    app.add_exception_handler(RequestValidationError, handle_request_validation_error)

    return TestClient(app, raise_server_exceptions=False)


def _product(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": "Validation probe",
        "product_type_id": 1,
        "manufacturer_id": 1,
        "price": "199.00",
        "characteristics": [],
    }
    payload.update(overrides)
    return payload


def _error_locations(response_json: Any) -> list[list[Any]]:
    """Every `loc` of a FastAPI validation error response."""
    detail = response_json["detail"]
    assert isinstance(detail, list), detail
    return [list(error["loc"]) for error in detail]


def _error_types(response_json: Any) -> set[str]:
    return {error["type"] for error in response_json["detail"]}


# ── Dimension measurements ──────────────────────────────────────────────────


DIMENSION_PAYLOADS: list[tuple[str, Any]] = [
    ("object-instead-of-array", {"a": 307, "b": 125, "c": 46}),
    ("nested-array", [[307], 125, 46]),
    ("nested-object", [{"length": 307}, 125, 46]),
    ("boolean", [True, 125, 46]),
    ("null", [None, 125, 46]),
    ("two-measurements", [307, 125]),
    ("four-measurements", [307, 125, 46, 12]),
    ("zero", [0, 125, 46]),
    ("negative", [-307, 125, 46]),
    ("above-limit", [1001, 125, 46]),
    ("three-decimals", [307.256, 125, 46]),
    ("scalar-instead-of-array", 307),
    ("malformed-string", ["307abc", "125", "46"]),
    ("embedded-whitespace", ["307,5", "125", "46"]),
    ("invalid-separator", ["307/125/46", "125", "46"]),
    ("exponent-string", ["3e2", "125", "46"]),
    ("signed-string", ["+307", "125", "46"]),
    ("padded-string", [" 307", "125", "46"]),
    ("trailing-newline", ["307\n", "125", "46"]),
]


@pytest.mark.parametrize(
    ("dimensions",),
    [pytest.param(payload, id=name) for name, payload in DIMENSION_PAYLOADS],
)
def test_malformed_dimensions_return_422_not_500(
    client: TestClient, dimensions: Any
) -> None:
    response = client.post(
        PRODUCTS_PROBE,
        json=_product(
            characteristics=[{"code": "dimensions_mm", "dimensions": dimensions}]
        ),
    )
    assert response.status_code == 422, response.text
    body = response.json()
    assert body["detail"], body
    # The failure belongs to the dimensions payload, not to some unrelated field.
    locations = _error_locations(body)
    assert any("dimensions" in location for location in locations), locations


def test_dimension_list_without_a_code_is_rejected(client: TestClient) -> None:
    response = client.post(
        PRODUCTS_PROBE,
        json=_product(characteristics=[{"dimensions": [307, 125, 46]}]),
    )
    assert response.status_code == 422, response.text


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_measurements_return_422_not_500(
    client: TestClient, literal: str
) -> None:
    """A JSON body may carry the `NaN`/`Infinity` literals httpx refuses to encode."""
    body = (
        '{"name": "Validation probe", "product_type_id": 1, "manufacturer_id": 1,'
        ' "price": "199.00", "characteristics": [{"code": "dimensions_mm",'
        f' "dimensions": [{literal}, 125, 46]}}]}}'
    )
    response = client.post(
        PRODUCTS_PROBE, content=body, headers={"content-type": "application/json"}
    )
    assert response.status_code == 422, response.text
    locations = _error_locations(response.json())
    assert any("dimensions" in location for location in locations), locations


def test_valid_dimensions_are_accepted_with_a_canonical_ordered_triple(
    client: TestClient,
) -> None:
    response = client.post(
        PRODUCTS_PROBE,
        json=_product(
            characteristics=[{"code": "dimensions_mm", "dimensions": [307.25, 125, 46]}]
        ),
    )
    assert response.status_code == 201, response.text

    # The very same triple as plain decimal strings is accepted and normalised.
    padded = client.patch(
        PRODUCT_PROBE,
        json={
            "characteristics": [
                {"code": "dimensions_mm", "dimensions": ["307.25", "125", "46"]}
            ]
        },
    )
    assert padded.status_code == 200, padded.text
    stored = padded.json()["body"]["characteristics"]
    assert [row["code"] for row in stored] == ["dimensions_mm"]
    assert [str(measurement) for measurement in stored[0]["dimensions"]] == [
        "307.25",
        "125",
        "46",
    ]


def test_dimension_boundaries_are_inclusive(client: TestClient) -> None:
    accepted = client.post(
        PRODUCTS_PROBE,
        json=_product(
            characteristics=[{"code": "dimensions_mm", "dimensions": [1000, 1, 0.5]}]
        ),
    )
    assert accepted.status_code == 201, accepted.text


# A dimensions field never accepts a dictionary selection instead: that rule needs
# the category definition, so it lives in the database-backed API tests.


# ── Dictionary option selections ────────────────────────────────────────────


OPTION_PAYLOADS: list[tuple[str, Any]] = [
    ("boolean-true", {"option_id": True}),
    ("boolean-false", {"option_id": False}),
    ("fractional", {"option_id": 12.5}),
    ("float-integral", {"option_id": 12.0}),
    ("numeric-string", {"option_id": "12"}),
    ("zero", {"option_id": 0}),
    ("negative", {"option_id": -12}),
    ("missing", {}),
]


@pytest.mark.parametrize(
    ("selection",),
    [pytest.param(payload, id=name) for name, payload in OPTION_PAYLOADS],
)
def test_option_id_must_be_a_strict_positive_integer(
    client: TestClient, selection: dict[str, Any]
) -> None:
    response = client.post(
        PRODUCTS_PROBE,
        json=_product(characteristics=[{"code": "gpu_model", "options": [selection]}]),
    )
    assert response.status_code == 422, response.text
    locations = _error_locations(response.json())
    assert any(location[-1] == "option_id" for location in locations), locations


QUANTITY_PAYLOADS: list[tuple[str, Any]] = [
    ("boolean-true", True),
    ("boolean-false", False),
    ("fractional", 2.5),
    ("float-integral", 2.0),
    ("numeric-string", "2"),
    ("zero", 0),
    ("negative", -1),
    ("above-maximum", 33),
]


@pytest.mark.parametrize(
    ("quantity",),
    [pytest.param(payload, id=name) for name, payload in QUANTITY_PAYLOADS],
)
def test_quantity_must_be_a_strict_integer_within_the_limit(
    client: TestClient, quantity: Any
) -> None:
    response = client.post(
        PRODUCTS_PROBE,
        json=_product(
            characteristics=[
                {
                    "code": "required_power_connectors",
                    "options": [{"option_id": 7, "quantity": quantity}],
                }
            ]
        ),
    )
    assert response.status_code == 422, response.text
    locations = _error_locations(response.json())
    assert any(location[-1] == "quantity" for location in locations), locations


def test_quantity_defaults_to_one_and_the_maximum_is_accepted(
    client: TestClient,
) -> None:
    default = client.post(
        PRODUCTS_PROBE,
        json=_product(
            characteristics=[{"code": "gpu_model", "options": [{"option_id": 7}]}]
        ),
    )
    assert default.status_code == 201, default.text

    maximum = client.patch(
        PRODUCT_PROBE,
        json={
            "characteristics": [
                {
                    "code": "required_power_connectors",
                    "options": [{"option_id": 7, "quantity": 32}],
                }
            ]
        },
    )
    assert maximum.status_code == 200, maximum.text
    assert maximum.json()["body"]["characteristics"] == [
        {
            "code": "required_power_connectors",
            "options": [{"option_id": 7, "quantity": 32}],
        }
    ]


def test_an_empty_selection_is_rejected(client: TestClient) -> None:
    for payload in (
        {"code": "gpu_model", "options": []},
        {"code": "gpu_model", "options": None},
        {"options": [{"option_id": 7}]},
    ):
        response = client.post(PRODUCTS_PROBE, json=_product(characteristics=[payload]))
        assert response.status_code == 422, (payload, response.text)


def test_unknown_payload_keys_are_rejected(client: TestClient) -> None:
    """Neither a leftover free-text `value` nor an unknown key may slip through."""
    for payload in (
        {"code": "gpu_model", "value": "Radeon RX"},
        {"code": "gpu_model", "options": [{"option_id": 7, "value": "Radeon RX"}]},
        {"code": "gpu_model", "options": [{"option_id": 7}], "dimensions": [1, 2, 3]},
    ):
        response = client.post(PRODUCTS_PROBE, json=_product(characteristics=[payload]))
        assert response.status_code == 422, (payload, response.text)
        assert "extra_forbidden" in _error_types(response.json()), payload


def test_removal_and_replacement_are_both_part_of_the_update_contract(
    client: TestClient,
) -> None:
    """The conflict of the two lists is a service rule, so the shape stays valid."""
    response = client.patch(
        PRODUCT_PROBE,
        json={
            "characteristics": [{"code": "gpu_model", "options": [{"option_id": 7}]}],
            "remove_characteristics": ["gpu_model"],
        },
    )
    assert response.status_code == 200, response.text
