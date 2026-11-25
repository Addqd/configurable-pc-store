"""Concurrency and transaction boundaries of the dimension dictionary (PostgreSQL).

The GPU `dimensions_mm` field is the only characteristic whose dictionary value is
created by the backend, so it is the only place where two administrators can race
on the same insert. `spec_service.ensure_option()` relies on PostgreSQL conflict
handling (`ON CONFLICT DO NOTHING` + re-read) instead of application locking; that
guarantee cannot be observed with mocks or with two operations of one session, so
these tests use two **independent sessions on independent connections** against the
isolated test database.

Two rules keep the module honest:

* every dimension triple is allocated from a collision-resistant source, checked
  against the live dictionary and proven absent before it is written, so a
  pre-existing option can never silently turn the race into a re-read; and
* every committed row is owned explicitly — associations and products are removed
  by the identifiers this test created, and a dictionary option is removed only
  after its definition, its canonical value and the absence of references are
  verified. No row is deleted because its text looked like a test value.
"""

from __future__ import annotations

import secrets
import threading
from collections.abc import Callable, Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.engine import Engine
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
from app.services import spec_service

DIMENSION_CODE = "dimensions_mm"

# Allocation band, in hundredths of a millimetre: every candidate is therefore
# strictly positive, at most 1000 mm and written with two decimal places.
_MIN_HUNDREDTHS = 100  # 1.00 mm
_MAX_HUNDREDTHS = 99_990  # 999.90 mm
_ALLOCATION_ATTEMPTS = 50

# Bounded waiting: a wedged worker fails the test instead of hanging the suite.
_BARRIER_TIMEOUT_SECONDS = 60
_WORKER_TIMEOUT_SECONDS = 120

MeasurementTriple = tuple[Decimal, Decimal, Decimal]


class DimensionAllocationError(RuntimeError):
    """No unused dimensions triple could be allocated."""


class CleanupError(RuntimeError):
    """Test-owned rows could not be removed safely."""


@dataclass(frozen=True, slots=True)
class GpuDimensions:
    """The seeded GPU dimensions definition the probes submit against."""

    characteristic_id: int
    category_id: int


@dataclass(frozen=True, slots=True)
class AllocatedDimensions:
    """One unused dimensions triple and the dictionary value it canonicalises to."""

    measurements: MeasurementTriple
    canonical: str


@dataclass(frozen=True, slots=True)
class WriteOutcome:
    """What one writing transaction stored for one product."""

    product_id: int
    canonical: str
    option_id: int
    quantity: int
    backend_pid: int


def _gpu_dimensions(engine: Engine) -> GpuDimensions:
    with Session(engine) as session:
        row = session.execute(
            select(Characteristic.id, Characteristic.category_id)
            .join(Category, Category.id == Characteristic.category_id)
            .where(Category.slug == "gpu", Characteristic.code == DIMENSION_CODE)
        ).one_or_none()
    assert row is not None, (
        "the isolated test database must be migrated with the catalogue seed so the "
        "GPU category defines dimensions_mm"
    )
    return GpuDimensions(int(row[0]), int(row[1]))


# ── Collision-safe allocation of unused test values ──────────────────────────


def _random_measurement() -> Decimal:
    """One collision-resistant measurement from the valid allocation band."""
    span = _MAX_HUNDREDTHS - _MIN_HUNDREDTHS + 1
    return Decimal(_MIN_HUNDREDTHS + secrets.randbelow(span)) / Decimal(100)


def _random_dimensions() -> MeasurementTriple:
    return (_random_measurement(), _random_measurement(), _random_measurement())


def _pending_candidates(
    *triples: MeasurementTriple,
) -> Callable[[], MeasurementTriple]:
    """Candidate source that hands out `triples` in order and then fails.

    A test can therefore prove both that the allocator skipped a value which
    already exists and that it needed no further candidate: exhausting the source
    raises instead of inventing one.
    """
    pending = list(triples)

    def _next() -> MeasurementTriple:
        if not pending:
            raise AssertionError(
                "the allocator requested more candidates than the test supplied: an "
                "existing dictionary value was expected to be skipped, not resolved"
            )
        return pending.pop(0)

    return _next


def _respell(measurements: MeasurementTriple, quantum: str) -> MeasurementTriple:
    """The same magnitudes written with an explicit number of decimal places."""
    first, second, third = measurements
    step = Decimal(quantum)
    return (first.quantize(step), second.quantize(step), third.quantize(step))


