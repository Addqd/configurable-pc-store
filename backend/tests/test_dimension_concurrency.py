"""Concurrency and transaction boundaries of the dimension dictionary (PostgreSQL).

The GPU `dimensions_mm` field is the only characteristic whose dictionary value is
created by the backend, so it is the only place where two administrators can race
on the same insert. `spec_service.ensure_option()` relies on PostgreSQL conflict
handling (`ON CONFLICT DO NOTHING` + re-read) instead of application locking; that
guarantee cannot be observed with mocks or with two operations of one session, so
these tests use two **independent sessions on independent connections** against the
isolated test database.

Everything they create is confined to that isolated database (a URL whose name is
`test_*`/`*_test`, guarded by `conftest.test_engine`) and is deleted again in a
`finally` block: associations first, then the probe products, then the dictionary
values this module introduced.
"""

from __future__ import annotations

import threading
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from secrets import token_hex

from sqlalchemy import delete, select
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


class GpuDimensions:
    """The seeded GPU dimensions definition the probes submit against."""

    def __init__(self, characteristic_id: int, category_id: int) -> None:
        self.characteristic_id = characteristic_id
        self.category_id = category_id


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


def _probe_products(engine: Engine, count: int) -> list[int]:
    """Create `count` inactive products of the GPU category for the probes."""
    suffix = token_hex(6)
    created: list[int] = []
    with Session(engine) as session:
        product_type = session.scalar(
            select(ProductType)
            .join(Category, Category.id == ProductType.category_id)
            .where(Category.slug == "gpu")
            .order_by(ProductType.id)
        )
        manufacturer = session.scalar(select(Manufacturer).order_by(Manufacturer.id))
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
            created.append(product.id)
        session.commit()
    return created


def _cleanup(
    engine: Engine,
    definition: GpuDimensions,
    product_ids: list[int],
    values: set[str],
) -> None:
    """Remove every row these probes created, associations first."""
    with Session(engine) as session:
        if product_ids:
            session.execute(
                delete(ProductCharacteristic).where(
                    ProductCharacteristic.product_id.in_(product_ids)
                )
            )
            session.execute(delete(Product).where(Product.id.in_(product_ids)))
        if values:
            session.execute(
                delete(CharacteristicOption).where(
                    CharacteristicOption.characteristic_name_id
                    == definition.characteristic_id,
                    CharacteristicOption.value.in_(values),
                )
            )
        session.commit()


def _submit_dimensions(
    engine: Engine,
    definition: GpuDimensions,
    product_id: int,
    measurements: tuple[Decimal, Decimal, Decimal],
    barrier: threading.Barrier | None = None,
) -> int:
    """Write one dimensions value to one product in its own transaction.

    `barrier` lets two callers reach the dictionary insert at the same moment, so
    the conflict handling is really exercised instead of sequenced by SQL.
    """
    with Session(engine) as session:
        definitions, values = spec_service.validate_values(
            session,
            definition.category_id,
            [
                spec_service.CharacteristicSubmission(
                    code=DIMENSION_CODE, dimensions=measurements
                )
            ],
        )
        if barrier is not None:
            barrier.wait(timeout=60)
        spec_service.replace_values(session, product_id, definitions, values)
        session.commit()
        stored = spec_service.values_for_product(session, product_id)[DIMENSION_CODE]
    return stored[0].option_id


def _options_with_value(
    engine: Engine, definition: GpuDimensions, value: str
) -> list[int]:
    with Session(engine) as session:
        return list(
            session.scalars(
                select(CharacteristicOption.id).where(
                    CharacteristicOption.characteristic_name_id
                    == definition.characteristic_id,
                    CharacteristicOption.value == value,
                )
            ).all()
        )


def _associations_of(session: Session, product_id: int) -> set[int]:
    return set(
        session.scalars(
            select(ProductCharacteristic.characteristic_option_id).where(
                ProductCharacteristic.product_id == product_id
            )
        ).all()
    )


def _associations(engine: Engine, product_ids: list[int]) -> set[tuple[int, int]]:
    with Session(engine) as session:
        return {
            (int(product_id), int(option_id))
            for product_id, option_id in session.execute(
                select(
                    ProductCharacteristic.product_id,
                    ProductCharacteristic.characteristic_option_id,
                ).where(ProductCharacteristic.product_id.in_(product_ids))
            ).all()
        }


