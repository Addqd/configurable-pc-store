"""Customer-facing characteristic rendering (no database required).

Catalog responses are built from the normalized `characteristics` /
`product_characteristics` data. Two properties matter and are covered here:

- every value is rendered as a readable string (unit appended once, lists joined,
  booleans localized) and never as raw JSON or a Python representation;
- names, units and the declared `sort_order` are preserved, and display-only
  internal identifiers never reach the customer response.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from app.models import Category, Manufacturer, Product, ProductType
from app.schemas.catalog import ProductDetailOut, ProductSummaryOut
from app.services import catalog as catalog_service
from app.services import spec_service
from app.services.spec_service import CharacteristicDefinition

GPU = Category(id=1, slug="gpu", name="Видеокарты", sort_order=1)
MANUFACTURER = Manufacturer(id=3, slug="msi", name="MSI")
TIMESTAMP = datetime(2026, 1, 1, tzinfo=UTC)


def _definition(
    code: str,
    name: str,
    data_type: str,
    *,
    unit: str | None = None,
    sort_order: int = 0,
    show_in_short: bool = True,
    show_in_details: bool = True,
    is_required: bool = False,
) -> CharacteristicDefinition:
    return CharacteristicDefinition(
        id=sort_order + 1,
        category_id=1,
        code=code,
        name=name,
        data_type=data_type,
        unit=unit,
        sort_order=sort_order,
        is_required=is_required,
        show_in_short=show_in_short,
        show_in_details=show_in_details,
    )


def _product() -> Product:
    category = Category(id=1, slug="gpu", name="Видеокарты", sort_order=1)
    product_type = ProductType(
        id=2,
        category_id=1,
        slug="gpu-discrete",
        name="Дискретные",
        category=category,
    )
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
        on_sale=False,
        is_active=True,
        listed_at=date(2026, 1, 1),
        created_at=TIMESTAMP,
        updated_at=TIMESTAMP,
        product_type=product_type,
        manufacturer=MANUFACTURER,
        images=[],
    )


# ── Deterministic formatting ────────────────────────────────────────────────


def test_numbers_keep_their_precision_and_get_their_unit_once() -> None:
    definition = _definition("length_mm", "Длина", "number", unit="мм")
    assert spec_service.format_value(definition, 307) == "307 мм"
    assert spec_service.format_value(definition, 269.1) == "269.1 мм"
    assert spec_service.format_value(definition, 3.0) == "3 мм"
    assert spec_service.format_value(definition, 0) == "0 мм"
    # No scientific notation, no Python float artefacts.
    assert "e" not in spec_service.format_number(7450.0).lower()
    assert spec_service.format_number(0.1 + 0.2) == "0.3"


def test_booleans_are_localized_and_never_rendered_as_json() -> None:
    definition = _definition("ecc", "ECC память", "boolean")
    assert spec_service.format_value(definition, True) == "Да"
    assert spec_service.format_value(definition, False) == "Нет"


def test_lists_keep_order_and_duplicates() -> None:
    strings = _definition(
        "available_gpu_power_connectors", "Разъёмы питания GPU", "string_list"
    )
    numbers = _definition("dimensions_mm", "Габариты", "number_list", unit="мм")
    assert (
        spec_service.format_value(strings, ["pcie-8pin", "pcie-8pin", "pcie-16pin"])
        == "pcie-8pin, pcie-8pin, pcie-16pin"
    )
    assert spec_service.format_value(numbers, [307.0, 125.0, 46.0]) == "307, 125, 46 мм"
    assert spec_service.format_value(strings, []) == ""


# ── Selection and ordering ──────────────────────────────────────────────────


def _definitions() -> list[CharacteristicDefinition]:
    return [
        _definition("vram_gb", "Объём видеопамяти", "number", unit="ГБ", sort_order=0),
        _definition(
            "length_mm",
            "Длина",
            "number",
            unit="мм",
            sort_order=1,
            show_in_short=False,
            show_in_details=True,
        ),
        _definition(
            "internal_note",
            "Внутренняя пометка",
            "string",
            sort_order=2,
            show_in_short=False,
            show_in_details=False,
        ),
        _definition(
            "required_power_connectors",
            "Разъёмы питания GPU",
            "string_list",
            sort_order=3,
        ),
    ]


def test_short_rows_use_only_show_in_short_in_sort_order() -> None:
    rows = spec_service.serialize_definitions(
        _definitions(),
        {
            "vram_gb": 12,
            "length_mm": 307,
            "internal_note": "не показывать",
            "required_power_connectors": ["pcie-16pin"],
        },
        short_only=True,
    )
    assert [row["code"] for row in rows] == ["vram_gb", "required_power_connectors"]
    assert [row["display_value"] for row in rows] == ["12 ГБ", "pcie-16pin"]


def test_detail_rows_skip_definitions_hidden_from_details() -> None:
    rows = spec_service.serialize_definitions(
        _definitions(),
        {
            "vram_gb": 12,
            "length_mm": 307,
            "internal_note": "не показывать",
        },
        details_only=True,
    )
    assert [row["code"] for row in rows] == ["vram_gb", "length_mm"]


def test_missing_values_are_skipped_instead_of_placeholdered() -> None:
    rows = spec_service.serialize_definitions(_definitions(), {"vram_gb": 12})
    assert [row["code"] for row in rows] == ["vram_gb"]
    assert all(row["display_value"] for row in rows)


def test_display_lines_are_short_rows_only() -> None:
    lines = spec_service.display_lines(
        _definitions(), {"vram_gb": 12, "length_mm": 307}
    )
    assert lines == ["12 ГБ"]


# ── Catalog serialization ───────────────────────────────────────────────────


def test_summary_and_detail_expose_normalized_characteristics() -> None:
    product = _product()
    values = {"vram_gb": 12, "length_mm": 307}
    summary = catalog_service._summary(product, (4.5, 2), _definitions(), values)
    assert isinstance(summary, ProductSummaryOut)
    assert [row.code for row in summary.short_characteristics] == ["vram_gb"]
    assert summary.short_characteristics[0].display_value == "12 ГБ"
    assert summary.short_characteristics[0].value == 12

    detail = catalog_service._detail(product, (4.5, 2), _definitions(), values)
    assert isinstance(detail, ProductDetailOut)
    # The detail response carries every stored value with its native type.
    assert {row.code: row.value for row in detail.characteristics} == values
    assert {row.code: row.display_value for row in detail.characteristics} == {
        "vram_gb": "12 ГБ",
        "length_mm": "307 мм",
    }
    assert "internal_note" not in detail.model_dump_json()


def test_detail_without_characteristics_is_still_serializable() -> None:
    detail = catalog_service._detail(_product(), (0.0, 0), [], {})
    assert detail.characteristics == []
    assert detail.slug == "gpu-test"
