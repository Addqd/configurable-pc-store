"""Editable numeric characteristics: policy, formatting and validation.

No database is required here. The service-level rules of the numeric editor are
covered directly, so the allowlist, the per-field limits, the canonical wording
and the reuse of an equivalent dictionary value stay verifiable without
PostgreSQL. The API/transaction paths live in
`test_numeric_characteristics_api.py`.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services import numeric_spec, spec_service
from app.services.errors import InvalidInputError
from app.services.spec_service import (
    CharacteristicDefinition,
    CharacteristicSubmission,
    DictionaryOption,
    OptionSelection,
    SelectedOption,
)

# The complete allowlist, repeated here on purpose: the test states the approved
# 52 definitions independently of the production table.
ALLOWLIST: dict[str, tuple[str, ...]] = {
    "cpu": (
        "cores",
        "threads",
        "base_clock_ghz",
        "max_clock_ghz",
        "cache_l1_kb",
        "cache_l2_mb",
        "cache_l3_mb",
        "thermal_design_power_w",
        "max_temperature_c",
        "supported_ram_speed_mhz",
        "integrated_gpu_cores",
        "integrated_gpu_clock_mhz",
        "performance_cores",
        "efficiency_cores",
        "cache_smart_mb",
        "processor_base_power_w",
        "maximum_turbo_power_w",
    ),
    "gpu": (
        "cuda_cores",
        "vram_gb",
        "memory_speed_gbps",
        "boost_clock_mhz",
        "extreme_clock_mhz",
        "max_power_draw_w",
        "recommended_psu_w",
        "weight_g",
        "length_mm",
        "thickness_slots",
    ),
    "mobo": ("max_memory_gb",),
    "ram": ("frequency_mhz", "cas_latency", "module_size_gb", "capacity_gb"),
    "storage": (
        "read_speed_mb_s",
        "write_speed_mb_s",
        "dram_cache_gb",
        "capacity_gb",
    ),
    "hdd": ("rpm", "cache_mb", "capacity_gb"),
    "psu": ("wattage_w", "length_mm"),
    "monitor": ("diagonal_inch", "refresh_rate_hz", "response_time_ms"),
    "peripheral": ("sensor_dpi", "driver_diameter_mm"),
    "prebuilt": (
        "cores",
        "threads",
        "base_clock_ghz",
        "max_clock_ghz",
        "ram_capacity_gb",
        "storage_capacity_gb",
    ),
}

# The approved fixed dropdowns: scalar numbers, but never editable.
FIXED_FIELDS: tuple[tuple[str, str], ...] = (
    ("case", "front_fan_count"),
    ("case", "front_fan_size_mm"),
    ("cooling", "fan_count"),
    ("cooling", "fan_size_mm"),
    ("cooling", "radiator_size_mm"),
    ("cpu", "memory_channels"),
    ("gpu", "memory_bus_bits"),
    ("gpu", "max_monitors"),
    ("mobo", "ram_slots"),
    ("ram", "module_count"),
    ("storage", "length_mm"),
)


def _definition(
    code: str,
    category_slug: str,
    data_type: str = "number",
    *,
    unit: str | None = None,
    is_required: bool = False,
    definition_id: int = 1,
) -> CharacteristicDefinition:
    return CharacteristicDefinition(
        id=definition_id,
        category_id=1,
        category_slug=category_slug,
        code=code,
        name=code,
        data_type=data_type,
        unit=unit,
        sort_order=0,
        is_required=is_required,
        show_in_short=False,
        show_in_details=True,
    )


def _dictionary(
    definition: CharacteristicDefinition, *values: str
) -> dict[int, list[DictionaryOption]]:
    return {
        definition.id: [
            DictionaryOption(
                id=500 + definition.id * 10 + index,
                characteristic_id=definition.id,
                value=value,
            )
            for index, value in enumerate(values)
        ]
    }


def _numeric_submission(code: str, value: object) -> CharacteristicSubmission:
    return CharacteristicSubmission(code=code, numeric_value=value)  # type: ignore[arg-type]


def _submit(
    definition: CharacteristicDefinition,
    submission: CharacteristicSubmission,
    dictionary: dict[int, list[DictionaryOption]],
) -> spec_service.Values:
    return spec_service.submitted_values([definition], [submission], dictionary)


# ── Policy scope ────────────────────────────────────────────────────────────


def test_allowlist_holds_exactly_the_approved_52_definitions() -> None:
    assert len(numeric_spec.NUMERIC_FIELDS) == 52
    expected = {
        (category, code) for category, codes in ALLOWLIST.items() for code in codes
    }
    assert set(numeric_spec.NUMERIC_FIELDS) == expected
    assert sum(len(codes) for codes in ALLOWLIST.values()) == 52
    # Every entry declares a usable validation policy.
    for policy in numeric_spec.NUMERIC_FIELDS.values():
        assert policy.max_value > 0
        assert policy.decimal_places >= 0
        assert policy.style in numeric_spec.STYLES
        if policy.style == numeric_spec.STYLE_SUFFIX:
            assert policy.affix or policy.plural
        else:
            assert policy.affix


def test_exactly_11_scalar_numeric_definitions_stay_fixed() -> None:
    assert len(FIXED_FIELDS) == 11
    for category_slug, code in FIXED_FIELDS:
        assert not numeric_spec.is_numeric_field(category_slug, code)
        assert (
            spec_service.editor_for(category_slug, code, "number")
            == spec_service.EDITOR_SELECT
        )


@pytest.mark.parametrize(
    ("category_slug", "code", "editor"),
    [
        # Editable: allowlisted scalar numbers.
        ("cpu", "cores", spec_service.EDITOR_NUMERIC),
        ("cpu", "base_clock_ghz", spec_service.EDITOR_NUMERIC),
        ("gpu", "length_mm", spec_service.EDITOR_NUMERIC),
        ("gpu", "thickness_slots", spec_service.EDITOR_NUMERIC),
        ("ram", "cas_latency", spec_service.EDITOR_NUMERIC),
        ("monitor", "diagonal_inch", spec_service.EDITOR_NUMERIC),
        ("prebuilt", "storage_capacity_gb", spec_service.EDITOR_NUMERIC),
        # Fixed: the same code in another category is not editable.
        ("storage", "length_mm", spec_service.EDITOR_SELECT),
        ("case", "cores", spec_service.EDITOR_SELECT),
        # A number that is not on the allowlist stays a dropdown.
        ("mobo", "ram_slots", spec_service.EDITOR_SELECT),
        # The dimension triple is untouched by the numeric policy.
        ("gpu", "dimensions_mm", spec_service.EDITOR_DIMENSIONS),
        # Other data types are never numeric.
        ("gpu", "length_mm_note", spec_service.EDITOR_SELECT),
    ],
)
def test_editor_is_derived_from_the_category_scoped_policy(
    category_slug: str, code: str, editor: str
) -> None:
    data_type = "number_list" if code == "dimensions_mm" else "number"
    if code == "length_mm_note":
        data_type = "string"
    assert spec_service.editor_for(category_slug, code, data_type) == editor


def test_data_type_alone_never_makes_a_field_editable() -> None:
    """`number` is not the criterion: the category-scoped policy is."""
    assert spec_service.editor_for("mobo", "max_memory_gb", "number") == (
        spec_service.EDITOR_NUMERIC
    )
    for category_slug, code in FIXED_FIELDS:
        assert (
            spec_service.editor_for(category_slug, code, "number")
            != spec_service.EDITOR_NUMERIC
        )


# ── Canonical wording ───────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("category_slug", "code", "number", "expected"),
    [
        ("psu", "wattage_w", "750", "750 Вт"),
        ("cpu", "base_clock_ghz", "3.40", "3.4 ГГц"),
        ("ram", "capacity_gb", "32", "32 ГБ"),
        ("cpu", "cores", "6", "6 ядер"),
        ("cpu", "threads", "12", "12 потоков"),
        ("ram", "cas_latency", "36", "CL36"),
        ("monitor", "diagonal_inch", "27", "27″"),
        ("gpu", "thickness_slots", "3.25", "3.25 слота"),
        ("hdd", "rpm", "5400", "5400 об/мин"),
        ("cpu", "max_temperature_c", "95", "95 °C"),
        ("gpu", "memory_speed_gbps", "19.5", "19.5 Гбит/с"),
        ("storage", "read_speed_mb_s", "7300", "7300 МБ/с"),
        ("monitor", "response_time_ms", "0.03", "0.03 мс"),
        ("peripheral", "sensor_dpi", "12000", "12000 DPI"),
        ("gpu", "weight_g", "972", "972 г"),
        ("gpu", "length_mm", "269.10", "269.1 мм"),
        ("mobo", "max_memory_gb", "128", "128 ГБ"),
        ("storage", "dram_cache_gb", "0.5", "0.5 ГБ"),
        ("cpu", "cache_l1_kb", "1024", "1024 КБ"),
        ("hdd", "cache_mb", "256", "256 МБ"),
        ("monitor", "refresh_rate_hz", "144", "144 Гц"),
        ("peripheral", "driver_diameter_mm", "53", "53 мм"),
        ("prebuilt", "ram_capacity_gb", "128", "128 ГБ"),
        ("prebuilt", "storage_capacity_gb", "4096", "4096 ГБ"),
    ],
)
def test_canonical_wording_matches_the_restored_dictionary(
    category_slug: str, code: str, number: str, expected: str
) -> None:
    policy = numeric_spec.numeric_policy(category_slug, code)
    assert policy is not None
    validated = numeric_spec.validate_numeric_value(policy, number)
    assert numeric_spec.format_numeric_value(policy, validated) == expected


@pytest.mark.parametrize(
    ("number", "word"),
    [
        (Decimal(1), "ядро"),
        (Decimal(2), "ядра"),
        (Decimal(4), "ядра"),
        (Decimal(5), "ядер"),
        (Decimal(11), "ядер"),
        (Decimal(12), "ядер"),
        (Decimal(14), "ядер"),
        (Decimal(21), "ядро"),
        (Decimal(22), "ядра"),
        (Decimal(24), "ядра"),
        (Decimal(101), "ядро"),
        (Decimal(111), "ядер"),
    ],
)
def test_russian_count_words(number: Decimal, word: str) -> None:
    assert numeric_spec.plural_word(numeric_spec.CORES, number) == word


@pytest.mark.parametrize(
    ("number", "expected"),
    [
        ("1", "1 слот"),
        ("2", "2 слота"),
        ("4", "4 слота"),
        ("5", "5 слотов"),
        ("2.5", "2.5 слота"),
        ("3.25", "3.25 слота"),
    ],
)
def test_fractional_and_integral_slot_wording(number: str, expected: str) -> None:
    policy = numeric_spec.numeric_policy("gpu", "thickness_slots")
    assert policy is not None
    value = numeric_spec.validate_numeric_value(policy, number)
    assert numeric_spec.format_numeric_value(policy, value) == expected


# ── Lexical and limit validation ────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw",
    [
        "",
        " ",
        "0",
        "0.00",
        "-1",
        "-0.5",
        "1e3",
        "1E3",
        "1 234",
        "1,5",
        "1 2",
        " 750",
        "750 ",
        "750 Вт",
        "CL36",
        "NaN",
        "Infinity",
        "1.2.3",
        "١٢٣",
        None,
        True,
        750,
        750.0,
        [750],
        {"value": 750},
    ],
)
def test_malformed_custom_values_are_rejected(raw: object) -> None:
    policy = numeric_spec.numeric_policy("psu", "wattage_w")
    assert policy is not None
    with pytest.raises(InvalidInputError) as raised:
        numeric_spec.validate_numeric_value(policy, raw)
    # The API maps `InvalidInputError` to 422, never to 500.
    assert raised.value.status_code == 422


@pytest.mark.parametrize(
    ("number", "max_value", "places", "accepted"),
    [
        ("10000", "10000", 0, True),
        ("10001", "10000", 0, False),
        ("1000.5", "1000", 2, False),
        ("999.99", "1000", 2, True),
        ("3.4", "20", 3, True),
        ("3.400", "20", 3, True),
        ("3.4001", "20", 3, False),
        ("1.234", "20", 2, False),
        ("0.0001", "1000", 4, True),
        ("0.00001", "1000", 4, False),
    ],
)
def test_field_specific_maximum_and_precision(
    number: str, max_value: str, places: int, accepted: bool
) -> None:
    policy = numeric_spec.NumericFieldPolicy(
        max_value=Decimal(max_value), decimal_places=places, affix="×"
    )
    if accepted:
        assert numeric_spec.validate_numeric_value(policy, number) == Decimal(number)
    else:
        with pytest.raises(InvalidInputError):
            numeric_spec.validate_numeric_value(policy, number)


def test_trailing_zeros_are_not_excess_precision() -> None:
    policy = numeric_spec.numeric_policy("cpu", "base_clock_ghz")
    assert policy is not None
    assert numeric_spec.validate_numeric_value(policy, "3.400") == Decimal("3.4")
    integral = numeric_spec.numeric_policy("psu", "wattage_w")
    assert integral is not None
    # An integer field accepts a value written with a zero fraction but stores it
    # canonically; a real fraction is still rejected.
    assert numeric_spec.validate_numeric_value(integral, "750.0") == Decimal(750)
    with pytest.raises(InvalidInputError, match="decimal places"):
        numeric_spec.validate_numeric_value(integral, "750.5")


def test_integer_field_rejects_fractions() -> None:
    policy = numeric_spec.numeric_policy("ram", "cas_latency")
    assert policy is not None
    with pytest.raises(InvalidInputError, match="decimal places"):
        numeric_spec.validate_numeric_value(policy, "36.5")


# ── Service submission ──────────────────────────────────────────────────────


def test_custom_value_outside_the_allowlist_is_rejected() -> None:
    definition = _definition("memory_bus_bits", "gpu")
    dictionary = _dictionary(definition, "128 бит")
    with pytest.raises(InvalidInputError, match="does not accept a custom numeric"):
        _submit(definition, _numeric_submission("memory_bus_bits", "256"), dictionary)


def test_custom_value_for_a_categorical_field_is_rejected() -> None:
    definition = _definition("socket", "cpu", "string")
    dictionary = _dictionary(definition, "AM5")
    with pytest.raises(InvalidInputError, match="does not accept a custom numeric"):
        _submit(definition, _numeric_submission("socket", "5"), dictionary)


def test_custom_value_cannot_be_combined_with_options() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "750 Вт")
    option_id = dictionary[definition.id][0].id
    submission = CharacteristicSubmission(
        code="wattage_w",
        options=(OptionSelection(option_id=option_id, quantity=1),),
        numeric_value="800",
    )
    with pytest.raises(InvalidInputError, match="cannot be combined"):
        _submit(definition, submission, dictionary)


def test_dimensions_field_still_rejects_a_custom_number() -> None:
    definition = _definition("dimensions_mm", "gpu", "number_list", unit="мм")
    dictionary = _dictionary(definition, "307 × 125 × 46 мм")
    with pytest.raises(InvalidInputError, match="does not accept a custom numeric"):
        _submit(definition, _numeric_submission("dimensions_mm", "307"), dictionary)


def test_existing_option_is_reused_for_a_canonical_custom_value() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "350 Вт", "750 Вт")
    known = dictionary[definition.id][1]
    values = _submit(definition, _numeric_submission("wattage_w", "750"), dictionary)
    assert values["wattage_w"] == (
        SelectedOption(option_id=known.id, value="750 Вт", quantity=1),
    )


def test_equivalent_decimal_representation_reuses_the_stored_option() -> None:
    """`3.40` has to find the stored `3.4 ГГц` instead of creating a duplicate."""
    definition = _definition("base_clock_ghz", "cpu")
    dictionary = _dictionary(definition, "3.4 ГГц")
    stored = dictionary[definition.id][0]
    values = _submit(
        definition, _numeric_submission("base_clock_ghz", "3.40"), dictionary
    )
    assert values["base_clock_ghz"] == (
        SelectedOption(option_id=stored.id, value="3.4 ГГц", quantity=1),
    )


def test_equivalent_magnitude_with_another_spelling_reuses_the_option() -> None:
    """A stored `5 ГГц` is the same magnitude as `5.0`, so it is reused as-is."""
    definition = _definition("max_clock_ghz", "cpu")
    dictionary = _dictionary(definition, "5 ГГц", "6 ГГц")
    stored = dictionary[definition.id][0]
    values = _submit(
        definition, _numeric_submission("max_clock_ghz", "5.0"), dictionary
    )
    assert values["max_clock_ghz"] == (
        SelectedOption(option_id=stored.id, value="5 ГГц", quantity=1),
    )


def test_a_new_number_is_marked_for_creation() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "750 Вт")
    values = _submit(definition, _numeric_submission("wattage_w", "825"), dictionary)
    (option,) = values["wattage_w"]
    assert option.option_id == spec_service.UNRESOLVED_OPTION_ID
    assert option.value == "825 Вт"
    assert option.quantity == 1


def test_picking_an_existing_option_keeps_its_dictionary_id() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "750 Вт", "825 Вт")
    picked = dictionary[definition.id][1]
    values = _submit(
        definition,
        CharacteristicSubmission(
            code="wattage_w", options=(OptionSelection(option_id=picked.id),)
        ),
        dictionary,
    )
    assert values["wattage_w"] == (
        SelectedOption(option_id=picked.id, value="825 Вт", quantity=1),
    )


def test_a_numeric_field_accepts_only_one_option() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "750 Вт", "825 Вт")
    first, second = (option.id for option in dictionary[definition.id])
    with pytest.raises(InvalidInputError, match="only one option"):
        _submit(
            definition,
            CharacteristicSubmission(
                code="wattage_w",
                options=(
                    OptionSelection(option_id=first),
                    OptionSelection(option_id=second),
                ),
            ),
            dictionary,
        )


def test_a_numeric_field_rejects_a_quantity() -> None:
    definition = _definition("wattage_w", "psu")
    dictionary = _dictionary(definition, "750 Вт")
    option_id = dictionary[definition.id][0].id
    with pytest.raises(InvalidInputError, match="does not accept a quantity"):
        _submit(
            definition,
            CharacteristicSubmission(
                code="wattage_w",
                options=(OptionSelection(option_id=option_id, quantity=2),),
            ),
            dictionary,
        )


def test_a_number_of_another_category_is_never_editable() -> None:
    """The same code keeps the previous category's behaviour after a transition."""
    definition = _definition("length_mm", "storage")
    dictionary = _dictionary(definition, "80 мм")
    with pytest.raises(InvalidInputError, match="does not accept a custom numeric"):
        _submit(definition, _numeric_submission("length_mm", "110"), dictionary)


