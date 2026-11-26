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
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Cart, CartItem, Manufacturer, Product, SavedBuild
from app.schemas.cart import CartAddBuildRequest
from app.services.cart_service import (
    _matching_saved_line,
    _merges_with_unnamed_configuration,
    _same_saved_line,
    selections_from_items,
)
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


def _snapshot(name: str | None, selections: dict[str, int]) -> dict:
    snapshot = {
        "components": [
            {"slot": slot, "product_id": product_id}
            for slot, product_id in selections.items()
        ],
        "total_price": "10.00",
    }
    if name is not None:
        snapshot["name"] = name
    return snapshot


def test_detached_named_line_is_never_an_unnamed_candidate() -> None:
    """A named snapshot stays a separate purchase after its saved build is gone.

    Deleting a saved build detaches the reference (``saved_build_id`` becomes
    NULL) without touching the snapshot, so the captured name is the only fact
    that still tells the named purchase from an unnamed configuration.
    """
    selections = {"cpu": 1}
    named = CartItem(
        id=1,
        kind="custom_build",
        saved_build_id=None,
        build_snapshot=_snapshot("Gaming PC 2026", selections),
    )
    unnamed = CartItem(
        id=2,
        kind="custom_build",
        saved_build_id=None,
        build_snapshot=_snapshot(None, selections),
    )
    blank = CartItem(
        id=3,
        kind="custom_build",
        saved_build_id=None,
        build_snapshot=_snapshot("   ", selections),
    )
    product_line = CartItem(id=4, kind="product", product_id=9, build_snapshot=None)
    still_saved = CartItem(
        id=5,
        kind="custom_build",
        saved_build_id=7,
        build_snapshot=_snapshot("Gaming PC 2026", selections),
    )

    assert _merges_with_unnamed_configuration(named) is False
    assert _merges_with_unnamed_configuration(unnamed) is True
    # A name that is not a real captured name does not protect the line.
    assert _merges_with_unnamed_configuration(blank) is True
    assert _merges_with_unnamed_configuration(product_line) is False
    assert _merges_with_unnamed_configuration(still_saved) is False


def test_matching_saved_line_prefers_the_exact_named_match() -> None:
    selections = {"cpu": 1}
    # The legacy line comes first, so a naive "first candidate" rule would pick it.
    legacy = CartItem(
        id=1,
        kind="custom_build",
        saved_build_id=7,
        build_snapshot=_snapshot(None, selections),
    )
    named = CartItem(
        id=2,
        kind="custom_build",
        saved_build_id=7,
        build_snapshot=_snapshot("Gaming PC 2026", selections),
    )
    older = CartItem(
        id=3,
        kind="custom_build",
        saved_build_id=7,
        build_snapshot=_snapshot("Gaming PC 2025", selections),
    )
    other_parts = CartItem(
        id=4,
        kind="custom_build",
        saved_build_id=7,
        build_snapshot=_snapshot("Gaming PC 2026", {"cpu": 2}),
    )

    assert (
        _matching_saved_line(
            [legacy, named, older, other_parts], selections, "Gaming PC 2026"
        )
        is named
    )
    # Without an exact named match the legacy unnamed snapshot is reused.
    assert _matching_saved_line([legacy, older], selections, "Workstation") is legacy
    # A different name and different components are a different purchase.
    assert _matching_saved_line([older, other_parts], selections, "Workstation") is None
    assert _matching_saved_line([], selections, "Gaming PC 2026") is None


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


def _add_direct(api_client: TestClient, headers: dict, items: list[dict]):
    return api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"items": items}
    )


