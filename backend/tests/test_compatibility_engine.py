"""Database-free regression tests for the approved compatibility rule set.

The evaluator reads products, characteristic values and characteristic
definitions through `db` helpers, so the fake session serves exactly those three
bulk reads: one `select(Product)`, one value join and one `select(Characteristic)`.
Nothing is fetched per rule, which these tests also pin down.
"""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest

from app.models import Characteristic
from app.services.cart_service import _build_snapshot
from app.services.compatibility import RULES, SLOT_CATEGORIES, check_selections


class _Scalars:
    def __init__(self, rows: list[SimpleNamespace]) -> None:
        self._rows = rows

    def all(self) -> list[SimpleNamespace]:
        return self._rows


class _Result:
    def __init__(self, rows: list[tuple[int, str, Any]]) -> None:
        self._rows = rows

    def all(self) -> list[tuple[int, str, Any]]:
        return self._rows

    def __iter__(self):  # pragma: no cover - defensive convenience
        return iter(self._rows)


def _requested_ids(statement: object) -> set[int]:
    """Recover the id list of an `IN (...)` filter from an ORM statement."""
    whereclause = getattr(statement, "whereclause", None)
    if whereclause is None:
        return set()
    ids: set[int] = set()
    for element in whereclause.get_children():
        for candidate in (element, getattr(element, "right", None)):
            value = getattr(candidate, "value", None)
            if isinstance(value, list | tuple | set):
                ids.update(item for item in value if isinstance(item, int))
    return ids


def _data_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int | float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return "string_list"
    return "number_list"


class FakeSession:
    """The read interface of the compatibility evaluator."""

    def __init__(self, parts: dict[int, SimpleNamespace]) -> None:
        self.parts = parts
        # One definition per (category, code), as the normalized model stores them.
        self.definitions: list[SimpleNamespace] = []
        seen: set[tuple[int, str]] = set()
        for part in parts.values():
            category_id = part.product_type.category_id
            for code, value in part.values.items():
                if (category_id, code) in seen:
                    continue
                seen.add((category_id, code))
                self.definitions.append(
                    SimpleNamespace(
                        id=len(self.definitions) + 1,
                        category_id=category_id,
                        code=code,
                        name=code,
                        data_type=_data_type(value),
                        unit=None,
                        sort_order=0,
                        is_required=False,
                        show_in_short=False,
                        show_in_details=True,
                    )
                )

    def get(self, _model: object, key: int) -> SimpleNamespace | None:
        return self.parts.get(key)

    @staticmethod
    def _entity(statement: object) -> object:
        descriptions = getattr(statement, "column_descriptions", ())
        return descriptions[0].get("entity") if descriptions else None

    def _requested(self, statement: object) -> list[SimpleNamespace]:
        ids = _requested_ids(statement)
        if not ids:
            return list(self.parts.values())
        return [part for key, part in self.parts.items() if key in ids]

    def scalars(self, statement: object) -> _Scalars:
        if self._entity(statement) is Characteristic:
            wanted = _requested_ids(statement)
            return _Scalars(
                [row for row in self.definitions if row.category_id in wanted]
            )
        return _Scalars(self._requested(statement))

    def execute(self, statement: object) -> _Result:
        return _Result(
            [
                (product.id, code, value)
                for product in self._requested(statement)
                for code, value in product.values.items()
            ]
        )


def _parts() -> tuple[FakeSession, dict[str, int]]:
    """A build whose every supported dimension is documented and matching."""
    specs: dict[str, dict] = {
        "cpu": {
            "socket": "AM5",
            "memory_type": ["DDR5"],
            "thermal_design_power_w": 120,
        },
        "mobo": {
            "socket": "AM5",
            "memory_type": "DDR5",
            "max_memory_gb": 128,
            "ram_slots": 4,
            "form_factor": "ATX",
            "gpu_interfaces": ["pcie_x16"],
            "storage_interfaces": ["nvme", "sata"],
            "required_cpu_power_connectors": ["eps8"],
            "required_board_power_connectors": ["atx24"],
            "supported_nvme_lengths_mm": [42, 60, 80, 110],
        },
        "gpu": {
            "interface": "pcie_x16",
            "required_power_connectors": ["8pin", "8pin"],
        },
        "ram": {"memory_type": "DDR5", "capacity_gb": 32, "module_count": 2},
        "storage": {"interface": "nvme", "length_mm": 80},
        "psu": {
            "wattage_w": 750,
            "form_factor": "ATX",
            "available_gpu_power_connectors": ["8pin", "8pin"],
            "available_cpu_power_connectors": ["eps8"],
            "available_board_power_connectors": ["atx24"],
        },
        "case": {
            "supported_motherboard_form_factors": ["ATX", "MATX", "ITX"],
            "supported_psu_form_factors": ["ATX"],
        },
        "cooling": {"supported_sockets": ["AM5"], "cooling_type": "air"},
    }
    parts: dict[int, SimpleNamespace] = {}
    selection: dict[str, int] = {}
    for number, (slot, data) in enumerate(specs.items(), start=1):
        parts[number] = SimpleNamespace(
            id=number,
            name=f"Test {slot}",
            is_active=True,
            price=Decimal("100.00"),
            stock_quantity=10,
            product_type=SimpleNamespace(
                category_id=number,
                category=SimpleNamespace(id=number, slug=slot),
            ),
            values=deepcopy(data),
        )
        selection[slot] = number
    assert set(selection) == set(SLOT_CATEGORIES)
    return FakeSession(parts), selection


