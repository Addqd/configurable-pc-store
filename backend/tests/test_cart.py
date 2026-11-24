"""Rollback-safe demo checkout integration tests."""

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.api.cart import _cart_to_out
from app.models import (
    Cart,
    CartItem,
    Manufacturer,
    Product,
    ProductImage,
    SavedBuild,
    User,
)
from tests.conftest import COMPATIBLE_SPECS
from tests.conftest import apply_characteristics as conftest_apply_characteristics
from tests.conftest import apply_compatible_build as conftest_apply_compatible_build
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
        conftest_apply_characteristics(
            test_db_session, product, fake.parts[slots[slot]].values
        )
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


# ── Characteristic payload and query growth ──────────────────────────────────


def test_cart_product_payload_carries_structured_short_characteristics(
    api_client: TestClient,
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """The cart exposes the same structured rows the storefront localizes."""
    product = sample_products["gpu"]
    conftest_apply_characteristics(
        test_db_session, product, {"cart_probe_length_mm": 269.1}
    )
    add = api_client.post(
        "/api/v1/cart/products",
        headers=registered_user["headers"],
        json={"product_id": product.id, "quantity": 1},
    )
    assert add.status_code == 200, add.text
    info = add.json()["items"][0]["product"]

    rows = info["short_characteristics"]
    assert [row["code"] for row in rows] == ["cart_probe_length_mm"]
    row = rows[0]
    assert row["value"] == 269.1
    assert isinstance(row["value"], float)
    assert row["data_type"] == "number"
    assert row["display_value"] == "269.1"
    # `specs` stays the ready-to-render list derived from the same rows.
    assert info["specs"] == ["269.1"]


# ── Direct configurator purchases ────────────────────────────────────────────


def _configured_items(products: dict) -> list[dict]:
    return [
        {"slot": slot, "product_id": product.id} for slot, product in products.items()
    ]


def _clone_product(db: Session, source: Product, suffix: str) -> Product:
    """A second in-stock product of the same type, for a different configuration."""
    maker = db.query(Manufacturer).filter_by(id=source.manufacturer_id).one()
    assert maker is not None
    clone = Product(
        product_type_id=source.product_type_id,
        manufacturer_id=source.manufacturer_id,
        slug=f"{source.slug}-{suffix}",
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
    return clone


def test_direct_build_addition_needs_no_saved_build(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    conftest_apply_compatible_build(test_db_session, sample_products)
    test_db_session.flush()
    headers = registered_user["headers"]

    added = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"items": _configured_items(sample_products)},
    )
    assert added.status_code == 200, added.text
    item = added.json()["items"][0]
    assert item["kind"] == "custom_build"
    assert item["saved_build_id"] is None
    assert len(item["build_snapshot"]["components"]) == 8
    # Prices come from the database, never from the client payload.
    expected = sum(product.price for product in sample_products.values())
    assert Decimal(item["unit_price"]) == expected

    # No saved-build record was created and the five-build quota is untouched.
    assert (
        test_db_session.query(SavedBuild)
        .filter_by(user_id=registered_user["id"])
        .count()
        == 0
    )
    for number in range(5):
        created = api_client.post(
            "/api/v1/builds",
            headers=headers,
            json={
                "name": f"After cart {number}",
                "items": [{"slot": "cpu", "product_id": sample_products["cpu"].id}],
            },
        )
        assert created.status_code == 201, created.text


def test_direct_addition_rejects_incomplete_and_incompatible_builds(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    headers = registered_user["headers"]
    conftest_apply_compatible_build(test_db_session, sample_products)
    test_db_session.flush()

    incomplete = _configured_items(sample_products)[:7]
    assert (
        api_client.post(
            "/api/v1/cart/builds", headers=headers, json={"items": incomplete}
        ).status_code
        == 422
    )

    cpu_item = {"slot": "cpu", "product_id": sample_products["cpu"].id}
    assert (
        api_client.post(
            "/api/v1/cart/builds", headers=headers, json={"items": [cpu_item, cpu_item]}
        ).status_code
        == 422
    )

    wrong_slot = [{"slot": "cpu", "product_id": sample_products["gpu"].id}] + [
        item for item in _configured_items(sample_products) if item["slot"] != "cpu"
    ]
    assert (
        api_client.post(
            "/api/v1/cart/builds", headers=headers, json={"items": wrong_slot}
        ).status_code
        == 422
    )

    conftest_apply_characteristics(
        test_db_session, sample_products["cpu"], {"socket": "LGA1700"}
    )
    test_db_session.flush()
    conflicting = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"items": _configured_items(sample_products)},
    )
    assert conflicting.status_code == 422, conflicting.text
    assert api_client.get("/api/v1/cart", headers=headers).json()["items"] == []

    assert (
        api_client.post(
            "/api/v1/cart/builds", json={"items": _configured_items(sample_products)}
        ).status_code
        == 401
    )