def _cart_lines(api_client: TestClient, headers: dict) -> list[dict]:
    response = api_client.get("/api/v1/cart", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["items"]


def _line(lines: list[dict], line_id: int) -> dict:
    """The cart line by its own id: never by position or database order."""
    matching = [line for line in lines if line["id"] == line_id]
    assert len(matching) == 1, lines
    return matching[0]


def _components(line: dict) -> dict[str, int]:
    return {
        row["slot"]: row["product_id"] for row in line["build_snapshot"]["components"]
    }


def _expected_components(items: list[dict]) -> dict[str, int]:
    return {item["slot"]: item["product_id"] for item in items}


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
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    original_id = added.json()["items"][0]["id"]
    original_items = _items(sample_products)

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
    stale = _add_saved(api_client, headers, build_id, expected_items=original_items)
    assert stale.status_code == 422, stale.text
    lines = _cart_lines(api_client, headers)
    assert len(lines) == 1
    assert _line(lines, original_id)["build_snapshot"]["name"] == NAME

    # Adding the current state of the build keeps the earlier line untouched.
    current = _add_saved(api_client, headers, build_id)
    assert current.status_code == 200, current.text
    lines = current.json()["items"]
    assert len(lines) == 2
    current_id = next(line["id"] for line in lines if line["id"] != original_id)
    original = _line(lines, original_id)
    latest = _line(lines, current_id)
    assert original["build_snapshot"]["name"] == NAME
    assert original["quantity"] == 1
    assert _components(original) == _expected_components(original_items)
    assert latest["build_snapshot"]["name"] == "Workstation 2027"
    assert latest["quantity"] == 1
    assert _components(latest) == _expected_components(changed_items)

    # A further unchanged addition raises the quantity of the current line only.
    for expected_quantity in (2, 3):
        repeated = _add_saved(api_client, headers, build_id)
        assert repeated.status_code == 200, repeated.text
        lines = repeated.json()["items"]
        assert len(lines) == 2
        assert _line(lines, current_id)["quantity"] == expected_quantity
        unchanged = _line(lines, original_id)
        assert unchanged["quantity"] == 1
        assert unchanged["build_snapshot"]["name"] == NAME
        assert _components(unchanged) == _expected_components(original_items)

    # The ids survive every repetition: no line was replaced or consolidated.
    assert sorted(line["id"] for line in lines) == sorted([original_id, current_id])


def test_identical_direct_configuration_after_deletion_is_a_separate_unnamed_line(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    items = _items(sample_products)
    build_id = _saved_build(api_client, headers, sample_products)
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    named_id = added.json()["items"][0]["id"]
    assert (
        api_client.delete(f"/api/v1/builds/{build_id}", headers=headers).status_code
        == 204
    )

    # THE defect: the detached line still carries the name, so the identical direct
    # configuration must become its own unnamed line instead of absorbing it.
    for expected_quantity in (1, 2, 3):
        direct = _add_direct(api_client, headers, items)
        assert direct.status_code == 200, direct.text
        lines = direct.json()["items"]
        assert len(lines) == 2
        named = _line(lines, named_id)
        unnamed = next(line for line in lines if line["id"] != named_id)
        assert named["build_snapshot"]["name"] == NAME
        assert named["quantity"] == 1
        assert named["saved_build_id"] is None
        assert _components(named) == _expected_components(items)
        assert unnamed["build_snapshot"].get("name") is None
        assert unnamed["quantity"] == expected_quantity
        assert unnamed["saved_build_id"] is None


def test_detached_named_line_keeps_its_snapshot_through_quantity_and_purchase(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    items = _items(sample_products)
    build_id = _saved_build(api_client, headers, sample_products)
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    named_id = added.json()["items"][0]["id"]
    assert (
        api_client.delete(f"/api/v1/builds/{build_id}", headers=headers).status_code
        == 204
    )
    for _ in range(2):
        assert _add_direct(api_client, headers, items).status_code == 200
    lines = _cart_lines(api_client, headers)
    assert len(lines) == 2
    unnamed_id = next(line["id"] for line in lines if line["id"] != named_id)

    # A quantity change of the named line keeps its name and its components.
    changed = api_client.patch(
        f"/api/v1/cart/{named_id}", headers=headers, json={"quantity": 4}
    )
    assert changed.status_code == 200, changed.text
    lines = changed.json()["items"]
    named = _line(lines, named_id)
    assert named["quantity"] == 4
    assert named["build_snapshot"]["name"] == NAME
    assert _components(named) == _expected_components(items)
    assert _line(lines, unnamed_id)["quantity"] == 2

    # Purchasing keeps the named snapshot and the unnamed configuration apart.
    purchased = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert purchased.status_code == 200, purchased.text
    order = purchased.json()["order"]
    entries = {entry["name_snapshot"]: entry for entry in order["items"]}
    assert sorted(entries) == sorted([NAME, "Сборка ПК"])
    assert entries[NAME]["quantity"] == 4
    assert entries[NAME]["saved_build_id"] is None
    assert len(entries[NAME]["components_snapshot"]) == 8
    assert entries["Сборка ПК"]["quantity"] == 2
    assert order["item_count"] == 6
    assert _cart_lines(api_client, headers) == []


def test_repeated_additions_of_the_latest_version_raise_the_matching_line(
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
    original_id = added.json()["items"][0]["id"]

    # A name-only change keeps the old purchase and adds the new name separately.
    assert (
        api_client.put(
            f"/api/v1/builds/{build_id}",
            headers=headers,
            json={"name": "Workstation"},
        ).status_code
        == 200
    )
    renamed = _add_saved(api_client, headers, build_id)
    assert renamed.status_code == 200, renamed.text
    lines = renamed.json()["items"]
    assert len(lines) == 2
    current_id = next(line["id"] for line in lines if line["id"] != original_id)
    assert _line(lines, original_id)["build_snapshot"]["name"] == NAME
    assert _line(lines, current_id)["build_snapshot"]["name"] == "Workstation"

    # THE defect: the older line references the same saved build, so the current
    # version must still be found instead of being added a third time.
    for expected_quantity in (2, 3):
        repeated = _add_saved(api_client, headers, build_id)
        assert repeated.status_code == 200, repeated.text
        lines = repeated.json()["items"]
        assert len(lines) == 2
        assert _line(lines, current_id)["quantity"] == expected_quantity
        assert _line(lines, original_id)["quantity"] == 1


def test_changed_components_without_a_rename_add_a_separate_line(
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
    items = _items(sample_products)
    build_id = _saved_build(api_client, headers, sample_products)
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    original_id = added.json()["items"][0]["id"]

    changed_items = [item for item in items if item["slot"] != "storage"] + [
        {"slot": "storage", "product_id": other_storage.id}
    ]
    assert (
        api_client.put(
            f"/api/v1/builds/{build_id}",
            headers=headers,
            json={"items": changed_items},
        ).status_code
        == 200
    )
    # The name did not change, the components did: still a different purchase.
    changed = _add_saved(api_client, headers, build_id)
    assert changed.status_code == 200, changed.text
    lines = changed.json()["items"]
    assert len(lines) == 2
    current_id = next(line["id"] for line in lines if line["id"] != original_id)
    assert _line(lines, current_id)["build_snapshot"]["name"] == NAME
    assert _components(_line(lines, current_id)) == _expected_components(changed_items)
    assert _components(_line(lines, original_id)) == _expected_components(items)

    repeated = _add_saved(api_client, headers, build_id)
    assert repeated.status_code == 200, repeated.text
    lines = repeated.json()["items"]
    assert len(lines) == 2
    assert _line(lines, current_id)["quantity"] == 2
    assert _line(lines, original_id)["quantity"] == 1


def test_multiple_historical_versions_of_one_saved_build_stay_independent(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    second_storage = _clone_product(
        test_db_session, sample_products["storage"], "storage", "alt"
    )
    third_storage = _clone_product(
        test_db_session, sample_products["storage"], "storage", "pro"
    )
    headers = registered_user["headers"]
    first_items = _items(sample_products)
    second_items = [item for item in first_items if item["slot"] != "storage"] + [
        {"slot": "storage", "product_id": second_storage.id}
    ]
    third_items = [item for item in first_items if item["slot"] != "storage"] + [
        {"slot": "storage", "product_id": third_storage.id}
    ]

    build_id = _saved_build(api_client, headers, sample_products)
    first = _add_saved(api_client, headers, build_id)
    assert first.status_code == 200, first.text
    first_id = first.json()["items"][0]["id"]
    for name, items in (("Workstation", second_items), ("Server", third_items)):
        assert (
            api_client.put(
                f"/api/v1/builds/{build_id}",
                headers=headers,
                json={"name": name, "items": items},
            ).status_code
            == 200
        )
        assert _add_saved(api_client, headers, build_id).status_code == 200

    lines = _cart_lines(api_client, headers)
    assert len(lines) == 3
    by_name = {line["build_snapshot"]["name"]: line for line in lines}
    assert sorted(by_name) == sorted([NAME, "Workstation", "Server"])
    server_id = by_name["Server"]["id"]
    assert all(line["quantity"] == 1 for line in lines)

    # Repeating the newest version raises only that line.
    repeated = _add_saved(api_client, headers, build_id)
    assert repeated.status_code == 200, repeated.text
    lines = repeated.json()["items"]
    assert len(lines) == 3
    assert _line(lines, server_id)["quantity"] == 2
    assert sorted(line["quantity"] for line in lines if line["id"] != server_id) == [
        1,
        1,
    ]

    # Returning to the first version matches that historical line, not the newest.
    assert (
        api_client.put(
            f"/api/v1/builds/{build_id}",
            headers=headers,
            json={"name": NAME, "items": first_items},
        ).status_code
        == 200
    )
    restored = _add_saved(api_client, headers, build_id)
    assert restored.status_code == 200, restored.text
    lines = restored.json()["items"]
    assert len(lines) == 3
    assert _line(lines, first_id)["quantity"] == 2
    assert _components(_line(lines, first_id)) == _expected_components(first_items)
    assert _line(lines, server_id)["quantity"] == 2
    assert len([line for line in lines if line["quantity"] == 1]) == 1


def test_exact_named_match_takes_precedence_over_a_legacy_unnamed_line(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    _compatible(test_db_session, sample_products)
    headers = registered_user["headers"]
    items = _items(sample_products)
    build_id = _saved_build(api_client, headers, sample_products)
    added = _add_saved(api_client, headers, build_id)
    assert added.status_code == 200, added.text
    named_id = added.json()["items"][0]["id"]

    # An earlier line of the same build and components without a captured name.
    cart = test_db_session.scalar(
        select(Cart).where(Cart.user_id == registered_user["id"])
    )
    assert cart is not None
    legacy = CartItem(
        cart_id=cart.id,
        kind="custom_build",
        saved_build_id=build_id,
        build_snapshot={
            "components": [
                {
                    "slot": item["slot"],
                    "product_id": item["product_id"],
                    "product_name": "Legacy part",
                    "price": "1.00",
                }
                for item in items
            ],
            "total_price": "8.00",
        },
        quantity=1,
    )
    test_db_session.add(legacy)
    test_db_session.flush()
    legacy_id = legacy.id

    again = _add_saved(api_client, headers, build_id)
    assert again.status_code == 200, again.text
    lines = again.json()["items"]
    assert len(lines) == 2
    # The exact named line is the purchase; the legacy snapshot keeps its quantity.
    assert _line(lines, named_id)["quantity"] == 2
    assert _line(lines, named_id)["build_snapshot"]["name"] == NAME
    assert _line(lines, legacy_id)["quantity"] == 1


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
