"""A saved build keeps its own name through cart, quantity changes and orders.

The rule tests need no database: they pin the request contract and the cart-line
identity that decide whether a name can be lost. The API tests exercise the real
endpoints and therefore require the isolated PostgreSQL test database, exactly
like the other integration tests in this project.
"""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import CartItem, Manufacturer, Product, SavedBuild
from app.schemas.cart import CartAddBuildRequest
from app.services.cart_service import _same_saved_line, selections_from_items
from tests.conftest import COMPATIBLE_SPECS, apply_characteristics, create_account
from tests.conftest import apply_compatible_build as conftest_apply_compatible_build

# ── Request contract (no database) ──────────────────────────────────────────


def test_expected_items_requires_a_saved_build_id() -> None:
    items = [{"slot": "cpu", "product_id": 1}]
    with pytest.raises(ValidationError, match="expected_items requires saved_build_id"):
        CartAddBuildRequest(items=items, expected_items=items)


def test_expected_items_cannot_be_combined_with_direct_items() -> None:
    items = [{"slot": "cpu", "product_id": 1}]
    with pytest.raises(ValidationError):
        CartAddBuildRequest(saved_build_id=3, items=items, expected_items=items)


def test_saved_build_requests_without_expected_items_stay_valid() -> None:
    request = CartAddBuildRequest(saved_build_id=3)
    assert request.expected_items is None
    assert request.saved_build_id == 3
    assert CartAddBuildRequest(saved_build_id=3, expected_items=[]).expected_items == []


def test_expected_items_are_validated_like_any_configuration() -> None:
    cpu = {"slot": "cpu", "product_id": 1}
    with pytest.raises(ValueError, match="Duplicate slot"):
        selections_from_items([cpu, cpu])
    with pytest.raises(ValueError, match="Incomplete configuration"):
        selections_from_items([cpu])


def test_saved_line_identity_requires_components_and_captured_name() -> None:
    snapshot = {
        "components": [{"slot": "cpu", "product_id": 1}],
        "total_price": "10.00",
        "name": "Gaming PC 2026",
    }
    selections = {"cpu": 1}
    assert _same_saved_line(snapshot, selections, "Gaming PC 2026") is True
    # A renamed build must not overwrite the name this line captured.
    assert _same_saved_line(snapshot, selections, "Workstation") is False
    # Different components are a different purchase.
    assert _same_saved_line(snapshot, {"cpu": 2}, "Gaming PC 2026") is False
    # A legacy line without a name has nothing to preserve.
    legacy = {key: value for key, value in snapshot.items() if key != "name"}
    assert _same_saved_line(legacy, selections, "Workstation") is True
    assert _same_saved_line({"components": "broken"}, selections, "Any") is False


# ── API behaviour (isolated PostgreSQL test database) ───────────────────────

NAME = "Gaming PC 2026"


def _items(products: dict) -> list[dict]:
    return [
        {"slot": slot, "product_id": product.id} for slot, product in products.items()
    ]


def _compatible(db: Session, products: dict) -> None:
    conftest_apply_compatible_build(db, products)
    db.flush()


def _clone_product(db: Session, source: Product, slot: str, suffix: str) -> Product:
    """A second compatible product of the same type, for another configuration."""
    maker = db.query(Manufacturer).filter_by(id=source.manufacturer_id).one()
    clone = Product(
        product_type_id=source.product_type_id,
        manufacturer_id=source.manufacturer_id,
        slug=f"{source.slug}-{suffix}-{maker.id}",
        sku=f"{source.sku}-{suffix}",
        name=f"{source.name} {suffix}",
        description=source.description,
        price=source.price,
        stock_quantity=source.stock_quantity,
        on_sale=False,
        is_active=True,
    )
    db.add(clone)
    db.flush()
    apply_characteristics(db, clone, dict(COMPATIBLE_SPECS[slot]))
    db.flush()
    return clone


def _saved_build(
    api_client: TestClient, headers: dict, products: dict, name: str = NAME
) -> int:
    created = api_client.post(
        "/api/v1/builds",
        headers=headers,
        json={"name": name, "items": _items(products)},
    )
    assert created.status_code == 201, created.text
    assert created.json()["name"] == name
    return int(created.json()["id"])


def _add_saved(api_client: TestClient, headers: dict, build_id: int, **extra):
    return api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"saved_build_id": build_id, **extra},
    )


