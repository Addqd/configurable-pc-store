"""Database-free regression tests for the verified compatibility rule set."""

from __future__ import annotations

from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.services.cart_service import _build_snapshot
from app.services.compatibility import SLOT_CATEGORIES, check_selections


class FakeSession:
    """Only the read interface needed by the pure compatibility evaluator."""

    def __init__(self, parts: dict[int, SimpleNamespace]) -> None:
        self.parts = parts

    def get(self, _model: object, key: int) -> SimpleNamespace | None:
        return self.parts.get(key)


def _parts() -> tuple[FakeSession, dict[str, int]]:
    specs: dict[str, dict] = {
        "cpu": {
            "socket": "AM5",
            "model_id": "ryzen-7-7800x3d",
            "thermal_design_power_w": 120,
            "max_power_draw_w": 120,
        },
        "mobo": {
            "socket": "AM5",
            "supported_cpu_models": ["ryzen-7-7800x3d"],
            "memory_type": "DDR5",
            "max_memory_gb": 128,
            "ram_slots": 4,
            "form_factor": "ATX",
            "gpu_interfaces": ["pcie_x16"],
            "storage_interfaces": ["nvme", "sata"],
            "required_cpu_power_connectors": ["eps8"],
            "required_board_power_connectors": ["atx24"],
            "supported_nvme_lengths_mm": [42, 60, 80, 110],
            "max_power_draw_w": 45,
        },
        "gpu": {
            "interface": "pcie_x16",
            "length_mm": 310,
            "thickness_slots": 3,
            "required_power_connectors": ["8pin", "8pin"],
            "max_power_draw_w": 250,
        },
        "ram": {
            "memory_type": "DDR5",
            "capacity_gb": 32,
            "module_count": 2,
            "max_power_draw_w": 12,
            "height_mm": 35,
        },
        "storage": {
            "interface": "nvme",
            "max_power_draw_w": 8,
            "length_mm": 80,
        },
        "psu": {
            "wattage_w": 750,
            "form_factor": "ATX",
            "length_mm": 150,
            "available_gpu_power_connectors": ["8pin", "8pin"],
            "available_cpu_power_connectors": ["eps8"],
            "available_board_power_connectors": ["atx24"],
        },
        "case": {
            "supported_motherboard_form_factors": ["ATX", "MATX", "ITX"],
            "max_gpu_length_mm": 360,
            "max_gpu_thickness_slots": 4,
            "max_cooler_height_mm": 170,
            "supported_radiator_sizes_mm": [240, 360],
            "supported_psu_form_factors": ["ATX"],
            "max_psu_length_mm": 180,
            "supported_drive_form_factors": ["2.5", "3.5"],
            "max_power_draw_w": 5,
        },
        "cooling": {
            "supported_sockets": ["AM5"],
            "cooling_capacity_w": 180,
            "cooling_type": "air",
            "height_mm": 155,
            "ram_clearance_mm": 40,
            "max_power_draw_w": 5,
        },
    }
    parts: dict[int, SimpleNamespace] = {}
    selection: dict[str, int] = {}
    for number, (slot, data) in enumerate(specs.items(), start=1):
        category = "storage" if slot == "storage" else slot
        parts[number] = SimpleNamespace(
            id=number,
            name=f"Test {slot}",
            is_active=True,
            price=Decimal("100.00"),
            stock_quantity=10,
            product_type=SimpleNamespace(category=SimpleNamespace(slug=category)),
            technical_specs=deepcopy(data),
        )
        selection[slot] = number
    assert set(selection) == set(SLOT_CATEGORIES)
    return FakeSession(parts), selection


def _result(db: FakeSession, selections: dict[str, int]):
    return check_selections(db, selections)  # type: ignore[arg-type]


def test_complete_verified_build_is_compatible_and_cart_eligible() -> None:
    db, selections = _parts()
    result = _result(db, selections)
    assert result.status == "compatible"
    assert result.items
    assert all(item.status == "compatible" for item in result.items)

    snapshot = _build_snapshot(db, selections, 1)  # type: ignore[arg-type]
    assert len(snapshot["components"]) == 8
    assert Decimal(snapshot["total_price"]) == Decimal("800.00")


def test_partial_or_unverified_build_stays_unknown() -> None:
    db, selections = _parts()
    selections.pop("cooling")
    assert _result(db, selections).status == "unknown"
    with pytest.raises(ValueError, match="not technically verified"):
        _build_snapshot(db, selections, 1)  # type: ignore[arg-type]

    db, selections = _parts()
    db.parts[selections["gpu"]].technical_specs.pop("length_mm")
    result = _result(db, selections)
    assert result.status == "unknown"
    assert any(
        item.slot == "gpu+case_length" and item.status == "unknown"
        for item in result.items or []
    )