def _assert_valid_candidate(measurements: Sequence[Decimal]) -> None:
    """Guard the allocation contract before a value can reach the dictionary."""
    assert len(measurements) == spec_service.DIMENSION_COUNT, measurements
    for measurement in measurements:
        assert isinstance(measurement, Decimal), measurement
        assert Decimal(0) < measurement <= spec_service.MAX_DIMENSION_MM, measurement
        exponent = measurement.as_tuple().exponent
        assert isinstance(exponent, int)
        assert -exponent <= spec_service.DIMENSION_DECIMAL_PLACES, measurement


def allocate_dimensions(
    engine: Engine,
    definition: GpuDimensions,
    *,
    candidates: Callable[[], MeasurementTriple] = _random_dimensions,
    attempts: int = _ALLOCATION_ATTEMPTS,
) -> AllocatedDimensions:
    """Return a valid triple whose canonical dictionary value does not exist yet.

    A pre-existing option would defeat the point of the race and rollback tests, so
    availability is proven against PostgreSQL instead of assumed; an existing row is
    never deleted to make room for a test value. `candidates` is injectable so a
    test can present a known collision; the default source is collision-resistant.
    """
    for _ in range(attempts):
        measurements = candidates()
        _assert_valid_candidate(measurements)
        canonical = spec_service.canonical_dimensions(measurements)
        if _options_with_value(engine, definition, canonical):
            continue
        return AllocatedDimensions(measurements=measurements, canonical=canonical)
    raise DimensionAllocationError(
        f"no unused {DIMENSION_CODE} value was found in {attempts} attempts; the "
        "dictionary already holds every generated candidate"
    )


# ── Reading the dictionary and the associations ─────────────────────────────


def _options_with_value(
    bind: Engine | Session, definition: GpuDimensions, value: str
) -> list[int]:
    """Dictionary ids of `value` inside the GPU dimensions definition."""
    statement = (
        select(CharacteristicOption.id)
        .where(
            CharacteristicOption.characteristic_name_id == definition.characteristic_id,
            CharacteristicOption.value == value,
        )
        .order_by(CharacteristicOption.id)
    )
    if isinstance(bind, Session):
        return [int(option_id) for option_id in bind.scalars(statement).all()]
    with Session(bind) as session:
        return [int(option_id) for option_id in session.scalars(statement).all()]


def _dimension_associations(
    bind: Engine | Session, definition: GpuDimensions, product_ids: Sequence[int]
) -> set[tuple[int, int, int]]:
    """`(product, option, quantity)` dimension associations of these products."""
    statement = select(
        ProductCharacteristic.product_id,
        ProductCharacteristic.characteristic_option_id,
        ProductCharacteristic.quantity,
    ).where(
        ProductCharacteristic.product_id.in_(product_ids),
        ProductCharacteristic.characteristic_id == definition.characteristic_id,
    )
    if isinstance(bind, Session):
        rows = bind.execute(statement).all()
    else:
        with Session(bind) as session:
            rows = session.execute(statement).all()
    return {
        (int(product), int(option), int(quantity)) for product, option, quantity in rows
    }


def _assert_absent(engine: Engine, definition: GpuDimensions, value: str) -> None:
    """Prove that the intended test value is not already in the dictionary."""
    existing = _options_with_value(engine, definition, value)
    assert existing == [], (
        f"{value!r} already exists as dictionary option(s) {existing}; the test needs "
        "a value no other row uses"
    )


# ── Ownership tracking and verified cleanup ─────────────────────────────────


