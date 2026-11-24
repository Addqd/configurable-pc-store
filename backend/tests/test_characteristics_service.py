"""Unit tests for the normalized characteristic service layer.

The functions under test are pure: they receive definitions and values and never
open a database connection, so they run without an isolated PostgreSQL database.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import spec_service
from app.services.errors import InvalidInputError
from app.services.spec_service import CharacteristicDefinition


def _definition(
    code: str,
    data_type: str,
    *,
    name: str | None = None,
    unit: str | None = None,
    sort_order: int = 0,
    is_required: bool = False,
) -> CharacteristicDefinition:
    return CharacteristicDefinition(
        id=sort_order + 1,
        category_id=1,
        code=code,
        name=name or code,
        data_type=data_type,
        unit=unit,
        sort_order=sort_order,
        is_required=is_required,
        show_in_short=True,
        show_in_details=True,
    )


# ── Data types ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("data_type", "raw", "expected"),
    [
        ("string", "  AM5  ", "AM5"),
        ("number", 8, 8),
        ("number", 3.4, 3.4),
        ("number", 0, 0),
        ("boolean", True, True),
        ("boolean", False, False),
        ("string_list", ["pcie-8pin", "pcie-8pin"], ["pcie-8pin", "pcie-8pin"]),
        ("number_list", [60, 80], [60, 80]),
        ("string_list", [], []),
        ("number_list", [], []),
    ],
)
def test_accepted_values_keep_their_native_type(
    data_type: str, raw: Any, expected: Any
) -> None:
    definition = _definition("code", data_type)
    result = spec_service.normalize_value(definition, raw)
    assert result == expected
    assert type(result) is type(expected)


@pytest.mark.parametrize(
    ("data_type", "raw"),
    [
        ("string", 8),
        ("string", ""),
        ("string", "   "),
        ("string", True),
        ("string", ["AM5"]),
        ("number", "8"),
        ("number", True),
        ("number", [8]),
        ("number", float("nan")),
        ("number", float("inf")),
        ("boolean", "true"),
        ("boolean", 1),
        ("string_list", "pcie-8pin"),
        ("string_list", ["ok", ""]),
        ("string_list", ["ok", 5]),
        ("number_list", [60, "80"]),
        ("number_list", [60, True]),
        ("number_list", [60, float("inf")]),
    ],
)
def test_rejected_values_never_reach_storage(data_type: str, raw: Any) -> None:
    definition = _definition("code", data_type)
    with pytest.raises(InvalidInputError):
        spec_service.normalize_value(definition, raw)


def test_json_null_is_rejected_for_every_type() -> None:
    for data_type in ("string", "number", "boolean", "string_list", "number_list"):
        with pytest.raises(InvalidInputError):
            spec_service.normalize_value(_definition("code", data_type), None)


def test_oversized_payloads_are_rejected() -> None:
    long_text = "x" * (spec_service.MAX_STRING_LENGTH + 1)
    with pytest.raises(InvalidInputError):
        spec_service.normalize_value(_definition("code", "string"), long_text)
    too_many = ["x"] * (spec_service.MAX_LIST_LENGTH + 1)
    with pytest.raises(InvalidInputError):
        spec_service.normalize_value(_definition("code", "string_list"), too_many)


def test_list_order_and_duplicates_are_preserved() -> None:
    definition = _definition("available_gpu_power_connectors", "string_list")
    raw = ["pcie-8pin", "pcie-16pin", "pcie-8pin"]
    assert spec_service.normalize_value(definition, raw) == raw


# ── Payload validation and category scoping ────────────────────────────────


def _definitions() -> list[CharacteristicDefinition]:
    return [
        _definition("socket", "string", name="Сокет", sort_order=0, is_required=True),
        _definition(
            "thermal_design_power_w",
            "number",
            name="Теплопакет",
            unit="Вт",
            sort_order=1,
        ),
        _definition("has_3d_vcache", "boolean", name="3D V-Cache", sort_order=2),
    ]


def test_unknown_code_is_rejected() -> None:
    with pytest.raises(InvalidInputError, match="Unknown characteristic code"):
        spec_service.submitted_values(_definitions(), [("chipset", "B650")])


def test_duplicate_code_in_one_payload_is_rejected() -> None:
    with pytest.raises(InvalidInputError, match="Duplicate characteristic code"):
        spec_service.submitted_values(
            _definitions(), [("socket", "AM5"), ("socket", "LGA1700")]
        )


def test_submitted_values_are_type_checked_against_the_definition() -> None:
    with pytest.raises(InvalidInputError, match="numeric value"):
        spec_service.submitted_values(
            _definitions(), [("thermal_design_power_w", "105")]
        )


def test_codes_are_trimmed_before_lookup() -> None:
    values = spec_service.submitted_values(_definitions(), [("  socket  ", " AM5 ")])
    assert values == {"socket": "AM5"}


def test_removed_codes_must_be_known_and_unique() -> None:
    assert spec_service.removed_codes(_definitions(), ["has_3d_vcache"]) == {
        "has_3d_vcache"
    }
    with pytest.raises(InvalidInputError, match="Unknown characteristic code"):
        spec_service.removed_codes(_definitions(), ["nope"])
    with pytest.raises(InvalidInputError, match="Duplicate characteristic code"):
        spec_service.removed_codes(_definitions(), ["socket", "socket"])


# ── Merge semantics ────────────────────────────────────────────────────────


def test_required_values_are_enforced() -> None:
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(_definitions(), {}, {})


def test_incomplete_update_does_not_drop_already_stored_required_values() -> None:
    existing = {"socket": "AM5"}
    merged = spec_service.resolve_values(
        _definitions(), existing, {"thermal_design_power_w": 65}
    )
    assert merged == {"socket": "AM5", "thermal_design_power_w": 65}


def test_existing_values_are_preserved_unless_replaced_or_removed() -> None:
    existing = {"socket": "AM5", "has_3d_vcache": True}
    merged = spec_service.resolve_values(
        _definitions(), existing, {"thermal_design_power_w": 120}
    )
    assert merged == {
        "socket": "AM5",
        "has_3d_vcache": True,
        "thermal_design_power_w": 120,
    }

    removed = spec_service.resolve_values(
        _definitions(), existing, {}, ["has_3d_vcache"]
    )
    assert "has_3d_vcache" not in removed
    assert removed["socket"] == "AM5"


def test_required_value_cannot_be_removed() -> None:
    existing = {"socket": "AM5", "thermal_design_power_w": 65}
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(_definitions(), existing, {}, ["socket"])


def test_cross_category_values_are_never_dropped_silently() -> None:
    existing = {"chipset": "AMD B650", "socket": "AM5"}
    with pytest.raises(InvalidInputError, match="not defined for the target category"):
        spec_service.resolve_values(_definitions(), existing, {})


def test_explicit_removal_allows_a_category_transition() -> None:
    existing = {"chipset": "AMD B650", "socket": "AM5"}
    merged = spec_service.resolve_values(_definitions(), existing, {}, ["chipset"])
    assert merged == {"socket": "AM5"}


def test_stored_value_of_the_wrong_type_blocks_the_transition() -> None:
    definitions = [_definition("cores", "number", name="Ядра")]
    existing = {"cores": "восемь"}
    with pytest.raises(InvalidInputError, match="does not match the target category"):
        spec_service.resolve_values(definitions, existing, {})
    # …unless it is explicitly removed.
    assert spec_service.resolve_values(definitions, existing, {}, ["cores"]) == {}


def test_false_and_zero_are_real_values_not_absences() -> None:
    definitions = [
        _definition("has_integrated_graphics", "boolean", name="Встроенная графика"),
        _definition("cores", "number", name="Ядра"),
        _definition("string_list", "string_list", name="Список"),
    ]
    merged = spec_service.resolve_values(
        definitions,
        {},
        {"has_integrated_graphics": False, "cores": 0, "string_list": []},
    )
    assert merged == {"has_integrated_graphics": False, "cores": 0, "string_list": []}


def test_required_validation_can_be_relaxed_for_partial_writes() -> None:
    merged = spec_service.resolve_values(
        _definitions(), {}, {"thermal_design_power_w": 65}, require_complete=False
    )
    assert merged == {"thermal_design_power_w": 65}


# ── Required lists ─────────────────────────────────────────────────────────


def _list_definitions() -> list[CharacteristicDefinition]:
    return [
        _definition(
            "required_strings",
            "string_list",
            name="Обязательный список",
            is_required=True,
        ),
        _definition(
            "required_numbers",
            "number_list",
            name="Обязательные числа",
            is_required=True,
        ),
        _definition("optional_strings", "string_list", name="Список по желанию"),
        _definition("optional_numbers", "number_list", name="Числа по желанию"),
    ]


@pytest.mark.parametrize(
    ("code", "name"),
    [
        ("required_strings", "Обязательный список"),
        ("required_numbers", "Обязательные числа"),
    ],
)
def test_empty_required_list_is_rejected(code: str, name: str) -> None:
    with pytest.raises(InvalidInputError) as error:
        spec_service.resolve_values(_list_definitions(), {}, {code: []})
    assert "Missing required characteristics" in str(error.value)
    assert name in str(error.value)


def test_required_lists_that_are_not_submitted_are_rejected() -> None:
    values = {
        "required_strings": ["pcie-8pin"],
        "required_numbers": [60],
        "optional_strings": ["pcie-8pin"],
        "optional_numbers": [80],
    }
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(_list_definitions(), {"optional_strings": []}, {})
    # A complete payload (both required lists filled) is accepted.
    assert spec_service.resolve_values(_list_definitions(), {}, values) == values


def test_empty_optional_lists_stay_valid() -> None:
    values = {
        "required_strings": ["pcie-8pin"],
        "required_numbers": [60],
        "optional_strings": [],
        "optional_numbers": [],
    }
    assert spec_service.resolve_values(_list_definitions(), {}, values) == values


def test_required_list_cannot_be_emptied_by_an_update() -> None:
    existing = {"required_strings": ["pcie-8pin"], "required_numbers": [60]}
    with pytest.raises(InvalidInputError, match="Обязательный список"):
        spec_service.resolve_values(
            _list_definitions(), existing, {"required_strings": []}
        )
    # Removing a required list is rejected just like emptying it.
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(
            _list_definitions(), existing, {}, ["required_numbers"]
        )


def test_required_scalars_accept_false_and_zero() -> None:
    definitions = [
        _definition("required_flag", "boolean", name="Флаг", is_required=True),
        _definition("required_number", "number", name="Число", is_required=True),
    ]
    assert spec_service.resolve_values(
        definitions, {}, {"required_flag": False, "required_number": 0}
    ) == {"required_flag": False, "required_number": 0}
    # …while a genuinely absent required value is still rejected.
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(definitions, {}, {"required_number": 0})


def test_list_values_keep_order_duplicates_and_native_types() -> None:
    values = {
        "required_strings": ["pcie-8pin", "pcie-16pin", "pcie-8pin"],
        "required_numbers": [80, 60, 60],
    }
    merged = spec_service.resolve_values(_list_definitions(), {}, values)
    assert merged["required_strings"] == ["pcie-8pin", "pcie-16pin", "pcie-8pin"]
    assert merged["required_numbers"] == [80, 60, 60]


def test_malformed_list_items_are_rejected() -> None:
    for raw in (["pcie-8pin", ""], ["pcie-8pin", 5], "pcie-8pin"):
        with pytest.raises(InvalidInputError):
            spec_service.submitted_values(
                _list_definitions(), [("required_strings", raw)]
            )
    for raw in ([60, "80"], [60, True], [60, float("inf")]):
        with pytest.raises(InvalidInputError):
            spec_service.submitted_values(
                _list_definitions(), [("required_numbers", raw)]
            )


# ── Category transitions with explicitly replaced values ─────────────────────


def _cpu_definitions() -> list[CharacteristicDefinition]:
    """Source category: `memory_type` is a list, like a CPU's memory type."""
    return [
        _definition("socket", "string", name="Сокет", is_required=True),
        _definition("memory_type", "string_list", name="Тип памяти"),
    ]