# ── Serialization ───────────────────────────────────────────────────────────


def test_editor_payload_exposes_numeric_metadata_and_magnitude_order() -> None:
    definition = _definition("length_mm", "gpu", unit="мм", is_required=True)
    dictionary = _dictionary(definition, "305 мм", "234.1 мм", "269.1 мм")
    (field,) = spec_service.serialize_definition_fields([definition], dictionary)
    assert field["editor"] == spec_service.EDITOR_NUMERIC
    limits = field["limits"]
    assert limits["max_selections"] == 1
    assert limits["repeatable"] is False
    assert limits["numeric"] == {
        "max_value": "1000",
        "decimal_places": 2,
        "style": "suffix",
        "affix": "мм",
        "plural_forms": None,
    }
    # Options are ordered by magnitude, not by their text.
    assert [option["value"] for option in field["options"]] == [
        "234.1 мм",
        "269.1 мм",
        "305 мм",
    ]


def test_editor_payload_exposes_prefix_and_plural_metadata() -> None:
    latency = _definition("cas_latency", "ram", definition_id=1)
    cores = _definition("cores", "cpu", definition_id=2)
    fields = spec_service.serialize_definition_fields(
        [latency, cores],
        {
            latency.id: [DictionaryOption(1, latency.id, "CL16")],
            cores.id: [DictionaryOption(2, cores.id, "6 ядер")],
        },
    )
    assert fields[0]["limits"]["numeric"]["style"] == "prefix"
    assert fields[0]["limits"]["numeric"]["affix"] == "CL"
    assert fields[1]["limits"]["numeric"]["affix"] is None
    assert fields[1]["limits"]["numeric"]["plural_forms"] == {
        "one": "ядро",
        "few": "ядра",
        "many": "ядер",
    }