def test_saved_build_keeps_its_name_in_the_cart(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)

    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    line = added.json()["items"][0]
    assert line["kind"] == "custom_build"
    assert line["saved_build_id"] == build_id
    assert line["build_snapshot"]["name"] == NAME
    assert len(line["build_snapshot"]["components"]) == 8

    # The captured name survives a separate retrieval (page reload, new request).
    reread = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    assert [item["build_snapshot"]["name"] for item in reread] == [NAME]

    # ... and a quantity change, including the price recalculation it performs.
    changed = api_client.patch(
        f"/api/v1/cart/{line['id']}", headers=headers, json={"quantity": 3}
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["items"][0]["quantity"] == 3
    assert changed.json()["items"][0]["build_snapshot"]["name"] == NAME
    assert (
        api_client.get("/api/v1/cart", headers=headers).json()["items"][0][
            "build_snapshot"
        ]["name"]
        == NAME
    )


def test_saved_build_expected_items_are_accepted_for_the_same_configuration(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)
    items = _items(sample_products)

    added = _add_saved(api_client, headers, build_id, expected_items=items)
    assert added.status_code == 200, added.text
    line = added.json()["items"][0]
    assert line["saved_build_id"] == build_id
    assert line["build_snapshot"]["name"] == NAME
    snapshot = {
        row["slot"]: row["product_id"] for row in line["build_snapshot"]["components"]
    }
    assert snapshot == {item["slot"]: item["product_id"] for item in items}

    # Repeating the unchanged addition raises the quantity of the same line.
    again = _add_saved(api_client, headers, build_id, expected_items=items)
    assert again.status_code == 200, again.text
    lines = again.json()["items"]
    assert len(lines) == 1
    assert lines[0]["quantity"] == 2
    assert lines[0]["build_snapshot"]["name"] == NAME


def test_stale_expected_items_are_rejected_without_touching_the_cart(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)
    assert _add_saved(api_client, headers, build_id).status_code == 200
    before = api_client.get("/api/v1/cart", headers=headers).json()

    # A configuration that is not the one stored for this saved build.
    mixed = [item for item in _items(sample_products) if item["slot"] != "storage"] + [
        {"slot": "storage", "product_id": sample_products["cpu"].id}
    ]
    stale = _add_saved(api_client, headers, build_id, expected_items=mixed)
    assert stale.status_code == 422, stale.text

    # Missing and duplicated slots are refused the same way.
    for broken in (_items(sample_products)[:7], [_items(sample_products)[0]] * 8):
        refused = _add_saved(api_client, headers, build_id, expected_items=broken)
        assert refused.status_code == 422, refused.text

    # An empty expectation is not a verified configuration either.
    assert (
        _add_saved(api_client, headers, build_id, expected_items=[]).status_code == 422
    )
    assert api_client.get("/api/v1/cart", headers=headers).json() == before


def test_same_component_configurations_keep_their_own_names(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    first = _saved_build(api_client, headers, sample_products, "Gaming PC 2026")
    second = _saved_build(api_client, headers, sample_products, "Сборка для монтажа")

    for build_id in (first, first, second):
        added = _add_saved(api_client, headers, build_id)
        assert added.status_code == 200, added.text

    lines = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    assert len(lines) == 2
    by_build = {line["saved_build_id"]: line for line in lines}
    assert by_build[first]["build_snapshot"]["name"] == "Gaming PC 2026"
    assert by_build[first]["quantity"] == 2
    assert by_build[second]["build_snapshot"]["name"] == "Сборка для монтажа"
    assert by_build[second]["quantity"] == 1


def test_named_and_unnamed_configurations_do_not_merge(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)

    assert _add_saved(api_client, headers, build_id).status_code == 200
    direct = api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"items": _items(sample_products)}
    )
    assert direct.status_code == 200, direct.text

    lines = direct.json()["items"]
    assert len(lines) == 2
    named = next(line for line in lines if line["saved_build_id"] == build_id)
    unnamed = next(line for line in lines if line["saved_build_id"] is None)
    assert named["build_snapshot"]["name"] == NAME
    assert "name" not in unnamed["build_snapshot"]
    assert named["id"] != unnamed["id"]


