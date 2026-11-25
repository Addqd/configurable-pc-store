"""API/transaction regressions of the editable numeric characteristics.

Every test here needs the isolated PostgreSQL database
(`PC_BUILDER_TEST_DATABASE_URL`) and is skipped without it: creation, reuse,
concurrency and rollback guarantees only exist against a real transaction.
The database-free policy/formatting rules live in
`test_numeric_characteristics.py`.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from decimal import Decimal
from secrets import randbelow, token_hex
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, Insert, delete, func, select, text
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Characteristic,
    CharacteristicOption,
    Manufacturer,
    Product,
    ProductCharacteristic,
    ProductType,
)
from app.services import numeric_spec, spec_service
from app.services.compatibility import check_selections
from tests.conftest import apply_compatible_build

FIELD = "weight_g"
VALUE = "905.5 г"
CATEGORY_SLUG = "gpu"

# The dedicated worker transactions are bounded: a statement or a lock that never
# completes fails the worker instead of hanging the test. These are set per
# transaction (`SET LOCAL`), so no global PostgreSQL setting is touched.
WORKER_STATEMENT_TIMEOUT_MS = 30_000
WORKER_LOCK_TIMEOUT_MS = 10_000
BARRIER_TIMEOUT_S = 60
WORKER_TIMEOUT_S = 120
# Bounded number of attempts to find a value the dictionary does not hold yet.
ALLOCATION_ATTEMPTS = 16


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
) -> None:
    """Two independent writers of one absent number must end on one dictionary row.

    Everything the writers need comes from the isolated PostgreSQL database
    itself: the fixture rows of `sample_products` live inside an outer transaction
    no other session can see, so the concurrency test reads the committed GPU
    catalogue and creates its own committed probe products instead.
    """
    catalogue = _committed_gpu_catalogue(test_engine)
    submitted, canonical = _allocate_absent_numeric_value(test_engine, catalogue)
    owned = _ProbeRecords(
        canonical=canonical, characteristic_id=catalogue.characteristic_id
    )
    workers_finished = False
    try:
        product_ids = _create_probe_products(test_engine, catalogue, owned, 2)
        barrier = threading.Barrier(2)
        failures: list[tuple[str, BaseException]] = []
        results = [
            _WorkerResult(label=f"worker-{index}", product_id=product_id)
            for index, product_id in enumerate(product_ids)
        ]
        threads = [
            threading.Thread(
                target=_write_numeric_value,
                args=(test_engine, catalogue, result, submitted, barrier, failures),
                name=result.label,
            )
            for result in results
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=WORKER_TIMEOUT_S)

        running = [thread.name for thread in threads if thread.is_alive()]
        if running:
            # A worker that is still running may own an active transaction, so no
            # conflicting cleanup may run: fail and report what is left behind.
            pytest.fail(
                f"worker(s) {', '.join(running)} did not finish within "
                f"{WORKER_TIMEOUT_S}s; the test-owned records were kept so they can "
                f"be inspected: products={owned.product_ids}, "
                f"options={owned.option_ids}, value={canonical!r}",
                pytrace=False,
            )
        # Every `with Session(...)` block of every worker has been left by now.
        workers_finished = True
        assert not failures, failures

        # Each worker opened its own session, therefore its own physical connection.
        assert len({result.backend_pid for result in results}) == 2, results
        # Both started from an absent option, so both reached the real insert.
        assert all(result.unresolved_before_insert for result in results), results
        resolved = [result.resolved_option_id for result in results]
        assert None not in resolved, results
        assert len(set(resolved)) == 1, resolved
        option_id = resolved[0]
        assert option_id is not None

        # Ownership: exactly one worker's INSERT ... RETURNING produced the row, so
        # the record is conclusively test-created and can be cleaned up.
        inserted = [
            inserted_id
            for result in results
            for inserted_id in result.inserted_option_ids
        ]
        if len(inserted) == 1:
            owned.option_ids.append(inserted[0])
        assert inserted == [option_id], (inserted, option_id, results)

        # PostgreSQL holds the canonical wording exactly once.
        assert _canonical_option_ids(test_engine, catalogue, canonical) == [option_id]
        # ...and each probe product references it with a quantity of one.
        with Session(test_engine) as session:
            rows = {
                (row.product_id, row.characteristic_option_id, row.quantity)
                for row in session.scalars(
                    select(ProductCharacteristic).where(
                        ProductCharacteristic.product_id.in_(product_ids),
                        ProductCharacteristic.characteristic_id
                        == catalogue.characteristic_id,
                    )
                ).all()
            }
        assert rows == {(product_id, option_id, 1) for product_id in product_ids}
    finally:
        if workers_finished:
            _cleanup_probe(test_engine, owned)


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


# ── Engine-level helpers: committed dependencies and own records only ───────


@dataclass(frozen=True, slots=True)
class _CommittedGpuCatalogue:
    """Committed catalogue dependencies the concurrency test may rely on."""

    category_id: int
    product_type_id: int
    manufacturer_id: int
    characteristic_id: int


@dataclass(slots=True)
class _ProbeRecords:
    """Records this test conclusively created, and may therefore delete again."""

    canonical: str
    characteristic_id: int
    product_ids: list[int] = field(default_factory=list)
    option_ids: list[int] = field(default_factory=list)


@dataclass(slots=True)
class _WorkerResult:
    """What one concurrent writer observed about its own transaction."""

    label: str
    product_id: int
    backend_pid: int = 0
    resolved_option_id: int | None = None
    quantity: int | None = None
    unresolved_before_insert: bool = False
    inserted_option_ids: list[int] = field(default_factory=list)


_OPTION_TABLE = CharacteristicOption.__table__


class _ObservedDictionaryResult:
    """The dictionary insert result, forwarded unchanged to the writer."""

    def __init__(self, inserted_id: int | None) -> None:
        self._inserted_id = inserted_id

    def scalar_one_or_none(self) -> int | None:
        return self._inserted_id


class _ObservingSession(Session):
    """Session that records the outcome of its own dictionary inserts.

    `spec_service.ensure_option` writes one `characteristic_options` row with
    `ON CONFLICT DO NOTHING ... RETURNING id` and reads the returned id back.
    Observing exactly that statement distinguishes "this transaction created the
    row" from "the row existed already" without changing the production writer:
    the very same value the writer would have read is forwarded to it.
    """

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.inserted_option_ids: list[int] = []

    def execute(self, statement: Any, *args: Any, **kwargs: Any) -> Any:
        result = super().execute(statement, *args, **kwargs)
        if not _is_dictionary_insert(statement):
            return result
        inserted = result.scalar_one_or_none()
        if inserted is not None:
            self.inserted_option_ids.append(int(inserted))
        return _ObservedDictionaryResult(inserted)


def _is_dictionary_insert(statement: Any) -> bool:
    """Whether a statement is the dictionary insert of the production writer."""
    return (
        isinstance(statement, Insert)
        and getattr(statement, "table", None) is _OPTION_TABLE
        and bool(getattr(statement, "_returning", ()))
    )


def _committed_gpu_catalogue(engine: Engine) -> _CommittedGpuCatalogue:
    """Read the committed GPU catalogue through an independent session.

    The concurrency test may not depend on fixture rows of `sample_products`: they
    live inside the outer test transaction and are invisible to every other
    session. Nothing is created here — a missing dependency is a test-environment
    problem, and the test never seeds or migrates the database.
    """
    with Session(engine) as session:
        category = session.scalar(
            select(Category).where(Category.slug == CATEGORY_SLUG)
        )
        if category is None:
            pytest.fail(
                f"The isolated test database has no committed '{CATEGORY_SLUG}' "
                "category; migrate it with Alembic first (the test never seeds or "
                "migrates the database itself)",
                pytrace=False,
            )
        product_type = session.scalar(
            select(ProductType)
            .where(ProductType.category_id == category.id)
            .order_by(ProductType.id)
        )
        manufacturer = session.scalar(select(Manufacturer).order_by(Manufacturer.id))
        definition = session.scalar(
            select(Characteristic).where(
                Characteristic.category_id == category.id,
                Characteristic.code == FIELD,
            )
        )
        missing = [
            label
            for label, row in (
                ("GPU product type", product_type),
                ("manufacturer", manufacturer),
                (f"'{FIELD}' definition", definition),
            )
            if row is None
        ]
        if missing:
            pytest.fail(
                "The isolated test database is missing committed catalogue "
                f"dependencies: {', '.join(missing)}",
                pytrace=False,
            )
        assert product_type is not None and manufacturer is not None
        assert definition is not None
        return _CommittedGpuCatalogue(
            category_id=category.id,
            product_type_id=product_type.id,
            manufacturer_id=manufacturer.id,
            characteristic_id=definition.id,
        )


def _allocate_absent_numeric_value(
    engine: Engine, catalogue: _CommittedGpuCatalogue
) -> tuple[str, str]:
    """A number inside the field policy that no dictionary option holds yet.

    Returns the submitted text and the canonical dictionary wording it must
    produce. A collision is skipped, never resolved by deleting an option, and the
    number of attempts is bounded.
    """
    policy = numeric_spec.numeric_policy(CATEGORY_SLUG, FIELD)
    if policy is None:  # pragma: no cover - the allowlist is asserted elsewhere
        pytest.fail(f"'{FIELD}' is not an editable numeric field")
    with Session(engine) as session:
        stored = {
            numeric_spec.parse_numeric_option(policy, value)
            for value in session.scalars(
                select(CharacteristicOption.value).where(
                    CharacteristicOption.characteristic_name_id
                    == catalogue.characteristic_id
                )
            ).all()
        }
    taken = {value for value in stored if value is not None}
    for _ in range(ALLOCATION_ATTEMPTS):
        # 10000.00 .. 19999.99 — inside the `weight_g` maximum with two decimals.
        number = Decimal(1_000_000 + randbelow(9_999_999)) / Decimal(100)
        if number in taken or number > policy.max_value:
            continue
        canonical = numeric_spec.format_numeric_value(policy, number)
        submitted = numeric_spec.format_decimal(number)
        if len(submitted) > numeric_spec.MAX_NUMERIC_TEXT_LENGTH:  # pragma: no cover
            continue
        return submitted, canonical
    pytest.fail(
        f"could not allocate an unused '{FIELD}' value after {ALLOCATION_ATTEMPTS} "
        f"attempts (checked {len(taken)} stored magnitudes)",
        pytrace=False,
    )


def _create_probe_products(
    engine: Engine, catalogue: _CommittedGpuCatalogue, owned: _ProbeRecords, count: int
) -> list[int]:
    """Committed, test-owned, inactive probe products.

    Each product is committed on its own and registered for cleanup as soon as its
    persistence is confirmed, so a later failure can never leave an unregistered
    row behind.
    """
    processed: list[int] = []
    for _ in range(count):
        suffix = token_hex(8)
        with Session(engine, expire_on_commit=False) as session:
            product = Product(
                product_type_id=catalogue.product_type_id,
                manufacturer_id=catalogue.manufacturer_id,
                slug=f"numeric-probe-{suffix}",
                sku=f"NUMERIC-PROBE-{suffix.upper()}",
                name=f"Numeric concurrency probe {suffix}",
                description="Numeric concurrency probe (test-owned)",
                price="100.00",
                stock_quantity=1,
                on_sale=False,
                is_active=False,
            )
            session.add(product)
            session.commit()
            product_id = int(product.id)
        with Session(engine) as verification:
            if verification.get(Product, product_id) is None:  # pragma: no cover
                pytest.fail(f"probe product {product_id} was not committed")
        owned.product_ids.append(product_id)
        processed.append(product_id)
    return processed


def _write_numeric_value(
    engine: Engine,
    catalogue: _CommittedGpuCatalogue,
    result: _WorkerResult,
    submitted: str,
    barrier: threading.Barrier,
    failures: list[tuple[str, BaseException]],
) -> None:
    """One concurrent writer: validate, meet at the barrier, insert, commit."""
    try:
        with _ObservingSession(engine) as session:
            # Transaction-local bounds: a statement or a lock that never completes
            # fails this worker instead of hanging the test. No global PostgreSQL
            # setting is modified.
            session.execute(
                text(f"SET LOCAL statement_timeout = {WORKER_STATEMENT_TIMEOUT_MS}")
            )
            session.execute(text(f"SET LOCAL lock_timeout = {WORKER_LOCK_TIMEOUT_MS}"))
            result.backend_pid = int(
                session.scalar(text("SELECT pg_backend_pid()")) or 0
            )
            definitions, values = spec_service.validate_values(
                session,
                catalogue.category_id,
                [
                    spec_service.CharacteristicSubmission(
                        code=FIELD, numeric_value=submitted
                    )
                ],
            )
            (selection,) = values[FIELD]
            result.unresolved_before_insert = (
                selection.option_id == spec_service.UNRESOLVED_OPTION_ID
            )
            # Both writers reach the dictionary write at the same moment.
            barrier.wait(timeout=BARRIER_TIMEOUT_S)
            # The definitions validated for this category are what the writer
            # persists: no ORM definition is substituted for them.
            spec_service.replace_values(session, result.product_id, definitions, values)
            session.commit()
            stored = spec_service.values_for_product(session, result.product_id)[FIELD]
            result.resolved_option_id = stored[0].option_id
            result.quantity = stored[0].quantity
            result.inserted_option_ids = list(session.inserted_option_ids)
    except BaseException as failure:
        # A worker that cannot reach the barrier must not make the other one wait.
        barrier.abort()
        failures.append((result.label, failure))


def _canonical_option_ids(
    engine: Engine, catalogue: _CommittedGpuCatalogue, value: str
) -> list[int]:
    with Session(engine) as session:
        return list(
            session.scalars(
                select(CharacteristicOption.id).where(
                    CharacteristicOption.characteristic_name_id
                    == catalogue.characteristic_id,
                    CharacteristicOption.value == value,
                )
            ).all()
        )


def _option_ids_with(connection, definition: Characteristic, value: str) -> list[int]:
    return list(
        connection.execute(
            select(CharacteristicOption.id).where(
                CharacteristicOption.characteristic_name_id == definition.id,
                CharacteristicOption.value == value,
            )
        ).scalars()
    )


def _delete_owned_option(
    session: Session, owned: _ProbeRecords, option_id: int
) -> None:
    """Delete one conclusively test-created option, or refuse to touch it."""
    row = session.get(CharacteristicOption, option_id)
    if row is None:
        return
    if (
        row.characteristic_name_id != owned.characteristic_id
        or row.value != owned.canonical
    ):
        raise AssertionError(
            "Refusing to delete a dictionary option this test does not own: "
            f"id={option_id}, definition={row.characteristic_name_id}, "
            f"value={row.value!r}"
        )
    references = session.scalar(
        select(func.count())
        .select_from(ProductCharacteristic)
        .where(ProductCharacteristic.characteristic_option_id == option_id)
    )
    if references:
        raise AssertionError(
            f"Refusing to delete dictionary option {option_id}: it is still "
            f"referenced by {references} product association(s) this test does not own"
        )
    session.execute(
        delete(CharacteristicOption).where(CharacteristicOption.id == option_id)
    )


def _cleanup_probe(engine: Engine, owned: _ProbeRecords) -> None:
    """Delete only what this test conclusively created, in one transaction.

    Order matters: the associations of the test-owned products are removed first,
    so any reference that still exists afterwards belongs to a product this test
    does not own and makes the dictionary option untouchable.
    """
    if not owned.product_ids and not owned.option_ids:
        return
    with Session(engine) as session:
        try:
            if owned.product_ids:
                session.execute(
                    delete(ProductCharacteristic).where(
                        ProductCharacteristic.product_id.in_(owned.product_ids)
                    )
                )
                session.flush()
            for option_id in owned.option_ids:
                _delete_owned_option(session, owned, option_id)
            if owned.product_ids:
                session.execute(
                    delete(Product).where(Product.id.in_(owned.product_ids))
                )
            session.commit()
        except BaseException:
            session.rollback()
            raise


# ── Cleanup safety regressions ──────────────────────────────────────────────


def test_cleanup_never_deletes_an_option_it_does_not_own(test_engine: Engine) -> None:
    """A matching wording alone never authorizes deleting a dictionary row."""
    catalogue = _committed_gpu_catalogue(test_engine)
    _, canonical = _allocate_absent_numeric_value(test_engine, catalogue)
    with Session(test_engine, expire_on_commit=False) as session:
        pre_existing = CharacteristicOption(
            characteristic_name_id=catalogue.characteristic_id, value=canonical
        )
        session.add(pre_existing)
        session.commit()
        pre_existing_id = int(pre_existing.id)
    # The record only carries the wording: no ownership, so nothing may be deleted.
    owned = _ProbeRecords(
        canonical=canonical, characteristic_id=catalogue.characteristic_id
    )
    try:
        _cleanup_probe(test_engine, owned)
        assert _canonical_option_ids(test_engine, catalogue, canonical) == [
            pre_existing_id
        ]
    finally:
        with Session(test_engine) as session:
            session.execute(
                delete(CharacteristicOption).where(
                    CharacteristicOption.id == pre_existing_id
                )
            )
            session.commit()


def test_cleanup_refuses_an_option_referenced_by_an_unrelated_product(
    test_engine: Engine,
) -> None:
    """An owned option still referenced outside this test is preserved explicitly."""
    catalogue = _committed_gpu_catalogue(test_engine)
    _, canonical = _allocate_absent_numeric_value(test_engine, catalogue)
    foreign = _ProbeRecords(
        canonical=canonical, characteristic_id=catalogue.characteristic_id
    )
    owned = _ProbeRecords(
        canonical=canonical, characteristic_id=catalogue.characteristic_id
    )
    option_id: int | None = None
    try:
        # One product is deliberately *not* registered as owned.
        unrelated_id, probe_id = _create_probe_products(
            test_engine, catalogue, foreign, 2
        )
        with Session(test_engine, expire_on_commit=False) as session:
            option = CharacteristicOption(
                characteristic_name_id=catalogue.characteristic_id, value=canonical
            )
            session.add(option)
            session.flush()
            option_id = int(option.id)
            for product_id in (unrelated_id, probe_id):
                session.add(
                    ProductCharacteristic(
                        product_id=product_id,
                        characteristic_id=catalogue.characteristic_id,
                        characteristic_option_id=option_id,
                        quantity=1,
                    )
                )
            session.commit()
        owned.product_ids.append(probe_id)
        owned.option_ids.append(option_id)

        with pytest.raises(AssertionError, match="still referenced"):
            _cleanup_probe(test_engine, owned)

        # The option and the unrelated association both survive.
        assert _canonical_option_ids(test_engine, catalogue, canonical) == [option_id]
        with Session(test_engine) as session:
            assert session.get(Product, unrelated_id) is not None
            assert (
                session.scalar(
                    select(func.count())
                    .select_from(ProductCharacteristic)
                    .where(
                        ProductCharacteristic.characteristic_option_id == option_id,
                        ProductCharacteristic.product_id == unrelated_id,
                    )
                )
                == 1
            )
    finally:
        with Session(test_engine) as session:
            session.execute(
                delete(ProductCharacteristic).where(
                    ProductCharacteristic.product_id.in_(foreign.product_ids)
                )
            )
            if option_id is not None:
                session.execute(
                    delete(CharacteristicOption).where(
                        CharacteristicOption.id == option_id
                    )
                )
            session.execute(delete(Product).where(Product.id.in_(foreign.product_ids)))
            session.commit()
