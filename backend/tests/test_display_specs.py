"""Customer-facing display specifications (no database required).

`display_specs` is imported presentation data; `technical_specs` stays the
compatibility engine's input and must not leak into the customer response.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from app.models import Category, Manufacturer, Product, ProductType
from app.schemas.catalog import ProductDetailOut
from app.services import catalog as catalog_service
from app.services.catalog import serialize_display_specs


def _product(display_specs: Any) -> Product:
    category = Category(id=1, slug="gpu", name="Видеокарты", sort_order=1)
    product_type = ProductType(
        id=2,
        category_id=1,
        slug="gpu-discrete",
        name="Дискретные",
        category=category,
    )
    manufacturer = Manufacturer(id=3, slug="msi", name="MSI")
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    return Product(
        id=10,
        product_type_id=2,
        manufacturer_id=3,
        slug="gpu-test",
        sku="SKU-10",
        name="Тестовая видеокарта",
        description="Импортированное описание",
        price=Decimal("199.99"),
        stock_quantity=4,
        spec_lines=["12 ГБ GDDR6X"],
        short_specs=["12 ГБ"],
        technical_specs={"length_mm": 300, "socket": "AM5"},
        display_specs=display_specs,
        on_sale=False,
        is_active=True,
        listed_at=date(2026, 1, 1),
        created_at=timestamp,
        updated_at=timestamp,
        product_type=product_type,
        manufacturer=manufacturer,
        images=[],
    )


def test_display_specs_keep_imported_order_and_hide_evidence() -> None:
    raw = [
        {
            "label": "Объём видеопамяти",
            "value": "12 ГБ",
            "evidence": {"source": "vendor"},
        },
        {"label": "Разрядность шины", "value": "192 бит"},
    ]
    detail = catalog_service._detail(_product(raw), (4.5, 2))
    assert isinstance(detail, ProductDetailOut)
    assert [spec.model_dump() for spec in detail.display_specs] == [
        {"label": "Объём видеопамяти", "value": "12 ГБ"},
        {"label": "Разрядность шины", "value": "192 бит"},
    ]
    # `evidence` must not appear anywhere in the serialized detail response.
    assert "evidence" not in detail.model_dump_json()
    # The compatibility engine's object is preserved untouched.
    assert detail.technical_specs == {"length_mm": 300, "socket": "AM5"}


def test_display_specs_empty_array_is_safe() -> None:
    detail = catalog_service._detail(_product([]), (0.0, 0))
    assert detail.display_specs == []
    assert detail.technical_specs == {"length_mm": 300, "socket": "AM5"}


def test_display_specs_skip_malformed_entries() -> None:
    raw: list[Any] = [
        "not-an-object",
        {"value": "без подписи"},
        {"label": 42, "value": "числовая подпись"},
        {"label": "   ", "value": "пустая подпись"},
        {"label": "Без значения"},
        {"label": "Пустое значение", "value": "   "},
        {"label": "Вложенное значение", "value": {"nested": True}},
        {"label": "Сокет", "value": "AM5"},
    ]
    assert [spec.model_dump() for spec in serialize_display_specs(raw)] == [
        {"label": "Сокет", "value": "AM5"}
    ]


def test_display_specs_non_list_value_is_treated_as_empty() -> None:
    assert serialize_display_specs(None) == []
    assert serialize_display_specs({"label": "Сокет", "value": "AM5"}) == []