def test_another_users_saved_build_cannot_be_added(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    build_id = _saved_build(api_client, registered_user["headers"], sample_products)
    other = create_account(api_client)

    for payload in (
        {"saved_build_id": build_id},
        {"saved_build_id": build_id, "expected_items": _items(sample_products)},
    ):
        refused = api_client.post(
            "/api/v1/cart/builds", headers=other["headers"], json=payload
        )
        assert refused.status_code == 422, refused.text
        assert refused.json()["detail"] == "Build not found"
    assert (
        api_client.get("/api/v1/cart", headers=other["headers"]).json()["items"] == []
    )


def test_purchased_build_keeps_its_name_after_rename_and_delete(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)
    assert _add_saved(api_client, headers, build_id).status_code == 200
    assert (
        api_client.put(
            f"/api/v1/builds/{build_id}",
            headers=headers,
            json={"name": "Renamed later"},
        ).status_code
        == 200
    )

    purchased = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert purchased.status_code == 200, purchased.text
    entry = purchased.json()["order"]["items"][0]
    assert entry["kind"] == "custom_build"
    assert entry["name_snapshot"] == NAME
    assert entry["quantity"] == 1
    assert Decimal(entry["unit_price"]) == sum(
        product.price for product in sample_products.values()
    )
    assert len(entry["components_snapshot"]) == 8

    # The order snapshot is immutable: the source build is renamed, then deleted.
    assert (
        api_client.delete(f"/api/v1/builds/{build_id}", headers=headers).status_code
        == 204
    )
    orders = api_client.get("/api/v1/cart/orders", headers=headers).json()
    assert [item["name_snapshot"] for item in orders[0]["items"]] == [NAME]


def test_edited_saved_build_adds_a_separate_line_without_overwriting_the_old_one(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    other_storage = _clone_product(
        test_db_session, sample_products["storage"], "storage", "alt"
    )
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)
    assert _add_saved(api_client, headers, build_id).status_code == 200

    # The user renames the saved build and replaces one component.
    changed_items = [
        item for item in _items(sample_products) if item["slot"] != "storage"
    ] + [{"slot": "storage", "product_id": other_storage.id}]
    assert (
        api_client.put(
            f"/api/v1/builds/{build_id}",
            headers=headers,
            json={"name": "Workstation 2027", "items": changed_items},
        ).status_code
        == 200
    )
    # The configuration the client verified is now stale and is refused.
    stale = _add_saved(
        api_client, headers, build_id, expected_items=_items(sample_products)
    )
    assert stale.status_code == 422, stale.text

    # Adding the current state of the build keeps the earlier line untouched.
    assert _add_saved(api_client, headers, build_id).status_code == 200
    lines = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    assert len(lines) == 2
    assert sorted(line["build_snapshot"]["name"] for line in lines) == [
        NAME,
        "Workstation 2027",
    ]
    original = next(line for line in lines if line["build_snapshot"]["name"] == NAME)
    assert {
        row["slot"]: row["product_id"]
        for row in original["build_snapshot"]["components"]
    } == {item["slot"]: item["product_id"] for item in _items(sample_products)}

    # A further unchanged addition raises the quantity of the current line.
    assert _add_saved(api_client, headers, build_id).status_code == 200
    lines = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    assert len(lines) == 2
    current = next(
        line for line in lines if line["build_snapshot"]["name"] == "Workstation 2027"
    )
    assert current["quantity"] == 2


def test_direct_addition_keeps_the_saved_build_quota(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]

    added = api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"items": _items(sample_products)}
    )
    assert added.status_code == 200, added.text
    assert added.json()["items"][0]["saved_build_id"] is None
    assert added.json()["items"][0]["build_snapshot"].get("name") is None
    assert (
        test_db_session.query(SavedBuild)
        .filter_by(user_id=registered_user["id"])
        .count()
        == 0
    )

    # An unnamed direct line never merges with a named saved build of the same parts.
    build_id = _saved_build(api_client, headers, sample_products)
    assert _add_saved(api_client, headers, build_id).status_code == 200
    lines = api_client.get("/api/v1/cart", headers=headers).json()["items"]
    assert len(lines) == 2
    assert sum(1 for line in lines if line["saved_build_id"] is None) == 1


def test_cart_snapshot_name_survives_a_deleted_saved_build(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    build_id = _saved_build(api_client, headers, sample_products)
    assert _add_saved(api_client, headers, build_id).status_code == 200
    assert (
        api_client.delete(f"/api/v1/builds/{build_id}", headers=headers).status_code
        == 204
    )

    line = api_client.get("/api/v1/cart", headers=headers).json()["items"][0]
    assert line["build_snapshot"]["name"] == NAME
    # Deleting the saved build detaches the line instead of removing the purchase.
    assert line["saved_build_id"] is None

    purchased = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert purchased.status_code == 200, purchased.text
    assert purchased.json()["order"]["items"][0]["name_snapshot"] == NAME


def test_cart_line_snapshot_is_stored_verbatim(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    name = "Игровой ПК «Титан» — 2026 ✦"
    build_id = _saved_build(api_client, headers, sample_products, name)
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    item_id = added.json()["items"][0]["id"]

    # Stored, not derived: the database row itself holds the user's name.
    row = test_db_session.get(CartItem, item_id)
    assert row is not None
    assert row.build_snapshot["name"] == name

    purchased = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert purchased.status_code == 200, purchased.text
    assert purchased.json()["order"]["items"][0]["name_snapshot"] == name