def test_direct_addition_aggregates_only_identical_configurations(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    conftest_apply_compatible_build(test_db_session, sample_products)
    other_storage = _clone_product(test_db_session, sample_products["storage"], "alt")
    conftest_apply_characteristics(
        test_db_session, other_storage, dict(COMPATIBLE_SPECS["storage"])
    )
    test_db_session.flush()
    headers = registered_user["headers"]
    items = _configured_items(sample_products)

    assert (
        api_client.post(
            "/api/v1/cart/builds", headers=headers, json={"items": items}
        ).status_code
        == 200
    )
    again = api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"items": items}
    )
    assert again.status_code == 200
    lines = again.json()["items"]
    assert len(lines) == 1
    assert lines[0]["quantity"] == 2

    # A different storage drive is a different configuration, not a quantity bump.
    different = [
        {"slot": item["slot"], "product_id": item["product_id"]}
        for item in items
        if item["slot"] != "storage"
    ] + [{"slot": "storage", "product_id": other_storage.id}]
    separate = api_client.post(
        "/api/v1/cart/builds", headers=headers, json={"items": different}
    )
    assert separate.status_code == 200, separate.text
    lines = separate.json()["items"]
    assert len(lines) == 2
    assert sorted(line["quantity"] for line in lines) == [1, 2]


def test_unsaved_build_quantity_and_checkout_keep_snapshots(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    conftest_apply_compatible_build(test_db_session, sample_products)
    test_db_session.flush()
    headers = registered_user["headers"]
    added = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"items": _configured_items(sample_products)},
    )
    item_id = added.json()["items"][0]["id"]

    updated = api_client.patch(
        f"/api/v1/cart/{item_id}", headers=headers, json={"quantity": 2}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["items"][0]["quantity"] == 2

    # The catalogue price changes after the line was added: the cart re-reads the
    # authoritative price instead of trusting the stored snapshot.
    gpu = sample_products["gpu"]
    gpu.price = gpu.price + 100
    test_db_session.flush()
    refreshed = api_client.get("/api/v1/cart", headers=headers).json()["items"][0]
    assert Decimal(refreshed["unit_price"]) == sum(
        product.price for product in sample_products.values()
    )

    checkout = api_client.post("/api/v1/cart/checkout", headers=headers)
    assert checkout.status_code == 200, checkout.text
    entry = checkout.json()["order"]["items"][0]
    assert entry["kind"] == "custom_build"
    assert entry["saved_build_id"] is None
    assert entry["quantity"] == 2
    assert len(entry["components_snapshot"]) == 8
    assert api_client.get("/api/v1/cart", headers=headers).json()["items"] == []

    # The stored order snapshot is historical: renaming the product and changing
    # its price does not rewrite what was purchased.
    gpu.name = "Renamed after purchase"
    gpu.price = gpu.price + 500
    test_db_session.flush()
    orders = api_client.get("/api/v1/cart/orders", headers=headers).json()
    snapshot = orders[0]["items"][0]["components_snapshot"]
    assert "Renamed after purchase" not in {row["product_name"] for row in snapshot}
    assert orders[0]["items"][0]["saved_build_id"] is None


def test_direct_addition_validates_stock(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    conftest_apply_compatible_build(test_db_session, sample_products)
    sample_products["cpu"].stock_quantity = 1
    test_db_session.flush()
    headers = registered_user["headers"]

    first = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"items": _configured_items(sample_products)},
    )
    assert first.status_code == 200, first.text
    # A second identical configuration would need two units of a single-stock part.
    refused = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={"items": _configured_items(sample_products)},
    )
    assert refused.status_code == 422, refused.text


