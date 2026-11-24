"""Unit tests for the bulk characteristic loaders used by the cart and catalog.

The helpers receive a session and a list of products; this module substitutes a
recording stand-in for the session so the *number of loads* and the mapping of
rows to products can be asserted without a PostgreSQL server. The real SQL is
covered by the database-backed API tests in `test_cart.py` / `test_catalog.py`.
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services import catalog as catalog_service


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _ExecutionResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class RecordingSession:
    """Minimal session double that answers the two characteristic queries."""

    def __init__(self, definitions, values):
        self.definitions = definitions
        self.values = values
        self.scalar_calls: list[object] = []
        self.execute_calls: list[object] = []

    def scalars(self, statement):
        self.scalar_calls.append(statement)
        return _ScalarsResult(self.definitions)

    def execute(self, statement):
        self.execute_calls.append(statement)
        return _ExecutionResult(self.values)


def _definition(
    category_id: int,
    code: str,
    *,
    name: str,
    data_type: str = "string",
    unit: str | None = None,
    sort_order: int = 0,
    show_in_short: bool = True,
    definition_id: int | None = None,
):
    return SimpleNamespace(
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
    )


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
    values = [(10, "socket", "am5"), (10, "color", "Чёрный"), (11, "wattage_w", 850)]
    db = RecordingSession(definitions, values)
    products = [_product(10, 1), _product(11, 2)]

    rows = catalog_service.short_characteristics(db, products)

    assert len(db.scalar_calls) == 1
    assert len(db.execute_calls) == 1
    # Only `show_in_short` definitions are returned, per product category.
    assert [row.code for row in rows[10]] == ["socket"]
    assert [row.code for row in rows[11]] == ["wattage_w"]
    assert rows[10][0].display_value == "am5"
    assert rows[11][0].display_value == "850 Вт"
    # The native JSON value is preserved for the presentation layer.
    assert rows[11][0].value == 850


def test_short_display_lines_reuse_the_same_rows() -> None:
    definitions = [_definition(1, "socket", name="Сокет", sort_order=0)]
    db = RecordingSession(definitions, [(10, "socket", "am5")])

    lines = catalog_service.short_display_lines(db, [_product(10, 1)])

    assert lines == {10: ["am5"]}
    assert len(db.scalar_calls) == 1
    assert len(db.execute_calls) == 1


def test_no_products_means_no_queries() -> None:
    db = RecordingSession([], [])

    assert catalog_service.short_characteristics(db, []) == {}
    assert catalog_service.short_display_lines(db, []) == {}
    assert db.scalar_calls == []
    assert db.execute_calls == []
