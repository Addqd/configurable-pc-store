"""Unit tests for the bulk characteristic loaders used by the cart and catalog.

The helpers receive a session and a list of products; this module substitutes a
recording stand-in for the session so the *number of loads* and the mapping of
rows to products can be asserted without a PostgreSQL server. The real SQL is
covered by the database-backed API tests in `test_cart.py` / `test_catalog.py`.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.models import Characteristic
from app.services import catalog as catalog_service


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class RecordingSession:
    """Minimal session double that answers the two characteristic queries.

    `load_definitions` selects `(Characteristic, categories.slug)`, so the double
    recognizes that statement by its entity and answers with definition rows; the
    remaining statement is the product/value join.
    """

    def __init__(self, definitions, values):
        self.definitions = definitions
        self.values = values
        self.scalar_calls: list[object] = []
        self.execute_calls: list[object] = []

    def scalars(self, statement):
        self.scalar_calls.append(statement)
        return _Result(self.definitions)

    def execute(self, statement):
        self.execute_calls.append(statement)
        descriptions = getattr(statement, "column_descriptions", ())
        if descriptions and descriptions[0].get("entity") is Characteristic:
            return _Result(self.definitions)
        return _Result(self.values)


def _definition(
    category_id: int,
    code: str,
    *,
    name: str,
    category_slug: str | None = None,
    data_type: str = "string",
    unit: str | None = None,
    sort_order: int = 0,
    show_in_short: bool = True,
    definition_id: int | None = None,
):
    """A `(Characteristic, categories.slug)` row as `load_definitions` reads it."""
    return (
        SimpleNamespace(
            id=definition_id if definition_id is not None else sort_order + 1,
            category_id=category_id,
            code=code,
            name=name,
            data_type=data_type,
            unit=unit,
            sort_order=sort_order,
            is_required=False,
            show_in_short=show_in_short,
            show_in_details=True,
        ),
        category_slug or ("gpu" if category_id == 1 else "psu"),
    )


def _value(
    product_id: int, characteristic_id: int, code: str, option_id: int, value: str
):
    """One joined `product_characteristics` row as `load_values` reads it."""
    return (product_id, characteristic_id, 1, code, 0, option_id, value)


def _product(product_id: int, category_id: int):
    return SimpleNamespace(
        id=product_id,
        product_type=SimpleNamespace(category=SimpleNamespace(id=category_id)),
    )


def test_short_characteristics_use_one_definition_and_one_value_query() -> None:
    definitions = [
        _definition(1, "socket", name="Сокет", sort_order=0),
        _definition(1, "color", name="Цвет", sort_order=1, show_in_short=False),
        _definition(2, "wattage_w", name="Мощность", data_type="number", unit="Вт"),
    ]
    values = [
        _value(10, 1, "socket", 101, "AM5"),
        _value(10, 2, "color", 102, "Чёрный"),
        _value(11, 3, "wattage_w", 103, "850 Вт"),
    ]
    db = RecordingSession(definitions, values)
    products = [_product(10, 1), _product(11, 2)]

    rows = catalog_service.short_characteristics(db, products)

    assert len(db.scalar_calls) == 0
    assert len(db.execute_calls) == 2
    # Only `show_in_short` definitions are returned, per product category.
    assert [row.code for row in rows[10]] == ["socket"]
    assert [row.code for row in rows[11]] == ["wattage_w"]
    assert rows[10][0].display_value == "AM5"
    assert rows[11][0].display_value == "850 Вт"
    # The native value is preserved for the presentation layer.
    assert rows[11][0].value == 850
    # The explicit dictionary selection travels with the row.
    assert rows[11][0].options[0].option_id == 103


def test_short_display_lines_reuse_the_same_rows() -> None:
    definitions = [_definition(1, "socket", name="Сокет", sort_order=0)]
    db = RecordingSession(definitions, [_value(10, 1, "socket", 101, "AM5")])

    lines = catalog_service.short_display_lines(db, [_product(10, 1)])

    assert lines == {10: ["AM5"]}
    assert len(db.execute_calls) == 2


def test_no_products_means_no_queries() -> None:
    db = RecordingSession([], [])

    assert catalog_service.short_characteristics(db, []) == {}
    assert catalog_service.short_display_lines(db, []) == {}
    assert db.scalar_calls == []
    assert db.execute_calls == []