@dataclass()
class OwnedRecords:
    """Committed rows one test created, removed only after proving ownership.

    Cleanup deletes the associations and products of the tracked product ids, and a
    dictionary option only while all of the following hold: the row still exists, it
    belongs to the expected GPU dimensions definition, its value is the canonical
    value this test generated, and no product association references it. Everything
    else is reported and left in place.
    """

    engine: Engine
    definition: GpuDimensions
    product_ids: list[int] = field(default_factory=list)
    options: dict[int, str] = field(default_factory=dict)

    def create_products(self, count: int) -> list[int]:
        """Create `count` inactive GPU products and take ownership of them."""
        suffix = secrets.token_hex(6)
        created: list[int] = []
        with Session(self.engine) as session:
            product_type = session.scalar(
                select(ProductType)
                .join(Category, Category.id == ProductType.category_id)
                .where(Category.slug == "gpu")
                .order_by(ProductType.id)
            )
            manufacturer = session.scalar(
                select(Manufacturer).order_by(Manufacturer.id)
            )
            assert product_type is not None and manufacturer is not None, (
                "the isolated test database needs the seeded GPU product type and a "
                "manufacturer"
            )
            for index in range(count):
                product = Product(
                    product_type_id=product_type.id,
                    manufacturer_id=manufacturer.id,
                    slug=f"test-dimensions-{suffix}-{index}",
                    sku=f"DIM-{suffix}-{index}".upper(),
                    name=f"Dimensions probe {suffix} {index}",
                    description="Test-only item",
                    price="199.99",
                    stock_quantity=1,
                    on_sale=False,
                    is_active=False,
                )
                session.add(product)
                session.flush()
                created.append(int(product.id))
            session.commit()
        # Registered only once the rows are committed, so cleanup never targets an
        # id the database rejected.
        self.product_ids.extend(created)
        return created

    def create_option(self, canonical: str) -> int:
        """Insert one dictionary value this test conclusively created."""
        _assert_absent(self.engine, self.definition, canonical)
        with Session(self.engine) as session:
            option = CharacteristicOption(
                characteristic_name_id=self.definition.characteristic_id,
                value=canonical,
            )
            session.add(option)
            session.flush()
            option_id = int(option.id)
            session.commit()
        # Absent before the insert and inserted here: the row is test-owned.
        self.options[option_id] = canonical
        return option_id

    def associate(self, product_id: int, option_id: int, quantity: int = 1) -> None:
        with Session(self.engine) as session:
            session.add(
                ProductCharacteristic(
                    product_id=product_id,
                    characteristic_id=self.definition.characteristic_id,
                    characteristic_option_id=option_id,
                    quantity=quantity,
                )
            )
            session.commit()

    def cleanup(self) -> list[str]:
        """Remove the owned rows; return one message per record left in place."""
        problems: list[str] = []
        with Session(self.engine) as session:
            if self.product_ids:
                session.execute(
                    delete(ProductCharacteristic).where(
                        ProductCharacteristic.product_id.in_(self.product_ids)
                    )
                )
                session.execute(delete(Product).where(Product.id.in_(self.product_ids)))
            for option_id, canonical in sorted(self.options.items()):
                stored = session.execute(
                    select(
                        CharacteristicOption.characteristic_name_id,
                        CharacteristicOption.value,
                    ).where(CharacteristicOption.id == option_id)
                ).one_or_none()
                if stored is None:
                    # Already gone: a rolled-back write, or an earlier cleanup.
                    continue
                if (
                    int(stored[0]) != self.definition.characteristic_id
                    or stored[1] != canonical
                ):
                    problems.append(
                        f"option {option_id} is {stored[1]!r} of definition "
                        f"{stored[0]} instead of the tracked {canonical!r} of "
                        f"definition {self.definition.characteristic_id}; preserved"
                    )
                    continue
                references = session.scalar(
                    select(func.count())
                    .select_from(ProductCharacteristic)
                    .where(ProductCharacteristic.characteristic_option_id == option_id)
                )
                if references:
                    problems.append(
                        f"option {option_id} ({canonical}) is still referenced by "
                        f"{references} product association(s); preserved"
                    )
                    continue
                session.execute(
                    delete(CharacteristicOption).where(
                        CharacteristicOption.id == option_id
                    )
                )
            session.commit()
        return problems


@pytest.fixture()
def owned(test_engine: Engine) -> Iterator[OwnedRecords]:
    """Ownership scope of one test, cleaned up on success and on failure."""
    records = OwnedRecords(test_engine, _gpu_dimensions(test_engine))
    try:
        yield records
    finally:
        problems = records.cleanup()
        if problems:
            raise CleanupError("; ".join(problems))


@pytest.fixture()
def other_owner(test_engine: Engine, owned: OwnedRecords) -> Iterator[OwnedRecords]:
    """A second ownership scope, standing in for records another test created."""
    records = OwnedRecords(test_engine, owned.definition)
    try:
        yield records
    finally:
        problems = records.cleanup()
        if problems:
            raise CleanupError("; ".join(problems))


# ── Workers ─────────────────────────────────────────────────────────────────


