"""API/transaction regressions of the editable numeric characteristics.

Every test here needs the isolated PostgreSQL database
(`PC_BUILDER_TEST_DATABASE_URL`) and is skipped without it: creation, reuse,
concurrency and rollback guarantees only exist against a real transaction.
The database-free policy/formatting rules live in
`test_numeric_characteristics.py`.
"""

from __future__ import annotations

import threading
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select
from sqlalchemy.orm import Session

from app.models import (
    Characteristic,
    CharacteristicOption,
    Manufacturer,
    Product,
    ProductCharacteristic,
)
from app.services import spec_service
from app.services.compatibility import check_selections
from tests.conftest import apply_compatible_build

FIELD = "weight_g"
VALUE = "905.5 г"


def _definition(db: Session, category_id: int, code: str) -> Characteristic:
    """Get-or-create one definition of the test category (no hardcoded ids)."""
    existing = db.scalar(
        select(Characteristic).where(
            Characteristic.category_id == category_id,
            Characteristic.code == code,
        )
    )
    if existing is not None:
        return existing
    row = Characteristic(
        category_id=category_id,
        code=code,
        name=code,
        data_type="number",
        sort_order=950,
        is_required=False,
    )
    db.add(row)
    db.flush()
    return row


def _payload(sample_products: dict, **overrides: Any) -> dict:
    product = sample_products["gpu"]
    payload = {
        "name": "Numeric Probe GPU",
        "product_type_id": product.product_type_id,
        "manufacturer_id": product.manufacturer_id,
        "price": "199.00",
        "stock_quantity": 3,
        "description": "Числовое значение",
    }
    payload.update(overrides)
    return payload


def _create(client: TestClient, admin: dict, payload: dict):
    return client.post("/api/v1/admin/products", headers=admin["headers"], json=payload)


def _option_ids(db: Session, definition: Characteristic, value: str) -> list[int]:
    return list(
        db.scalars(
            select(CharacteristicOption.id).where(
                CharacteristicOption.characteristic_name_id == definition.id,
                CharacteristicOption.value == value,
            )
        ).all()
    )


def _display_values(response_json: dict) -> dict[str, dict]:
    return {row["code"]: row for row in response_json["characteristics"]}


@pytest.fixture()
def numeric_field(test_db_session: Session, sample_products: dict) -> Characteristic:
    """The GPU `weight_g` definition: allowlisted, so edited as a number."""
    category_id = sample_products["gpu"].product_type.category_id
    return _definition(test_db_session, category_id, FIELD)


@pytest.fixture()
def fixed_field(test_db_session: Session, sample_products: dict) -> Characteristic:
    """A scalar numeric definition outside the allowlist (fixed dropdown)."""
    category_id = sample_products["gpu"].product_type.category_id
    return _definition(test_db_session, category_id, "memory_bus_bits")


def test_custom_numeric_value_creates_then_reuses_one_option(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
    numeric_field: Characteristic,
) -> None:
    assert _option_ids(test_db_session, numeric_field, VALUE) == []
    first = _create(
        api_client,
        admin_user,
        _payload(
            sample_products,
            characteristics=[{"code": FIELD, "numeric_value": "905.5"}],
        ),
    )
    assert first.status_code == 201, first.text
    created = _display_values(first.json())[FIELD]
    assert created["display_value"] == VALUE
    option = created["options"][0]
    assert option["value"] == VALUE
    assert option["quantity"] == 1
    assert _option_ids(test_db_session, numeric_field, VALUE) == [option["option_id"]]

    # An equivalent spelling of the same magnitude reuses that option.
    second = _create(
        api_client,
        admin_user,
        _payload(
            sample_products,
            characteristics=[{"code": FIELD, "numeric_value": "905.50"}],
        ),
    )
    assert second.status_code == 201, second.text
    reused = _display_values(second.json())[FIELD]
    assert reused["options"][0]["option_id"] == option["option_id"]
    assert _option_ids(test_db_session, numeric_field, VALUE) == [option["option_id"]]


def test_custom_numeric_value_outside_the_allowlist_is_rejected(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
    fixed_field: Characteristic,
) -> None:
    test_db_session.add(
        CharacteristicOption(characteristic_name_id=fixed_field.id, value="192 бит")
    )
    test_db_session.flush()
    response = _create(
        api_client,
        admin_user,
        _payload(
            sample_products,
            characteristics=[{"code": fixed_field.code, "numeric_value": "256"}],
        ),
    )
    assert response.status_code == 422, response.text
    assert "does not accept a custom numeric value" in response.text