def test_wrong_slot_and_confirmed_conflict_precede_unknown() -> None:
    db, selections = _parts()
    selections["cpu"] = selections["gpu"]
    assert _result(db, selections).status == "incompatible"

    db, selections = _parts()
    db.parts[selections["cpu"]].technical_specs["socket"] = "LGA1700"
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert any(
        item.slot == "cpu+mobo_socket" and item.status == "incompatible"
        for item in result.items or []
    )


@pytest.mark.parametrize(
    ("slot", "field", "bad_value", "expected_check"),
    [
        ("mobo", "supported_cpu_models", ["other-cpu"], "cpu+mobo_bios_support"),
        ("ram", "memory_type", "DDR4", "ram+mobo_type"),
        ("ram", "capacity_gb", 256, "ram+mobo_capacity"),
        ("ram", "module_count", 8, "ram+mobo_slots"),
        (
            "case",
            "supported_motherboard_form_factors",
            ["ITX"],
            "mobo+case_form_factor",
        ),
        ("cooling", "supported_sockets", ["LGA1700"], "cpu+cooling_socket"),
        ("cooling", "cooling_capacity_w", 65, "cpu+cooling_thermal"),
        ("cooling", "height_mm", 180, "cooling+case_height"),
        ("gpu", "length_mm", 390, "gpu+case_length"),
        ("ram", "height_mm", 50, "ram+cooling_clearance"),
        ("storage", "length_mm", 90, "storage+mobo_length"),
        ("gpu", "thickness_slots", 5, "gpu+case_thickness"),
        ("gpu", "interface", "agp", "gpu+mobo_slot"),
        ("storage", "interface", "ide", "storage+mobo_interface"),
        ("psu", "form_factor", "sfx", "psu+case_form_factor"),
        ("psu", "length_mm", 200, "psu+case_length"),
        ("psu", "available_gpu_power_connectors", ["8pin"], "psu+gpu_connectors"),
        ("psu", "available_cpu_power_connectors", ["4pin"], "psu+mobo_connectors"),
        (
            "psu",
            "available_board_power_connectors",
            ["4pin"],
            "psu+mobo_main_connector",
        ),
        ("psu", "wattage_w", 400, "psu+system_power"),
    ],
)
def test_each_proven_mismatch_is_incompatible(
    slot: str, field: str, bad_value: object, expected_check: str
) -> None:
    db, selections = _parts()
    db.parts[selections[slot]].technical_specs[field] = bad_value
    result = _result(db, selections)
    assert result.status == "incompatible"
    assert any(
        item.slot == expected_check and item.status == "incompatible"
        for item in result.items or []
    )


def test_liquid_radiator_mounting_is_checked() -> None:
    db, selections = _parts()
    cooler = db.parts[selections["cooling"]]
    cooler.technical_specs["cooling_type"] = "liquid"
    cooler.technical_specs["radiator_size_mm"] = 240
    assert _result(db, selections).status == "compatible"
    cooler.technical_specs["radiator_size_mm"] = 280
    assert _result(db, selections).status == "incompatible"
    cooler.technical_specs.pop("radiator_size_mm")
    assert _result(db, selections).status == "unknown"


def test_invalid_power_values_never_prove_safety() -> None:
    db, selections = _parts()
    db.parts[selections["gpu"]].technical_specs["max_power_draw_w"] = "250"
    assert _result(db, selections).status == "unknown"
    db.parts[selections["gpu"]].technical_specs["max_power_draw_w"] = True
    assert _result(db, selections).status == "unknown"


def test_missing_structured_metadata_never_becomes_green() -> None:
    db, selections = _parts()
    for product in db.parts.values():
        product.technical_specs = {}
    assert _result(db, selections).status == "unknown"


def test_sata_drive_bay_is_checked() -> None:
    db, selections = _parts()
    storage = db.parts[selections["storage"]]
    storage.technical_specs["interface"] = "sata"
    storage.technical_specs["drive_form_factor"] = "2.5"
    assert _result(db, selections).status == "compatible"
    storage.technical_specs["drive_form_factor"] = "5.25"
    assert _result(db, selections).status == "incompatible"
    storage.technical_specs.pop("drive_form_factor")
    assert _result(db, selections).status == "unknown"


def test_verified_zero_connector_gpu_and_passive_case_draw() -> None:
    db, selections = _parts()
    gpu = db.parts[selections["gpu"]]
    psu = db.parts[selections["psu"]]
    case = db.parts[selections["case"]]
    gpu.technical_specs["required_power_connectors"] = []
    psu.technical_specs["available_gpu_power_connectors"] = []
    case.technical_specs["max_power_draw_w"] = 0
    assert _result(db, selections).status == "compatible"