def _submit_dimensions(
    engine: Engine,
    definition: GpuDimensions,
    product_id: int,
    measurements: MeasurementTriple,
    *,
    barrier: threading.Barrier | None = None,
    observed: dict[int, bool] | None = None,
) -> WriteOutcome:
    """Store one dimensions value for one product in its own transaction.

    `barrier` releases two callers into the dictionary insert at the same moment, so
    the PostgreSQL conflict handling is really exercised instead of being sequenced
    by the test. `observed` records, per product, whether the submission still had to
    create the dictionary value — the evidence that no worker found an existing
    option before reaching the insertion phase.
    """
    canonical = spec_service.canonical_dimensions(measurements)
    with Session(engine) as session:
        backend_pid = session.scalar(select(func.pg_backend_pid()))
        definitions, values = spec_service.validate_values(
            session,
            definition.category_id,
            [
                spec_service.CharacteristicSubmission(
                    code=DIMENSION_CODE, dimensions=measurements
                )
            ],
        )
        selected = values[DIMENSION_CODE][0]
        unresolved = selected.option_id == spec_service.UNRESOLVED_OPTION_ID
        if observed is not None:
            observed[product_id] = unresolved
        if not unresolved:
            raise AssertionError(
                f"product {product_id} resolved {canonical!r} to the existing option "
                f"{selected.option_id}: no insertion race would be tested"
            )
        if barrier is not None:
            barrier.wait(timeout=_BARRIER_TIMEOUT_SECONDS)
        spec_service.replace_values(session, product_id, definitions, values)
        session.commit()
        stored = spec_service.values_for_product(session, product_id)[DIMENSION_CODE][0]
    assert stored.value == canonical, (stored.value, canonical)
    assert backend_pid is not None
    return WriteOutcome(
        product_id=product_id,
        canonical=canonical,
        option_id=stored.option_id,
        quantity=stored.quantity,
        backend_pid=int(backend_pid),
    )


def _race(
    engine: Engine,
    definition: GpuDimensions,
    product_ids: Sequence[int],
    measurements: MeasurementTriple,
) -> tuple[list[WriteOutcome], list[Exception], dict[int, bool]]:
    """Run one writing worker per product and wait for all of them to finish.

    Every worker validates the submission first — proving it did not find an
    existing option — and only then passes the barrier into the dictionary insert.
    Failures are returned instead of raised so the caller can reconcile ownership,
    and thereby clean up, before propagating them.
    """
    if len(product_ids) != 2:  # pragma: no cover - the tests below race two writers
        raise ValueError("the race needs exactly two products")
    barrier = threading.Barrier(len(product_ids))
    observed: dict[int, bool] = {}
    outcomes: list[WriteOutcome] = []
    failures: list[Exception] = []
    pool = ThreadPoolExecutor(max_workers=len(product_ids))
    try:
        futures = [
            pool.submit(
                _submit_dimensions,
                engine,
                definition,
                product_id,
                measurements,
                barrier=barrier,
                observed=observed,
            )
            for product_id in product_ids
        ]
        for future in futures:
            try:
                outcomes.append(future.result(timeout=_WORKER_TIMEOUT_SECONDS))
            except Exception as failure:
                failures.append(failure)
    finally:
        # Bounded: every worker leaves its session before any cleanup can run.
        pool.shutdown(wait=True)
    return outcomes, failures, observed


def _track_persisted_option(
    engine: Engine, definition: GpuDimensions, owned: OwnedRecords, value: str
) -> int | None:
    """Take ownership of the dictionary row `value` resolved to, if it persisted.

    The value was proven absent before the test wrote and only this test's writers
    use it, so a single persisted row is conclusively test-owned. Nothing is tracked
    when no write committed, and more than one row is reported as a failure of the
    production conflict handling instead of being guessed at.
    """
    stored = _options_with_value(engine, definition, value)
    assert len(stored) <= 1, (
        f"the conflict handling stored {len(stored)} dictionary rows for {value!r}: "
        f"{stored}"
    )
    if not stored:
        return None
    owned.options[stored[0]] = value
    return stored[0]


# ── The concurrency regression ───────────────────────────────────────────────