@pytest.mark.parametrize(
    "submission",
    [
        pytest.param({"code": FIELD, "numeric_value": "0"}, id="zero"),
        pytest.param({"code": FIELD, "numeric_value": "-5"}, id="negative"),
        pytest.param({"code": FIELD, "numeric_value": "1e3"}, id="exponent"),
        pytest.param({"code": FIELD, "numeric_value": "1 2"}, id="whitespace"),
        pytest.param({"code": FIELD, "numeric_value": "1,5"}, id="comma"),
        pytest.param({"code": FIELD, "numeric_value": "905.555"}, id="precision"),
        pytest.param({"code": FIELD, "numeric_value": "20001"}, id="maximum"),
        pytest.param({"code": FIELD, "numeric_value": "905 г"}, id="suffix"),
        pytest.param({"code": FIELD, "numeric_value": ""}, id="empty"),
        pytest.param({"code": FIELD, "numeric_value": None}, id="null"),
        pytest.param({"code": FIELD, "numeric_value": True}, id="boolean"),
        pytest.param({"code": FIELD, "numeric_value": 905}, id="json-number"),
        pytest.param({"code": FIELD, "numeric_value": ["905"]}, id="array"),
        pytest.param(
            {
                "code": FIELD,
                "numeric_value": "905",
                "options": [{"option_id": 1}],
            },
            id="options-and-number",
        ),
        pytest.param(
            {"code": FIELD, "numeric_value": "905", "dimensions": [1, 2, 3]},
            id="dimensions-and-number",
        ),
    ],
)
def test_malformed_custom_numeric_payloads_return_422(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    numeric_field: Characteristic,
    submission: dict,
) -> None:
    response = _create(
        api_client, admin_user, _payload(sample_products, characteristics=[submission])
    )
    assert response.status_code == 422, response.text


def test_new_numeric_option_is_created_in_the_transaction_and_rolls_back(
    isolated_connection,
    sample_products: dict,
    numeric_field: Characteristic,
) -> None:
    product_id = sample_products["gpu"].id
    assert _option_ids_with(isolated_connection, numeric_field, VALUE) == []
    with Session(
        bind=isolated_connection, join_transaction_mode="create_savepoint"
    ) as db:
        definitions, values = spec_service.validate_values(
            db,
            numeric_field.category_id,
            [spec_service.CharacteristicSubmission(code=FIELD, numeric_value="905.5")],
        )
        (selected,) = values[FIELD]
        # The value is validated but still has to be created.
        assert selected.option_id == spec_service.UNRESOLVED_OPTION_ID
        assert selected.value == VALUE
        spec_service.replace_values(db, product_id, definitions, values)
        created = _option_ids(db, numeric_field, VALUE)
        assert len(created) == 1, created
        stored = spec_service.values_for_product(db, product_id)[FIELD]
        assert [option.option_id for option in stored] == created
        db.rollback()

    # A fresh session sees neither the dictionary row nor the association.
    with Session(
        bind=isolated_connection, join_transaction_mode="create_savepoint"
    ) as db:
        assert _option_ids(db, numeric_field, VALUE) == []
        assert FIELD not in spec_service.values_for_product(db, product_id)


def test_concurrent_custom_numeric_writes_converge_on_one_option(
    test_engine: Engine,
    sample_products: dict,
    numeric_field: Characteristic,
) -> None:
    """Two independent writers of `905.5 г` must end on one dictionary row."""
    product_ids = _create_probe_products(test_engine, sample_products, 2)
    barrier = threading.Barrier(2)
    failures: list[Exception] = []
    resolved_ids: list[int] = []

    def write(product_id: int) -> None:
        try:
            with Session(test_engine) as session:
                _, values = spec_service.validate_values(
                    session,
                    numeric_field.category_id,
                    [
                        spec_service.CharacteristicSubmission(
                            code=FIELD, numeric_value="905.5"
                        )
                    ],
                )
                # Both writers reach the dictionary insert at the same moment.
                barrier.wait(timeout=60)
                spec_service.replace_values(
                    session, product_id, [numeric_field], values
                )
                session.commit()
                resolved_ids.append(
                    spec_service.values_for_product(session, product_id)[FIELD][
                        0
                    ].option_id
                )
        except Exception as failure:
            failures.append(failure)

    threads = [threading.Thread(target=write, args=(pid,)) for pid in product_ids]
    try:
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=120)
        assert not failures, failures
        assert len(resolved_ids) == 2
        # Both writers converged on the same dictionary row...
        assert len(set(resolved_ids)) == 1, resolved_ids
        # ...which PostgreSQL holds exactly once.
        assert _option_ids_engine(test_engine, numeric_field, VALUE) == list(
            set(resolved_ids)
        )
        # ...and each product references it with a quantity of one.
        with Session(test_engine) as session:
            rows = {
                (row.product_id, row.characteristic_option_id, row.quantity)
                for row in session.scalars(
                    select(ProductCharacteristic).where(
                        ProductCharacteristic.product_id.in_(product_ids),
                        ProductCharacteristic.characteristic_id == numeric_field.id,
                    )
                ).all()
            }
        assert rows == {
            (product_ids[0], resolved_ids[0], 1),
            (product_ids[1], resolved_ids[1], 1),
        }
    finally:
        _cleanup_probe(test_engine, numeric_field, product_ids)