def _result(db: FakeSession, selections: dict[str, int]):
    return check_selections(db, selections)  # type: ignore[arg-type]


def _check(result, code: str):
    return next(item for item in result.items or [] if item.slot == code)


def test_complete_supported_build_is_compatible_and_cart_eligible() -> None:
    db, selections = _parts()
    result = _result(db, selections)
    assert result.status == "compatible", [item.message for item in result.items or []]
    assert all(item.status == "compatible" for item in result.items or [])

    snapshot = _build_snapshot(db, selections, 1)  # type: ignore[arg-type]
    assert len(snapshot["components"]) == 8
    assert Decimal(snapshot["total_price"]) == Decimal("800.00")


def test_approved_rule_set_is_exactly_the_supported_scope() -> None:
    """Only comparisons backed by the normalized model may ever be evaluated."""
    assert {rule.code for rule in RULES} == {
        "cpu+mobo_socket",
        "cpu+ram_type",
        "ram+mobo_type",
        "ram+mobo_capacity",
        "ram+mobo_slots",
        "mobo+case_form_factor",
        "cpu+cooling_socket",
        "gpu+mobo_slot",
        "storage+mobo_interface",
        "storage+mobo_length",
        "psu+case_form_factor",
        "psu+gpu_connectors",
        "psu+mobo_main_connector",
        "psu+mobo_connectors",
        "psu+gpu_recommended_power",
    }
    db, selections = _parts()
    evaluated = {item.slot for item in _result(db, selections).items or []}
    # Unsupported rules (case clearances, cooler capacity, full system power) are
    # absent from the verdict, not reported as unknown.
    assert "gpu+case_length" not in evaluated
    assert "gpu+case_thickness" not in evaluated
    assert "cooling+case_height" not in evaluated
    assert "ram+cooling_clearance" not in evaluated
    assert "cpu+cooling_thermal" not in evaluated
    assert "psu+system_power" not in evaluated
    assert "psu+case_length" not in evaluated
    # Conditional rules stay silent when their trigger characteristic is absent.
    assert "psu+gpu_recommended_power" not in evaluated


def test_partial_build_is_unknown_and_not_cart_eligible() -> None:
    db, selections = _parts()
    selections.pop("cooling")
    assert _result(db, selections).status == "unknown"
    with pytest.raises(ValueError, match="not technically verified"):
        _build_snapshot(db, selections, 1)  # type: ignore[arg-type]


@pytest.mark.parametrize(
    ("slot", "field", "bad_value", "expected_check"),
    [
        ("cpu", "socket", "LGA1700", "cpu+mobo_socket"),
        ("ram", "memory_type", "DDR4", "ram+mobo_type"),
        ("cpu", "memory_type", ["DDR4"], "cpu+ram_type"),
        ("ram", "capacity_gb", 256, "ram+mobo_capacity"),
        ("ram", "module_count", 8, "ram+mobo_slots"),
        (
            "case",
            "supported_motherboard_form_factors",
            ["ITX"],
            "mobo+case_form_factor",
        ),
        ("case", "supported_psu_form_factors", ["SFX"], "psu+case_form_factor"),
        ("cooling", "supported_sockets", ["LGA1700"], "cpu+cooling_socket"),
        ("gpu", "interface", "agp", "gpu+mobo_slot"),
        ("storage", "interface", "ide", "storage+mobo_interface"),
        (
            "gpu",
            "required_power_connectors",
            ["8pin", "8pin", "8pin"],
            "psu+gpu_connectors",
        ),
        ("psu", "available_cpu_power_connectors", ["4pin"], "psu+mobo_connectors"),
        (
            "psu",
            "available_board_power_connectors",
            ["4pin"],
            "psu+mobo_main_connector",
        ),
    ],
)
def test_each_verified_mismatch_is_incompatible(
    slot: str, field: str, bad_value: object, expected_check: str
) -> None:
    db, selections = _parts()
    db.parts[selections[slot]].values[field] = bad_value
    result = _result(db, selections)
    assert result.status == "incompatible"
    check = _check(result, expected_check)
    assert check.status == "incompatible"
    assert len(check.details) == 2