# ── The concurrency regression ───────────────────────────────────────────────


def test_concurrent_dimension_creation_converges_on_one_option(
    test_engine: Engine,
) -> None:
    """Two racing transactions store one dictionary value, not two."""
    definition = _gpu_dimensions(test_engine)
    measurements = (Decimal("912.34"), Decimal("111.11"), Decimal("22.22"))
    canonical = spec_service.canonical_dimensions(measurements)
    products = _probe_products(test_engine, 2)
    try:
        barrier = threading.Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [
                pool.submit(
                    _submit_dimensions,
                    test_engine,
                    definition,
                    product_id,
                    measurements,
                    barrier,
                )
                for product_id in products
            ]
            resolved = [future.result(timeout=120) for future in futures]

        # Both writers resolved the same dictionary row...
        assert resolved[0] == resolved[1], resolved
        # ...and PostgreSQL really holds exactly one option for that value.
        stored = _options_with_value(test_engine, definition, canonical)
        assert stored == [resolved[0]]
        # Each product is associated with that one option.
        assert _associations(test_engine, products) == {
            (product_id, resolved[0]) for product_id in products
        }
    finally:
        _cleanup(test_engine, definition, products, {canonical})


def test_equivalent_decimals_share_one_option_and_different_triples_do_not(
    test_engine: Engine,
) -> None:
    """Canonicalisation decides identity: `307.50` and `307.5` are one value."""
    definition = _gpu_dimensions(test_engine)
    padded = (Decimal("913.50"), Decimal("126.0"), Decimal("47.00"))
    trimmed = (Decimal("913.5"), Decimal(126), Decimal(47))
    other = (Decimal(914), Decimal(126), Decimal(47))
    values = {
        spec_service.canonical_dimensions(padded),
        spec_service.canonical_dimensions(trimmed),
        spec_service.canonical_dimensions(other),
    }
    products = _probe_products(test_engine, 3)
    try:
        same_padded = _submit_dimensions(test_engine, definition, products[0], padded)
        same_trimmed = _submit_dimensions(test_engine, definition, products[1], trimmed)
        different = _submit_dimensions(test_engine, definition, products[2], other)

        assert same_padded == same_trimmed
        assert different != same_padded
        canonical = spec_service.canonical_dimensions(padded)
        assert _options_with_value(test_engine, definition, canonical) == [same_padded]
        assert _options_with_value(
            test_engine, definition, spec_service.canonical_dimensions(other)
        ) == [different]
        # The dictionary values are the canonical texts, never a submitted spelling.
        assert canonical == "913.5 × 126 × 47 мм"
        assert len(values) == 2
    finally:
        _cleanup(test_engine, definition, products, values)


# ── The transaction regression ───────────────────────────────────────────────


def test_rolled_back_product_write_leaves_no_new_dimension_option(
    test_engine: Engine,
) -> None:
    """A new dictionary value exists only inside the transaction that created it."""
    definition = _gpu_dimensions(test_engine)
    measurements = (Decimal("915.25"), Decimal("127.75"), Decimal("48.25"))
    canonical = spec_service.canonical_dimensions(measurements)
    products = _probe_products(test_engine, 1)
    try:
        with Session(test_engine) as session:
            definitions, values = spec_service.validate_values(
                session,
                definition.category_id,
                [
                    spec_service.CharacteristicSubmission(
                        code=DIMENSION_CODE, dimensions=measurements
                    )
                ],
            )
            spec_service.replace_values(session, products[0], definitions, values)
            # The value and its association are visible to the writing transaction.
            created = session.scalar(
                select(CharacteristicOption.id).where(
                    CharacteristicOption.characteristic_name_id
                    == definition.characteristic_id,
                    CharacteristicOption.value == canonical,
                )
            )
            assert created is not None
            assert _associations_of(session, products[0]) == {created}
            session.rollback()

        # A failed product write must not leave the dictionary row behind.
        assert _options_with_value(test_engine, definition, canonical) == []
        assert _associations(test_engine, products) == set()
    finally:
        _cleanup(test_engine, definition, products, {canonical})


def test_the_seeded_definition_uses_the_dimensions_editor(test_engine: Engine) -> None:
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
