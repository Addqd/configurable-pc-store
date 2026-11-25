"""Customer-facing characteristic rendering (no database required).

Catalog responses are built from the normalized `characteristics` /
`characteristic_options` / `product_characteristics` data. The properties covered
here are the ones a customer actually sees and the ones the presentation layer
depends on:

- the dictionary value is rendered as-is, so a unit that the value already carries
  is never appended a second time (`750 Вт`, not `750 Вт Вт`);
- repeated connectors keep their quantity (`PCIe 8-pin × 4`);
- GPU dimensions are presented as an ordered triple;
- names, units and the declared `sort_order` are preserved, and every row exposes
  its explicit option ids, quantities and native `value`.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal

from app.models import Category, Manufacturer, Product, ProductType
from app.schemas.catalog import ProductDetailOut, ProductSummaryOut
from app.services import catalog as catalog_service
from app.services import spec_service
from app.services.spec_service import CharacteristicDefinition, SelectedOption

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
    category_slug: str = "gpu",
) -> CharacteristicDefinition:
    return CharacteristicDefinition(
        id=sort_order + 1,
        category_id=1,
        category_slug=category_slug,
        code=code,
        name=name,
        data_type=data_type,
        unit=unit,
        sort_order=sort_order,
        is_required=is_required,
        show_in_short=show_in_short,
        show_in_details=show_in_details,
    )


def _selected(*rows: tuple[int, str, int]) -> tuple[SelectedOption, ...]:
    return tuple(
        SelectedOption(option_id=option_id, value=value, quantity=quantity)
        for option_id, value, quantity in rows
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


def test_a_unit_the_dictionary_already_carries_is_never_appended_again() -> None:
    length = _definition("length_mm", "Длина", "number", unit="мм")
    wattage = _definition("wattage_w", "Мощность", "number", unit="Вт")
    assert spec_service.display_value(length, _selected((1, "307 мм", 1))) == "307 мм"
    assert spec_service.display_value(wattage, _selected((2, "750 Вт", 1))) == "750 Вт"
    # A value that really lacks its unit still gets it appended exactly once.
    assert (
        spec_service.display_value(
            _definition("length_mm", "Длина", "number", unit="мм"),
            _selected((1, "307", 1)),
        )
        == "307 мм"
    )
    # Units written together with a multiplier are recognized as present.
    assert spec_service.append_unit("7200 об/мин", "об/мин") == "7200 об/мин"


def test_booleans_are_rendered_from_the_dictionary_value() -> None:
    definition = _definition("ecc_memory", "ECC память", "boolean")
    assert spec_service.display_value(definition, _selected((1, "Да", 1))) == "Да"
    assert spec_service.display_value(definition, _selected((2, "Нет", 1))) == "Нет"
    assert spec_service.structured_value(definition, _selected((2, "Нет", 1))) is False
    assert spec_service.structured_value(definition, _selected((1, "Да", 1))) is True
    # An unknown dictionary value is never coerced into `false`.
    assert spec_service.structured_value(definition, _selected((3, "—", 1))) is None


def test_repeated_connectors_render_their_quantity() -> None:
    definition = _definition(
        "available_gpu_power_connectors",
        "Разъёмы питания GPU",
        "string_list",
        category_slug="psu",
    )
    options = _selected((1, "PCIe 8-pin", 3), (2, "PCIe 16-pin", 1))
    assert (
        spec_service.display_value(definition, options) == "PCIe 8-pin × 3, PCIe 16-pin"
    )
    assert spec_service.structured_value(definition, options) == [
        "PCIe 8-pin",
        "PCIe 8-pin",
        "PCIe 8-pin",
        "PCIe 16-pin",
    ]
    # Quantities stay explicit, so a client never has to count a list.
    assert spec_service.serialize_options(options) == [
        {"option_id": 1, "value": "PCIe 8-pin", "quantity": 3},
        {"option_id": 2, "value": "PCIe 16-pin", "quantity": 1},
    ]


def test_gpu_dimensions_are_an_ordered_triple() -> None:
    definition = _definition("dimensions_mm", "Габариты", "number_list", unit="мм")
    options = _selected((1, "307 × 125 × 46 мм", 1))
    assert spec_service.structured_value(definition, options) == [307.0, 125.0, 46.0]
    assert spec_service.display_value(definition, options) == "307 × 125 × 46 мм"
    # The unit is part of the canonical value, so it is never doubled.
    assert spec_service.display_value(definition, options).count("мм") == 1


def test_numbers_are_structured_without_float_noise() -> None:
    definition = _definition("cores", "Количество ядер", "number")
    assert spec_service.structured_value(definition, _selected((1, "6 ядер", 1))) == 6
    clock = _definition("base_clock_ghz", "Базовая частота", "number", unit="ГГц")
    assert spec_service.structured_value(clock, _selected((1, "3.2 ГГц", 1))) == 3.2
    # Text that carries no magnitude keeps its dictionary text.
    latency = _definition("cas_latency", "CAS Latency", "number", category_slug="ram")
    assert spec_service.structured_value(latency, _selected((1, "CL30", 1))) == "CL30"


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


def _values() -> dict[str, tuple[SelectedOption, ...]]:
    return {
        "vram_gb": _selected((1, "12 ГБ", 1)),
        "length_mm": _selected((2, "307 мм", 1)),
        "internal_note": _selected((3, "не показывать", 1)),
        "required_power_connectors": _selected((4, "PCIe 16-pin", 1)),
    }


def test_short_rows_use_only_show_in_short_in_sort_order() -> None:
    rows = spec_service.serialize_definitions(
        _definitions(), _values(), short_only=True
    )
    assert [row["code"] for row in rows] == ["vram_gb", "required_power_connectors"]
    assert [row["display_value"] for row in rows] == ["12 ГБ", "PCIe 16-pin"]


def test_detail_rows_skip_definitions_hidden_from_details() -> None:
    rows = spec_service.serialize_definitions(
        _definitions(), _values(), details_only=True
    )
    assert [row["code"] for row in rows] == [
        "vram_gb",
        "length_mm",
        "required_power_connectors",
    ]


def test_missing_values_are_skipped_instead_of_placeholdered() -> None:
    rows = spec_service.serialize_definitions(
        _definitions(), {"vram_gb": _selected((1, "12 ГБ", 1))}
    )
    assert [row["code"] for row in rows] == ["vram_gb"]
    assert all(row["display_value"] for row in rows)


def test_display_lines_are_short_rows_only() -> None:
    lines = spec_service.display_lines(
        _definitions(),
        {
            "vram_gb": _selected((1, "12 ГБ", 1)),
            "length_mm": _selected((2, "307 мм", 1)),
        },
    )
    assert lines == ["12 ГБ"]


# ── Catalog serialization ───────────────────────────────────────────────────


def test_summary_and_detail_expose_normalized_characteristics() -> None:
    product = _product()
    values = {
        "vram_gb": _selected((1, "12 ГБ", 1)),
        "length_mm": _selected((2, "307 мм", 1)),
    }
    summary = catalog_service._summary(product, (4.5, 2), _definitions(), values)
    assert isinstance(summary, ProductSummaryOut)
    assert [row.code for row in summary.short_characteristics] == ["vram_gb"]
    assert summary.short_characteristics[0].display_value == "12 ГБ"
    assert summary.short_characteristics[0].value == 12
    assert summary.short_characteristics[0].options[0].option_id == 1
    assert summary.short_characteristics[0].options[0].quantity == 1

    detail = catalog_service._detail(product, (4.5, 2), _definitions(), values)
    assert isinstance(detail, ProductDetailOut)
    # The detail response carries every stored value with its native shape.
    assert {row.code: row.value for row in detail.characteristics} == {
        "vram_gb": 12,
        "length_mm": 307,
    }
    assert {row.code: row.display_value for row in detail.characteristics} == {
        "vram_gb": "12 ГБ",
        "length_mm": "307 мм",
    }
    assert "internal_note" not in detail.model_dump_json()
    # Internal identifiers never reach the customer response.
    assert "option_id" in detail.model_dump_json()
    assert "characteristic_option_id" not in detail.model_dump_json()


def test_detail_without_characteristics_is_still_serializable() -> None:
    detail = catalog_service._detail(_product(), (0.0, 0), [], {})
    assert detail.characteristics == []
    assert detail.slug == "gpu-test"