def _board_definitions() -> list[CharacteristicDefinition]:
    """Target category: the same code is a plain string, like a motherboard's."""
    return [
        _definition("memory_type", "string", name="Тип памяти"),
        _definition("form_factor", "string", name="Форм-фактор"),
    ]


def test_a_stored_list_is_replaced_by_a_valid_string() -> None:
    merged = spec_service.resolve_values(
        _board_definitions(), {"memory_type": ["ddr5"]}, {"memory_type": "ddr5"}
    )
    assert merged == {"memory_type": "ddr5"}


def test_a_stored_string_is_replaced_by_a_valid_list() -> None:
    merged = spec_service.resolve_values(
        _cpu_definitions(),
        {"memory_type": "ddr5", "socket": "AM5"},
        {"memory_type": ["ddr5"]},
    )
    assert merged == {"memory_type": ["ddr5"], "socket": "AM5"}


def test_an_incompatible_stored_value_without_a_replacement_is_rejected() -> None:
    with pytest.raises(InvalidInputError, match="does not match the target category"):
        spec_service.resolve_values(_board_definitions(), {"memory_type": ["ddr5"]}, {})


def test_an_incompatible_stored_value_can_still_be_removed_explicitly() -> None:
    assert (
        spec_service.resolve_values(
            _board_definitions(), {"memory_type": ["ddr5"]}, {}, ["memory_type"]
        )
        == {}
    )