def test_concurrent_dimension_creation_converges_on_one_option(
    test_engine: Engine, owned: OwnedRecords
) -> None:
    """Two racing transactions store one dictionary value, not two."""
    definition = owned.definition
    first, second = owned.create_products(2)
    allocated = allocate_dimensions(test_engine, definition)
    _assert_absent(test_engine, definition, allocated.canonical)

    outcomes, failures, observed = _race(
        test_engine, definition, [first, second], allocated.measurements
    )
    # Ownership is reconciled before any failure is propagated, so a half-finished
    # race still leaves nothing behind.
    resolved = _track_persisted_option(
        test_engine, definition, owned, allocated.canonical
    )
    if failures:
        raise failures[0]

    assert observed == {first: True, second: True}, (
        "both workers must resolve the submission as a new, unresolved option; "
        f"observed {observed}"
    )
    assert len({outcome.backend_pid for outcome in outcomes}) == 2, (
        "the workers must run on independent database connections"
    )
    assert {outcome.canonical for outcome in outcomes} == {allocated.canonical}
    assert resolved is not None
    # Both writers resolved the same dictionary row...
    assert {outcome.option_id for outcome in outcomes} == {resolved}
    # ...with a quantity of one each...
    assert {outcome.quantity for outcome in outcomes} == {1}
    # ...and PostgreSQL really holds exactly that one option for the value.
    assert _options_with_value(test_engine, definition, allocated.canonical) == [
        resolved
    ]
    # Each product is associated with that one option.
    assert _dimension_associations(test_engine, definition, [first, second]) == {
        (first, resolved, 1),
        (second, resolved, 1),
    }


def test_equivalent_decimals_share_one_option_and_different_triples_do_not(
    test_engine: Engine, owned: OwnedRecords
) -> None:
    """Canonicalisation decides identity: `307.5` and `307.50` are one value."""
    definition = owned.definition
    allocated = allocate_dimensions(test_engine, definition)
    # The same magnitudes written with and without trailing zeros.
    trimmed = _respell(allocated.measurements, "0.1")
    padded = _respell(trimmed, "0.01")
    different = allocate_dimensions(test_engine, definition)

    canonical = spec_service.canonical_dimensions(trimmed)
    assert tuple(str(part) for part in padded) != tuple(str(part) for part in trimmed)
    assert spec_service.canonical_dimensions(padded) == canonical
    assert different.canonical != canonical
    _assert_absent(test_engine, definition, canonical)
    _assert_absent(test_engine, definition, different.canonical)

    products = owned.create_products(3)
    # Ownership is taken directly after every write, so a failure in a later step
    # cannot leave a committed dictionary row untracked.
    padded_outcome = _submit_dimensions(test_engine, definition, products[0], padded)
    resolved_shared = _track_persisted_option(test_engine, definition, owned, canonical)
    trimmed_outcome = _submit_dimensions(test_engine, definition, products[1], trimmed)
    different_outcome = _submit_dimensions(
        test_engine, definition, products[2], different.measurements
    )
    resolved_different = _track_persisted_option(
        test_engine, definition, owned, different.canonical
    )
    assert resolved_shared is not None and resolved_different is not None

    # Two spellings, one dictionary value and one option id.
    assert padded_outcome.option_id == trimmed_outcome.option_id
    assert padded_outcome.option_id == resolved_shared
    assert padded_outcome.quantity == trimmed_outcome.quantity == 1
    # A different triple stays a different value.
    assert different_outcome.option_id == resolved_different
    assert different_outcome.option_id != padded_outcome.option_id
    assert resolved_shared != resolved_different
    # The dictionary holds exactly the two values this test created.
    assert _options_with_value(test_engine, definition, canonical) == [resolved_shared]
    assert _options_with_value(test_engine, definition, different.canonical) == [
        resolved_different
    ]
    # Every product references the option of its own measurements.
    assert _dimension_associations(test_engine, definition, products) == {
        (products[0], resolved_shared, 1),
        (products[1], resolved_shared, 1),
        (products[2], resolved_different, 1),
    }


# ── The transaction regression ───────────────────────────────────────────────


def test_rolled_back_product_write_leaves_no_new_dimension_option(
    test_engine: Engine, owned: OwnedRecords
) -> None:
    """A new dictionary value exists only inside the transaction that created it."""
    definition = owned.definition
    allocated = allocate_dimensions(test_engine, definition)
    canonical = allocated.canonical
    # 1. The value does not exist before the test writes.
    _assert_absent(test_engine, definition, canonical)
    (product_id,) = owned.create_products(1)

    try:
        with Session(test_engine) as session:
            definitions, values = spec_service.validate_values(
                session,
                definition.category_id,
                [
                    spec_service.CharacteristicSubmission(
                        code=DIMENSION_CODE, dimensions=allocated.measurements
                    )
                ],
            )
            spec_service.replace_values(session, product_id, definitions, values)
            # 2./3. The option and its association exist inside the transaction.
            created = _options_with_value(session, definition, canonical)
            assert len(created) == 1, created
            assert _dimension_associations(session, definition, [product_id]) == {
                (product_id, created[0], 1)
            }
            # 4. The transaction is rolled back.
            session.rollback()

        # 5. A fresh independent session sees neither row.
        assert _options_with_value(test_engine, definition, canonical) == []
        assert _dimension_associations(test_engine, definition, [product_id]) == set()
    finally:
        # Checked only after the assertions above: if the rollback did not happen,
        # the option is still test-owned and cleanup removes it explicitly, without
        # hiding the original failure.
        remaining = _options_with_value(test_engine, definition, canonical)
        if len(remaining) == 1:
            owned.options[remaining[0]] = canonical


