"""Dictionary-backed characteristic service (no database required).

`spec_service` is the single place that interprets the normalized tables. These
tests cover the rules it owns without a PostgreSQL server:

- the editor behaviour derived from the category-scoped code;
- option/quantity validation against one definition's dictionary, so an option of
  another characteristic or category can never be reused;
- the resolve merge (unchanged, replaced, explicitly removed, category change);
- GPU dimensions: exactly three validated measurements, canonical dictionary text
  and the absence of any repair of malformed input.

The SQL paths themselves are exercised by the database-backed API tests.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services import spec_service
from app.services.errors import InvalidInputError
from app.services.spec_service import (
    CharacteristicDefinition,
    CharacteristicSubmission,
    DictionaryOption,
    OptionSelection,
    SelectedOption,
)


def _definition(
    code: str,
    data_type: str = "string",
    *,
    category_slug: str = "gpu",
    name: str | None = None,
    unit: str | None = None,
    sort_order: int = 0,
    is_required: bool = False,
    definition_id: int | None = None,
) -> CharacteristicDefinition:
    return CharacteristicDefinition(
        id=definition_id if definition_id is not None else sort_order + 1,
        category_id=1,
        category_slug=category_slug,
        code=code,
        name=name or code,
        data_type=data_type,
        unit=unit,
        sort_order=sort_order,
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
                id=100 + definition.id * 10 + index,
                characteristic_id=definition.id,
                value=value,
            )
            for index, value in enumerate(values)
        ]
    }


def _options(definition: CharacteristicDefinition, *values: str) -> list[int]:
    return [option.id for option in _dictionary(definition, *values)[definition.id]]


# ── Editor behaviour ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("category_slug", "code", "data_type", "editor"),
    [
        ("gpu", "color", "string", spec_service.EDITOR_SELECT),
        ("gpu", "length_mm", "number", spec_service.EDITOR_SELECT),
        ("gpu", "ecc_memory", "boolean", spec_service.EDITOR_BOOLEAN),
        (
            "cooling",
            "supported_sockets",
            "string_list",
            spec_service.EDITOR_MULTISELECT,
        ),
        (
            "mobo",
            "supported_nvme_lengths_mm",
            "number_list",
            spec_service.EDITOR_MULTISELECT,
        ),
        (
            "gpu",
            "required_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        (
            "mobo",
            "required_cpu_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        (
            "mobo",
            "required_board_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        (
            "psu",
            "available_cpu_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        (
            "psu",
            "available_gpu_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        (
            "psu",
            "available_board_power_connectors",
            "string_list",
            spec_service.EDITOR_CONNECTORS,
        ),
        ("gpu", "dimensions_mm", "number_list", spec_service.EDITOR_DIMENSIONS),
    ],
)
def test_editor_behaviour_is_category_scoped(
    category_slug: str, code: str, data_type: str, editor: str
) -> None:
    assert spec_service.editor_for(category_slug, code, data_type) == editor


def test_supported_nvme_lengths_are_not_a_dimension_editor() -> None:
    """Only GPU `dimensions_mm` is the ordered-triple editor."""
    assert (
        spec_service.editor_for("mobo", "supported_nvme_lengths_mm", "number_list")
        == spec_service.EDITOR_MULTISELECT
    )
    # The same code in another category is not the GPU dimensions field.
    assert (
        spec_service.editor_for("mobo", "dimensions_mm", "number_list")
        == spec_service.EDITOR_MULTISELECT
    )


def test_only_repeated_connectors_accept_quantities() -> None:
    assert spec_service.is_repeatable(spec_service.EDITOR_CONNECTORS)
    for editor in (
        spec_service.EDITOR_SELECT,
        spec_service.EDITOR_BOOLEAN,
        spec_service.EDITOR_MULTISELECT,
        spec_service.EDITOR_DIMENSIONS,
    ):
        assert not spec_service.is_repeatable(editor)


# ── Semantic interpretation ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("750 Вт", Decimal(750)),
        ("269.1 мм", Decimal("269.1")),
        ("21.5″", Decimal("21.5")),
        ("20000 об/мин", Decimal(20000)),
        ("0.03 мс", Decimal("0.03")),
        ("5", Decimal(5)),
        # Not a magnitude: no grouping repair, no prefix search, no sign guessing.
        ("1 234 ГБ", None),
        ("CL16", None),
        ("AM5", None),
        ("", None),
        ("-5 Вт", None),
    ],
)
def test_measurement_parsing_never_repairs_text(
    value: str, expected: Decimal | None
) -> None:
    assert spec_service.parse_measurement(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [("Да", True), ("Нет", False), ("  да  ", True), ("—", None), ("", None)],
)
def test_boolean_parsing(value: str, expected: bool | None) -> None:
    assert spec_service.parse_boolean(value) is expected


def test_text_normalization_collapses_whitespace_and_case_only() -> None:
    assert spec_service.normalize_text("  AM5 ") == spec_service.normalize_text("am5")
    assert spec_service.normalize_text("PCIe  8-pin") == "pcie 8-pin"
    # Nothing is stripped to force a match: the whole identifier is compared.
    assert spec_service.normalize_text("PCIe 8-pin") != spec_service.normalize_text(
        "PCIe 8-pin x2"
    )


# ── Dimensions ──────────────────────────────────────────────────────────────


def test_dimensions_canonicalize_without_trailing_zeros() -> None:
    assert (
        spec_service.canonical_dimensions(
            [Decimal(320), Decimal("134.85"), Decimal("61.57")]
        )
        == "320 × 134.85 × 61.57 мм"
    )
    assert (
        spec_service.canonical_dimensions(
            [Decimal(46), Decimal("40.0"), Decimal("234.10")]
        )
        == "46 × 40 × 234.1 мм"
    )


@pytest.mark.parametrize(
    "stored",
    [
        "234.1 × 123.5 × 40.2 мм",
        "269.1 × 131.8 × 40.1 мм",
        "305 × 138 × 65 мм",
        "307 × 125 × 46 мм",
        "320 × 134.85 × 61.57 мм",
        "342 × 150 × 75 мм",
        "357.6 × 149.3 × 70.1 мм",
    ],
)
def test_every_stored_gpu_dimension_round_trips(stored: str) -> None:
    numbers = spec_service.parse_dimensions(stored)
    assert numbers is not None
    canonical = spec_service.canonical_dimensions(
        [Decimal(str(number)) for number in numbers]
    )
    assert canonical == stored


@pytest.mark.parametrize(
    "raw",
    [
        [307, 125],
        [307, 125, 46, 12],
        [307, "125 ", 46],
        [307, "1e3", 46],
        [307, "1 234", 46],
        [307, "125,5", 46],
        [0, 125, 46],
        [-1, 125, 46],
        [1001, 125, 46],
        [1.234, 125, 46],
        [True, 125, 46],
        [float("nan"), 125, 46],
        [float("inf"), 125, 46],
        [None, 125, 46],
    ],
)
def test_invalid_dimensions_are_rejected(raw: list) -> None:
    with pytest.raises(InvalidInputError):
        spec_service.validate_dimensions(raw)


def test_dimensions_accept_two_decimal_places() -> None:
    assert spec_service.validate_dimensions([1.05, 1000, 0.5]) == (
        Decimal("1.05"),
        Decimal(1000),
        Decimal("0.5"),
    )


# ── Option membership and quantity rules ────────────────────────────────────


def _submission(
    code: str, *option_ids: int, quantity: int = 1
) -> CharacteristicSubmission:
    return CharacteristicSubmission(
        code=code,
        options=tuple(
            OptionSelection(option_id=option_id, quantity=quantity)
            for option_id in option_ids
        ),
    )


def test_scalar_characteristics_accept_exactly_one_option() -> None:
    definition = _definition("socket", "string")
    ids = _options(definition, "AM5", "AM4")
    values = spec_service.submitted_values(
        [definition],
        [_submission("socket", ids[0])],
        _dictionary(definition, "AM5", "AM4"),
    )
    assert values["socket"] == (SelectedOption(ids[0], "AM5", 1),)

    with pytest.raises(InvalidInputError, match="only one option"):
        spec_service.submitted_values(
            [definition],
            [_submission("socket", ids[0], ids[1])],
            _dictionary(definition, "AM5", "AM4"),
        )


def test_scalar_characteristics_reject_a_quantity() -> None:
    definition = _definition("socket", "string")
    ids = _options(definition, "AM5")
    with pytest.raises(InvalidInputError, match="does not accept a quantity"):
        spec_service.submitted_values(
            [definition],
            [_submission("socket", ids[0], quantity=2)],
            _dictionary(definition, "AM5"),
        )


@pytest.mark.parametrize(
    ("code", "data_type", "category_slug", "values"),
    [
        pytest.param("has_3d_vcache", "boolean", "cpu", ("Да", "Нет"), id="boolean"),
        pytest.param(
            "supported_sockets",
            "string_list",
            "cooling",
            ("AM5", "AM4"),
            id="multiselect",
        ),
        pytest.param(
            "supported_nvme_lengths_mm",
            "number_list",
            "mobo",
            ("80", "60"),
            id="multiselect-number",
        ),
    ],
)
@pytest.mark.parametrize("quantity", [2, 32])
def test_non_repeatable_editors_never_accept_a_quantity(
    code: str,
    data_type: str,
    category_slug: str,
    values: tuple[str, ...],
    quantity: int,
) -> None:
    """Only `connector_quantity` repeats a value; everything else stores one."""
    definition = _definition(code, data_type, category_slug=category_slug)
    ids = _options(definition, *values)
    with pytest.raises(InvalidInputError, match="does not accept a quantity"):
        spec_service.submitted_values(
            [definition],
            [_submission(code, ids[0], quantity=quantity)],
            _dictionary(definition, *values),
        )


def test_boolean_false_is_a_real_selection() -> None:
    definition = _definition("has_3d_vcache", "boolean", category_slug="cpu")
    dictionary = _dictionary(definition, "Да", "Нет")
    false_id = dictionary[definition.id][1].id
    values = spec_service.submitted_values(
        [definition], [_submission("has_3d_vcache", false_id)], dictionary
    )
    assert spec_service.structured_value(definition, values["has_3d_vcache"]) is False
    assert not spec_service.is_missing_value(definition, values["has_3d_vcache"])


def test_multiselect_rejects_duplicate_options() -> None:
    definition = _definition(
        "supported_sockets", "string_list", category_slug="cooling"
    )
    ids = _options(definition, "AM5", "AM4")
    with pytest.raises(InvalidInputError, match="must not be selected twice"):
        spec_service.submitted_values(
            [definition],
            [_submission("supported_sockets", ids[0], ids[0])],
            _dictionary(definition, "AM5", "AM4"),
        )


def test_connectors_keep_their_quantity() -> None:
    definition = _definition(
        "available_gpu_power_connectors", "string_list", category_slug="psu"
    )
    dictionary = _dictionary(definition, "PCIe 8-pin", "PCIe 16-pin")
    eight, sixteen = (option.id for option in dictionary[definition.id])
    values = spec_service.submitted_values(
        [definition],
        [_submission("available_gpu_power_connectors", eight, sixteen, quantity=4)],
        dictionary,
    )
    assert [
        (option.option_id, option.quantity) for option in values[definition.code]
    ] == [
        (eight, 4),
        (sixteen, 4),
    ]
    assert (
        spec_service.structured_value(definition, values[definition.code]).count(
            "PCIe 8-pin"
        )
        == 4
    )


@pytest.mark.parametrize("quantity", [0, -1, 33])
def test_connector_quantity_must_be_bounded(quantity: int) -> None:
    definition = _definition(
        "required_power_connectors", "string_list", category_slug="gpu"
    )
    ids = _options(definition, "PCIe 8-pin")
    with pytest.raises(InvalidInputError):
        spec_service.submitted_values(
            [definition],
            [_submission("required_power_connectors", ids[0], quantity=quantity)],
            _dictionary(definition, "PCIe 8-pin"),
        )


def test_an_option_of_another_characteristic_is_rejected() -> None:
    socket = _definition("socket", "string", definition_id=1)
    chipset = _definition("chipset", "string", category_slug="mobo", definition_id=2)
    chipset_id = _dictionary(chipset, "AMD B650")[chipset.id][0].id
    dictionary = {
        socket.id: [DictionaryOption(10, socket.id, "AM5")],
        chipset.id: [DictionaryOption(chipset_id, chipset.id, "AMD B650")],
    }
    # A valid id of another definition is simply not a member of this dictionary.
    with pytest.raises(InvalidInputError, match="unknown option id"):
        spec_service.submitted_values(
            [socket], [_submission("socket", chipset_id)], dictionary
        )


def test_unknown_option_id_is_rejected() -> None:
    definition = _definition("socket", "string")
    with pytest.raises(InvalidInputError, match="unknown option id"):
        spec_service.submitted_values(
            [definition],
            [_submission("socket", 999_999)],
            _dictionary(definition, "AM5"),
        )


def test_unknown_and_duplicated_codes_are_rejected() -> None:
    definition = _definition("socket", "string")
    dictionary = _dictionary(definition, "AM5")
    ids = _options(definition, "AM5")
    with pytest.raises(InvalidInputError, match="Unknown characteristic code"):
        spec_service.submitted_values(
            [definition], [_submission("nope", ids[0])], dictionary
        )
    with pytest.raises(InvalidInputError, match="Duplicate characteristic code"):
        spec_service.submitted_values(
            [definition],
            [_submission("socket", ids[0]), _submission("socket", ids[0])],
            dictionary,
        )


def test_dimensions_submission_resolves_to_the_canonical_dictionary_value() -> None:
    definition = _definition("dimensions_mm", "number_list", unit="мм")
    dictionary = _dictionary(definition, "307 × 125 × 46 мм")
    known_id = dictionary[definition.id][0].id
    submission = CharacteristicSubmission(
        code="dimensions_mm",
        dimensions=(Decimal(307), Decimal(125), Decimal(46)),
    )
    values = spec_service.submitted_values([definition], [submission], dictionary)
    assert values["dimensions_mm"] == (
        SelectedOption(option_id=known_id, value="307 × 125 × 46 мм", quantity=1),
    )


def test_a_new_dimension_value_is_marked_for_creation() -> None:
    definition = _definition("dimensions_mm", "number_list", unit="мм")
    dictionary = _dictionary(definition, "307 × 125 × 46 мм")
    submission = CharacteristicSubmission(
        code="dimensions_mm",
        dimensions=(Decimal(320), Decimal("134.85"), Decimal("61.57")),
    )
    values = spec_service.submitted_values([definition], [submission], dictionary)
    (option,) = values["dimensions_mm"]
    assert option.option_id == spec_service.UNRESOLVED_OPTION_ID
    assert option.value == "320 × 134.85 × 61.57 мм"


def test_dimensions_do_not_accept_dictionary_picks() -> None:
    definition = _definition("dimensions_mm", "number_list", unit="мм")
    dictionary = _dictionary(definition, "307 × 125 × 46 мм")
    ids = _options(definition, "307 × 125 × 46 мм")
    with pytest.raises(InvalidInputError, match="three measurements"):
        spec_service.submitted_values(
            [definition], [_submission("dimensions_mm", ids[0])], dictionary
        )


def test_ordinary_characteristics_do_not_accept_dimensions() -> None:
    definition = _definition("socket", "string")
    submission = CharacteristicSubmission(
        code="socket", dimensions=(Decimal(1), Decimal(2), Decimal(3))
    )
    with pytest.raises(InvalidInputError, match="does not accept dimensions"):
        spec_service.submitted_values(
            [definition], [submission], _dictionary(definition, "AM5")
        )


# ── Removals and merging ────────────────────────────────────────────────────


def test_removed_codes_rejects_unknown_and_duplicate_codes() -> None:
    definitions = [_definition("has_3d_vcache", "boolean", category_slug="cpu")]
    assert spec_service.removed_codes(definitions, ["has_3d_vcache"]) == {
        "has_3d_vcache"
    }
    with pytest.raises(InvalidInputError, match="Unknown characteristic code"):
        spec_service.removed_codes(definitions, ["nope"])
    with pytest.raises(InvalidInputError, match="Duplicate characteristic code"):
        spec_service.removed_codes(definitions, ["has_3d_vcache", "has_3d_vcache"])


def test_required_values_must_be_present() -> None:
    definitions = [_definition("socket", "string", is_required=True)]
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(definitions, {}, {})


def test_unchanged_values_are_carried_over_inside_the_same_category() -> None:
    definitions = [_definition("socket", "string"), _definition("chipset", "string")]
    existing = {"socket": (SelectedOption(1, "AM5", 1),)}
    submitted = {"chipset": (SelectedOption(2, "AMD B650", 1),)}
    merged = spec_service.resolve_values(definitions, existing, submitted)
    assert merged == {
        "socket": (SelectedOption(1, "AM5", 1),),
        "chipset": (SelectedOption(2, "AMD B650", 1),),
    }


def test_an_explicit_removal_deletes_a_stored_value() -> None:
    definitions = [_definition("socket", "string"), _definition("chipset", "string")]
    existing = {
        "socket": (SelectedOption(1, "AM5", 1),),
        "chipset": (SelectedOption(2, "AMD B650", 1),),
    }
    merged = spec_service.resolve_values(definitions, existing, {}, ["chipset"])
    assert merged == {"socket": (SelectedOption(1, "AM5", 1),)}


def test_a_required_value_cannot_be_removed() -> None:
    definitions = [_definition("socket", "string", is_required=True)]
    existing = {"socket": (SelectedOption(1, "AM5", 1),)}
    with pytest.raises(InvalidInputError, match="Missing required characteristics"):
        spec_service.resolve_values(definitions, existing, {}, ["socket"])


def test_a_category_change_never_carries_stored_options_over() -> None:
    """Option ids belong to one definition, so a transition needs a decision."""
    target = [_definition("socket", "string")]
    existing = {"socket": (SelectedOption(1, "AM5", 1),)}
    with pytest.raises(InvalidInputError, match="replaced or removed explicitly"):
        spec_service.resolve_values(target, existing, {}, carry_over=False)

    # An explicit replacement is accepted.
    merged = spec_service.resolve_values(
        target,
        existing,
        {"socket": (SelectedOption(9, "LGA1700", 1),)},
        carry_over=False,
    )
    assert merged == {"socket": (SelectedOption(9, "LGA1700", 1),)}

    # An explicit removal is accepted too.
    optional = [_definition("socket", "string")]
    assert (
        spec_service.resolve_values(
            optional, existing, {}, ["socket"], carry_over=False
        )
        == {}
    )


def test_a_stored_code_of_the_previous_category_must_be_removed_explicitly() -> None:
    target = [_definition("chipset", "string", category_slug="mobo")]
    existing = {"vram_gb": (SelectedOption(1, "12 ГБ", 1),)}
    with pytest.raises(InvalidInputError, match="replaced or removed explicitly"):
        spec_service.resolve_values(target, existing, {}, carry_over=False)
    assert (
        spec_service.resolve_values(target, existing, {}, ["vram_gb"], carry_over=False)
        == {}
    )


def test_a_replacement_may_not_also_be_removed() -> None:
    """Neither side of a conflicting request may silently win."""
    definitions = [_definition("chipset", "string")]
    existing = {"chipset": (SelectedOption(1, "AMD B650", 1),)}
    replacement = {"chipset": (SelectedOption(2, "AMD X670", 1),)}
    with pytest.raises(InvalidInputError, match="replaced and removed") as raised:
        spec_service.resolve_values(definitions, existing, replacement, ["chipset"])
    # The API maps an `InvalidInputError` to 422 through the shared handler.
    assert raised.value.status_code == 422
    # Even a value that is not stored yet cannot be both written and removed.
    with pytest.raises(InvalidInputError, match="replaced and removed"):
        spec_service.resolve_values(definitions, {}, replacement, ["chipset"])


def test_a_conflicting_transition_is_rejected_before_any_merge() -> None:
    """A category change with a replace+remove pair of one code is refused."""
    target = [_definition("socket", "string")]
    existing = {"socket": (SelectedOption(1, "AM5", 1),)}
    replacement = {"socket": (SelectedOption(9, "LGA1700", 1),)}
    with pytest.raises(InvalidInputError, match="replaced and removed"):
        spec_service.resolve_values(
            target, existing, replacement, ["socket"], carry_over=False
        )


def test_unrelated_replacements_and_removals_still_merge() -> None:
    """Only the intersection is refused; disjoint lists keep working."""
    definitions = [_definition("socket", "string"), _definition("chipset", "string")]
    existing = {
        "socket": (SelectedOption(1, "AM5", 1),),
        "chipset": (SelectedOption(2, "AMD B650", 1),),
    }
    merged = spec_service.resolve_values(
        definitions,
        existing,
        {"socket": (SelectedOption(3, "AM4", 1),)},
        ["chipset"],
    )
    assert merged == {"socket": (SelectedOption(3, "AM4", 1),)}


# ── Serialization of the editor payload ─────────────────────────────────────


def test_editor_payload_exposes_ids_editor_limits_and_the_full_dictionary() -> None:
    scalar = _definition("socket", "string", sort_order=0)
    connectors = _definition(
        "required_power_connectors", "string_list", sort_order=1, category_slug="gpu"
    )
    dimensions = _definition(
        "dimensions_mm", "number_list", unit="мм", sort_order=2, category_slug="gpu"
    )
    dictionary = {
        scalar.id: [DictionaryOption(1, scalar.id, "AM5")],
        connectors.id: [DictionaryOption(2, connectors.id, "PCIe 8-pin")],
        dimensions.id: [DictionaryOption(3, dimensions.id, "307 × 125 × 46 мм")],
    }
    fields = spec_service.serialize_definition_fields(
        [scalar, connectors, dimensions], dictionary
    )
    assert [field["code"] for field in fields] == [
        "socket",
        "required_power_connectors",
        "dimensions_mm",
    ]
    assert fields[0]["editor"] == spec_service.EDITOR_SELECT
    assert fields[0]["limits"]["max_selections"] == 1
    assert fields[0]["limits"]["repeatable"] is False
    assert fields[0]["options"] == [{"option_id": 1, "value": "AM5"}]
    assert fields[1]["editor"] == spec_service.EDITOR_CONNECTORS
    assert fields[1]["limits"]["repeatable"] is True
    assert fields[1]["limits"]["max_quantity"] == spec_service.MAX_QUANTITY
    assert fields[2]["editor"] == spec_service.EDITOR_DIMENSIONS
    assert fields[2]["limits"]["dimensions"] == {
        "count": 3,
        "unit": "мм",
        "max_value": "1000",
        "decimal_places": 2,
    }