def test_a_replacement_must_match_the_target_definition() -> None:
    with pytest.raises(InvalidInputError, match="text value is required"):
        spec_service.submitted_values(_board_definitions(), [("memory_type", ["ddr5"])])
    with pytest.raises(InvalidInputError, match="list value is required"):
        spec_service.submitted_values(_cpu_definitions(), [("memory_type", "ddr5")])


def test_a_replacement_leaves_valid_unrelated_values_untouched() -> None:
    definitions = [
        *_board_definitions(),
        _definition("socket", "string", name="Сокет", is_required=True),
    ]
    merged = spec_service.resolve_values(
        definitions,
        {"memory_type": ["ddr5"], "socket": "AM5"},
        {"memory_type": "ddr5"},
    )
    assert merged == {"memory_type": "ddr5", "socket": "AM5"}


def test_a_transition_with_a_replacement_still_requires_the_target_values() -> None:
    definitions = [
        *_board_definitions(),
        _definition("socket", "string", name="Сокет", is_required=True),
    ]
    with pytest.raises(InvalidInputError, match="Сокет"):
        spec_service.resolve_values(
            definitions, {"memory_type": ["ddr5"]}, {"memory_type": "ddr5"}
        )
    assert spec_service.resolve_values(
        definitions,
        {"memory_type": ["ddr5"]},
        {"memory_type": "ddr5", "socket": "AM5"},
    ) == {"memory_type": "ddr5", "socket": "AM5"}


def test_a_replacement_list_keeps_order_and_duplicates() -> None:
    merged = spec_service.resolve_values(
        _cpu_definitions(),
        {"memory_type": "ddr5", "socket": "AM5"},
        {"memory_type": ["ddr5", "ddr4", "ddr5"]},
    )
    assert merged["memory_type"] == ["ddr5", "ddr4", "ddr5"]


def test_replaced_false_and_zero_are_not_treated_as_absences() -> None:
    definitions = [
        _definition("memory_type", "boolean", name="Тип памяти"),
        _definition("slots", "number", name="Слоты"),
    ]
    merged = spec_service.resolve_values(
        definitions,
        {"memory_type": ["ddr5"], "slots": "n/a"},
        {"memory_type": False, "slots": 0},
    )
    assert merged == {"memory_type": False, "slots": 0}