def test_fixed_definitions_expose_no_numeric_metadata() -> None:
    definition = _definition("memory_bus_bits", "gpu")
    (field,) = spec_service.serialize_definition_fields(
        [definition], _dictionary(definition, "192 бит")
    )
    assert field["editor"] == spec_service.EDITOR_SELECT
    assert field["limits"]["numeric"] is None
    assert field["limits"]["dimensions"] is None


def test_display_value_never_duplicates_the_fixed_unit() -> None:
    """`24″ дюйм` or `CL36 CL` would be a rendering defect, not a value."""
    diagonal = _definition("diagonal_inch", "monitor", unit="дюйм")
    latency = _definition("cas_latency", "ram", definition_id=2)
    cores = _definition("cores", "cpu", definition_id=3)
    assert spec_service.display_value(diagonal, (SelectedOption(1, "24″", 1),)) == "24″"
    assert (
        spec_service.display_value(latency, (SelectedOption(2, "CL36", 1),)) == "CL36"
    )
    assert (
        spec_service.display_value(cores, (SelectedOption(3, "6 ядер", 1),)) == "6 ядер"
    )


def test_structured_value_of_a_numeric_field_is_a_number() -> None:
    definition = _definition("length_mm", "gpu", unit="мм")
    assert (
        spec_service.structured_value(definition, (SelectedOption(1, "305 мм", 1),))
        == 305
    )
    decimal = _definition("dram_cache_gb", "storage", unit="ГБ", definition_id=2)
    assert (
        spec_service.structured_value(decimal, (SelectedOption(2, "0.5 ГБ", 1),)) == 0.5
    )


def test_gpu_dimensions_editor_is_unchanged() -> None:
    definition = _definition("dimensions_mm", "gpu", "number_list", unit="мм")
    assert definition.editor == spec_service.EDITOR_DIMENSIONS
    (field,) = spec_service.serialize_definition_fields([definition], {})
    assert field["limits"]["numeric"] is None
    assert field["limits"]["dimensions"] == {
        "count": 3,
        "unit": "мм",
        "max_value": "1000",
        "decimal_places": 2,
    }
    values = spec_service.submitted_values(
        [definition],
        [
            CharacteristicSubmission(
                code="dimensions_mm",
                dimensions=(Decimal(307), Decimal(125), Decimal(46)),
            )
        ],
        _dictionary(definition, "307 × 125 × 46 мм"),
    )
    assert values["dimensions_mm"][0].value == "307 × 125 × 46 мм"