# ── Guards and cleanup regressions ──────────────────────────────────────────


def test_the_seeded_definition_uses_the_dimensions_editor(
    test_engine: Engine,
) -> None:
    """Guard: the probes above only make sense for a `dimensions` field."""
    definition = _gpu_dimensions(test_engine)
    with Session(test_engine) as session:
        definitions = {
            item.code: item
            for item in spec_service.definitions_for_category(
                session, definition.category_id
            )
        }
    assert definitions[DIMENSION_CODE].editor == spec_service.EDITOR_DIMENSIONS


def test_allocation_skips_a_dictionary_value_that_already_exists(
    test_engine: Engine, owned: OwnedRecords
) -> None:
    """A candidate that the dictionary already holds is never selected."""
    definition = owned.definition
    taken = _random_dimensions()
    taken_canonical = spec_service.canonical_dimensions(taken)
    taken_id = owned.create_option(taken_canonical)
    free = _random_dimensions()
    free_canonical = spec_service.canonical_dimensions(free)
    assert free_canonical != taken_canonical, "regenerate the second candidate"

    allocated = allocate_dimensions(
        test_engine, definition, candidates=_pending_candidates(taken, free)
    )

    assert allocated.canonical == free_canonical
    assert allocated.canonical != taken_canonical
    # The colliding candidate was skipped, not resolved: the existing row is intact
    # and is the only row for that value.
    assert _options_with_value(test_engine, definition, taken_canonical) == [taken_id]


def test_cleanup_preserves_a_dictionary_option_it_does_not_own(
    test_engine: Engine, owned: OwnedRecords, other_owner: OwnedRecords
) -> None:
    """Cleanup deletes tracked ids, never a value that merely matches."""
    definition = owned.definition
    canonical = spec_service.canonical_dimensions(_random_dimensions())
    retained_id = other_owner.create_option(canonical)

    assert owned.cleanup() == []

    assert _options_with_value(test_engine, definition, canonical) == [retained_id]
    # The owning scope can still remove it, so preservation was not a leak.
    assert other_owner.cleanup() == []
    assert _options_with_value(test_engine, definition, canonical) == []


def test_cleanup_refuses_to_delete_an_option_another_product_uses(
    test_engine: Engine, owned: OwnedRecords, other_owner: OwnedRecords
) -> None:
    """A still-referenced option is preserved and reported, never force-deleted."""
    definition = owned.definition
    canonical = spec_service.canonical_dimensions(_random_dimensions())
    option_id = owned.create_option(canonical)
    (foreign_product,) = other_owner.create_products(1)
    other_owner.associate(foreign_product, option_id)

    problems = owned.cleanup()

    assert problems, "cleanup must report the reference instead of deleting the option"
    assert any("still referenced" in problem for problem in problems), problems
    assert _options_with_value(test_engine, definition, canonical) == [option_id]
    assert _dimension_associations(test_engine, definition, [foreign_product]) == {
        (foreign_product, option_id, 1)
    }

    # Once the referencing owner is gone the option is unreferenced and removable.
    assert other_owner.cleanup() == []
    assert owned.cleanup() == []
    assert _options_with_value(test_engine, definition, canonical) == []


def test_cleanup_removes_test_owned_products_and_options(
    test_engine: Engine, owned: OwnedRecords
) -> None:
    """Owned products, their associations and an unreferenced option are removed."""
    definition = owned.definition
    canonical = spec_service.canonical_dimensions(_random_dimensions())
    option_id = owned.create_option(canonical)
    products = owned.create_products(2)
    for product_id in products:
        owned.associate(product_id, option_id)

    assert owned.cleanup() == []

    assert _options_with_value(test_engine, definition, canonical) == []
    assert _dimension_associations(test_engine, definition, products) == set()
    with Session(test_engine) as session:
        assert (
            session.scalars(select(Product.id).where(Product.id.in_(products))).all()
            == []
        )