def test_direct_addition_requires_exactly_one_source(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    headers = registered_user["headers"]
    assert (
        api_client.post("/api/v1/cart/builds", headers=headers, json={}).status_code
        == 422
    )
    created = api_client.post(
        "/api/v1/builds", headers=headers, json={"name": "Mine", "items": []}
    )
    assert created.status_code == 201
    both = api_client.post(
        "/api/v1/cart/builds",
        headers=headers,
        json={
            "saved_build_id": created.json()["id"],
            "items": _configured_items(sample_products),
        },
    )
    assert both.status_code == 422


def _count_statements(db: Session, action) -> list[str]:
    """Statements emitted while `action()` runs, including its flushes."""
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = db.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", record)
    return statements


def _add_product_items(db: Session, cart: Cart, products: list) -> None:
    """Adds one line per product; a cart holds each product once."""
    for product in products:
        db.add(
            CartItem(
                cart_id=cart.id,
                kind="product",
                product_id=product.id,
                quantity=1,
                build_snapshot=None,
            )
        )
    db.flush()


def _cart_with_items(db: Session, user_id: int, products: list) -> Cart:
    # One cart per user: `carts.user_id` is unique, so a second cart for the same
    # user is a constraint violation. The number of *lines* is what varies here.
    cart = Cart(user_id=user_id)
    db.add(cart)
    db.flush()
    _add_product_items(db, cart, products)
    return cart


def _statements_reading(statements: list[str], table: str) -> int:
    """How many of the statements read `table`."""
    return sum(1 for statement in statements if f"FROM {table}" in statement)


def test_cart_serialization_query_count_does_not_grow_with_items(
    registered_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """Serializing one cart costs the same with 2 and with 8 product lines.

    The same cart is serialized twice, first with two lines and then with all
    eight, so both measurements see the same user and the unique
    `carts.user_id` constraint stays untouched. Each measurement starts from an
    unloaded ORM state: every attribute of every instance is expired, therefore a
    relationship that is not eager-loaded has to emit its own statement instead of
    being served from a collection a previous serialization warmed up. That is what
    makes the test fail when `selectinload(Product.images)` is removed.
    """
    everything = list(sample_products.values())
    for product in everything:
        test_db_session.add(
            ProductImage(
                product_id=product.id,
                image_url=f"/media/probe-{product.id}.jpg",
                sort_order=0,
            )
        )
        # Real characteristic rows, so the serialized payload is not empty. The
        # category definitions are whatever the migration seeded plus this probe.
        conftest_apply_characteristics(
            test_db_session, product, {"cart_query_probe": 269.1}
        )
    test_db_session.flush()

    user = test_db_session.get(User, registered_user["id"])
    assert user is not None
    cart = _cart_with_items(test_db_session, user.id, everything[:2])

    def serialization_statements() -> list[str]:
        # Expire *before* counting and serialize only inside the counter: no
        # unmeasured serialization may pre-load anything the counted run would
        # otherwise skip.
        test_db_session.expire_all()
        loaded_cart = test_db_session.get(Cart, cart.id)
        assert loaded_cart is not None
        statements = _count_statements(
            test_db_session, lambda: _cart_to_out(loaded_cart, test_db_session)
        )
        assert statements
        return statements

    small_statements = serialization_statements()

    _add_product_items(test_db_session, cart, everything[2:])

    large_statements = serialization_statements()

    for statements in (small_statements, large_statements):
        # The serializer really loads the cart lines, their products, their
        # images and their characteristics — nothing is served from a warm cache.
        assert _statements_reading(statements, "cart_items") == 1
        assert _statements_reading(statements, "products") == 1
        assert _statements_reading(statements, "product_images") == 1
        assert _statements_reading(statements, "characteristics") == 1
        assert _statements_reading(statements, "product_characteristics") == 1

    # The statement count is a small constant that does not grow with the number
    # of lines: 8 lines cost exactly as many statements as 2. Lazy-loading the
    # images alone would add one statement per line and break both this equality
    # and the `product_images == 1` assertion above.
    assert len(large_statements) == len(small_statements)