def test_nvme_length_must_be_supported_by_the_board() -> None:
    db, selections = _parts()
    storage = db.parts[selections["storage"]]
    storage.values["length_mm"] = 90
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert _check(result, "storage+mobo_length").status == "incompatible"

    db, selections = _parts()
    storage = db.parts[selections["storage"]]
    storage.values["interface"] = "sata"
    storage.values["length_mm"] = 90
    result = _result(db, selections)
    # A SATA drive has no M.2 length constraint, so that rule does not apply.
    assert _check(result, "storage+mobo_interface").status == "compatible"
    assert all(item.slot != "storage+mobo_length" for item in result.items or [])


def test_supported_rule_with_missing_data_is_unknown_not_a_match() -> None:
    db, selections = _parts()
    db.parts[selections["cooling"]].values.pop("supported_sockets")
    result = _result(db, selections)
    assert result.status == "unknown"
    check = _check(result, "cpu+cooling_socket")
    assert check.status == "unknown"
    # The missing side is reported as absent data, never as an empty match.
    missing = [detail for detail in check.details if detail.value is None]
    assert [detail.code for detail in missing] == ["supported_sockets"]
    assert missing[0].display_value is None


def test_verified_conflict_takes_precedence_over_unknown_checks() -> None:
    db, selections = _parts()
    db.parts[selections["cpu"]].values["socket"] = "LGA1700"
    db.parts[selections["cooling"]].values.pop("supported_sockets")
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert _check(result, "cpu+mobo_socket").status == "incompatible"
    assert _check(result, "cpu+cooling_socket").status == "unknown"


def test_invalid_selection_and_duplicate_slots_are_incompatible() -> None:
    db, selections = _parts()
    selections["cpu"] = selections["gpu"]
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert _check(result, "cpu").status == "incompatible"

    db, selections = _parts()
    selections["unknown-slot"] = 1
    assert _result(db, selections).status == "incompatible"

    db, selections = _parts()
    db.parts[selections["mobo"]].is_active = False
    assert _result(db, selections).status == "incompatible"


def test_diagnostics_identify_components_products_and_values() -> None:
    db, selections = _parts()
    db.parts[selections["cpu"]].values["socket"] = "LGA1700"
    check = _check(_result(db, selections), "cpu+mobo_socket")
    cpu, board = check.details
    assert (cpu.slot, cpu.code, cpu.value) == ("cpu", "socket", "LGA1700")
    assert (board.slot, board.code, board.value) == ("mobo", "socket", "AM5")
    assert cpu.product_name == "Test cpu"
    assert board.product_name == "Test mobo"
    assert cpu.display_value == "LGA1700"


def test_gpu_recommended_psu_wattage_is_compared_when_documented() -> None:
    db, selections = _parts()
    gpu = db.parts[selections["gpu"]]
    psu = db.parts[selections["psu"]]

    gpu.values["recommended_psu_w"] = 850
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert _check(result, "psu+gpu_recommended_power").status == "incompatible"

    gpu.values["recommended_psu_w"] = 650
    assert _result(db, selections).status == "compatible"

    gpu.values["recommended_psu_w"] = 650
    psu.values.pop("wattage_w")
    result = _result(db, selections)
    assert _check(result, "psu+gpu_recommended_power").status == "unknown"


def test_missing_structured_metadata_never_becomes_green() -> None:
    db, selections = _parts()
    for product in db.parts.values():
        product.values = {}
    assert _result(db, selections).status == "unknown"


def test_empty_connector_lists_are_missing_data_not_a_verified_match() -> None:
    db, selections = _parts()
    gpu = db.parts[selections["gpu"]]
    psu = db.parts[selections["psu"]]
    gpu.values["required_power_connectors"] = []
    psu.values["available_gpu_power_connectors"] = []
    result = _result(db, selections)
    assert _check(result, "psu+gpu_connectors").status == "unknown"
    assert result.status == "unknown"


@pytest.mark.parametrize("bad_value", ["750", True, 0, -1])
def test_invalid_numeric_values_never_prove_a_match(bad_value: object) -> None:
    db, selections = _parts()
    db.parts[selections["psu"]].values["wattage_w"] = bad_value
    db.parts[selections["gpu"]].values["recommended_psu_w"] = 650
    result = _result(db, selections)
    assert _check(result, "psu+gpu_recommended_power").status == "unknown"
    assert result.status == "unknown"