def test_numeric_value_is_used_by_the_compatibility_rules(
    test_db_session: Session,
    sample_products: dict,
    api_client: TestClient,
    admin_user: dict,
) -> None:
    """A newly created `capacity_gb` takes part in numeric rule comparisons."""
    products = apply_compatible_build(test_db_session, sample_products)
    ram_definition = _definition(
        test_db_session, sample_products["ram"].product_type.category_id, "capacity_gb"
    )
    assert ram_definition.editor == spec_service.EDITOR_NUMERIC
    response = api_client.patch(
        f"/api/v1/admin/products/{products['ram']}",
        headers=admin_user["headers"],
        json={"characteristics": [{"code": "capacity_gb", "numeric_value": "200"}]},
    )
    assert response.status_code == 200, response.text
    assert _option_ids(test_db_session, ram_definition, "200 ГБ") != []

    result = check_selections(test_db_session, products)
    capacity = [
        item
        for item in result.results
        if item.code == "ram+mobo_capacity"  # type: ignore[attr-defined]
    ]
    assert capacity, "the capacity rule must be evaluated"
    assert all(not item.is_compatible for item in capacity)


def test_public_and_admin_serialization_use_the_new_numeric_value(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
) -> None:
    created = _create(
        api_client,
        admin_user,
        _payload(
            sample_products,
            is_active=True,
            characteristics=[{"code": FIELD, "numeric_value": "905.5"}],
        ),
    )
    assert created.status_code == 201, created.text
    body = created.json()
    detail = api_client.get(
        f"/api/v1/admin/products/{body['id']}", headers=admin_user["headers"]
    )
    assert detail.status_code == 200
    assert _display_values(detail.json())[FIELD]["display_value"] == VALUE
    public = api_client.get(f"/api/v1/products/{body['slug']}")
    assert public.status_code == 200, public.text
    public_rows = {row["code"]: row for row in public.json().get("characteristics", [])}
    if FIELD in public_rows:
        assert public_rows[FIELD]["display_value"] == VALUE


# ── Engine-level helpers: own records only ──────────────────────────────────


def _create_probe_products(
    engine: Engine, sample_products: dict, count: int
) -> list[int]:
    """Committed probe products, registrable for exact cleanup by their ids."""
    source = sample_products["gpu"]
    created: list[int] = []
    with Session(engine) as session:
        maker = session.get(Manufacturer, source.manufacturer_id)
        assert maker is not None
        for index in range(count):
            product = Product(
                product_type_id=source.product_type_id,
                manufacturer_id=source.manufacturer_id,
                slug=f"numeric-probe-{threading.get_ident()}-{index}",
                sku=f"NUMERIC-{threading.get_ident()}-{index}",
                name=f"Numeric probe {index}",
                description="Numeric concurrency probe",
                price="100.00",
                stock_quantity=1,
                on_sale=False,
                is_active=False,
            )
            session.add(product)
            session.flush()
            created.append(product.id)
        session.commit()
    return created


def _option_ids_engine(
    engine: Engine, definition: Characteristic, value: str
) -> list[int]:
    with Session(engine) as session:
        return _option_ids(session, definition, value)


def _option_ids_with(connection, definition: Characteristic, value: str) -> list[int]:
    return list(
        connection.execute(
            select(CharacteristicOption.id).where(
                CharacteristicOption.characteristic_name_id == definition.id,
                CharacteristicOption.value == value,
            )
        ).scalars()
    )


def _cleanup_probe(
    engine: Engine, definition: Characteristic, product_ids: list[int]
) -> None:
    """Remove only the rows this test created; never a pre-existing record."""
    with Session(engine) as session:
        session.execute(
            delete(ProductCharacteristic).where(
                ProductCharacteristic.product_id.in_(product_ids)
            )
        )
        session.flush()
        for option_id in _option_ids(session, definition, VALUE):
            references = session.scalar(
                select(func.count())
                .select_from(ProductCharacteristic)
                .where(ProductCharacteristic.characteristic_option_id == option_id)
            )
            if not references:
                session.execute(
                    delete(CharacteristicOption).where(
                        CharacteristicOption.id == option_id
                    )
                )
        session.execute(delete(Product).where(Product.id.in_(product_ids)))
        session.commit()
