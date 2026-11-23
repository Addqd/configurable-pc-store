"""Server-side component compatibility, based on explicit structured evidence.

Only values of the normalized `product_characteristics` tables are considered,
addressed by characteristic `code`. A missing, malformed, or unverified dimension
gives ``unknown``, never a false positive. Nothing is inferred from product names
or marketing strings.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Product, ProductType, SavedBuild, SavedBuildItem
from app.services import spec_service

SLOT_CATEGORIES: dict[str, frozenset[str]] = {
    "cpu": frozenset({"cpu"}),
    "mobo": frozenset({"mobo"}),
    "gpu": frozenset({"gpu"}),
    "ram": frozenset({"ram"}),
    "storage": frozenset({"storage", "hdd"}),
    "psu": frozenset({"psu"}),
    "case": frozenset({"case"}),
    "cooling": frozenset({"cooling"}),
}

# Conservative engineering margin over *documented maximum DC loads*.
# It does not invent component power usage; missing load data remains unknown.
POWER_MARGIN = Decimal("1.20")


@dataclass
class CompatibilityResult:
    product_id: int
    slot: str
    status: str
    message: str | None = None
    items: list[CompatibilityResult] | None = None
    product_name: str = ""

    @property
    def is_compatible(self) -> bool:
        return self.status == "compatible"

    @property
    def is_incompatible(self) -> bool:
        return self.status == "incompatible"


def _evaluate_slot(
    product: Product | None, product_id: int, slot: str
) -> CompatibilityResult:
    """Validate availability and category, not just a caller-provided slot name."""
    if slot not in SLOT_CATEGORIES:
        return CompatibilityResult(
            product_id, slot, "incompatible", "Invalid component slot"
        )
    if product is None or not product.is_active:
        return CompatibilityResult(
            product_id, slot, "incompatible", "Product not available"
        )
    category = product.product_type.category.slug
    if category not in SLOT_CATEGORIES[slot]:
        return CompatibilityResult(
            product_id,
            slot,
            "incompatible",
            "Product category does not match slot",
            product_name=product.name,
        )
    return CompatibilityResult(
        product_id,
        slot,
        "compatible",
        "Product belongs to required category",
        product_name=product.name,
    )


def check_slot_compatibility(
    db: Session, product_id: int, slot: str
) -> CompatibilityResult:
    """Validate one selection without loading the whole build."""
    if slot not in SLOT_CATEGORIES:
        return _evaluate_slot(None, product_id, slot)
    return _evaluate_slot(db.get(Product, product_id), product_id, slot)


def _load_products(db: Session, product_ids: list[int]) -> dict[int, Product]:
    """Load every selected product, its type and category in one query."""
    if not product_ids:
        return {}
    rows = db.scalars(
        select(Product)
        .where(Product.id.in_(product_ids))
        .options(selectinload(Product.product_type).selectinload(ProductType.category))
    ).all()
    return {product.id: product for product in rows}


# One product's characteristic values, keyed by characteristic code.
Values = dict[str, Any]


def _raw(values: Values, code: str) -> Any:
    """Read one structured characteristic without inferring anything elsewhere."""
    return values.get(code)


def _text(values: Values, code: str) -> str | None:
    value = _raw(values, code)
    if isinstance(value, str) and value.strip():
        return value.strip().casefold()
    return None


def _values(
    values: Values, code: str, *, allow_empty: bool = False
) -> list[str] | None:
    value = _raw(values, code)
    if not isinstance(value, list) or (not value and not allow_empty):
        return None
    if any(not isinstance(x, str) or not x.strip() for x in value):
        return None
    return [x.strip().casefold() for x in value]


def _decimal(value: Any) -> Decimal | None:
    # Reject booleans and numbers-as-strings; NaN/Infinity are not finite.
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def _number(values: Values, code: str) -> Decimal | None:
    result = _decimal(_raw(values, code))
    return result if result is not None and result > 0 else None


def _nonnegative(values: Values, code: str) -> Decimal | None:
    """Allow documented zero draw for passive cooling or unpowered cases."""
    result = _decimal(_raw(values, code))
    return result if result is not None and result >= 0 else None


def _size_list(values: Values, code: str) -> list[Decimal] | None:
    raw = _raw(values, code)
    if not isinstance(raw, list) or not raw:
        return None
    sizes: list[Decimal] = []
    for item in raw:
        size = _decimal(item)
        if size is None or size <= 0:
            return None
        sizes.append(size)
    return sizes


def _record(
    results: list[CompatibilityResult],
    label: str,
    ok: bool | None,
    detail: str,
) -> None:
    if ok is None:
        status = "unknown"
    else:
        status = "compatible" if ok else "incompatible"
    results.append(CompatibilityResult(0, label, status, detail))


def _equals(
    results: list[CompatibilityResult],
    label: str,
    left: str | None,
    right: str | None,
) -> None:
    ok = None if left is None or right is None else left == right
    _record(results, label, ok, f"{label}: matching values required")


def _member(
    results: list[CompatibilityResult],
    label: str,
    item: str | None,
    supported: list[str] | None,
) -> None:
    ok = None if item is None or supported is None else item in supported
    _record(results, label, ok, f"{label}: explicit supported list required")


def _fits(
    results: list[CompatibilityResult],
    label: str,
    requirement: Decimal | None,
    limit: Decimal | None,
) -> None:
    ok = None if requirement is None or limit is None else requirement <= limit
    _record(results, label, ok, f"{label}: verified numeric limits required")


def _connectors(
    results: list[CompatibilityResult],
    label: str,
    required: list[str] | None,
    available: list[str] | None,
) -> None:
    ok = (
        None
        if required is None or available is None
        else not (Counter(required) - Counter(available))
    )
    _record(results, label, ok, f"{label}: connector counts and types must match")


def _power(products: dict[str, Values], results: list[CompatibilityResult]) -> None:
    """Compare complete documented maximum loads against the PSU output budget."""
    capacity = _number(products["psu"], "wattage_w")
    slots = ("cpu", "mobo", "gpu", "ram", "storage", "cooling", "case")
    loads = [
        _nonnegative(products[slot], "max_power_draw_w")
        if slot in ("case", "cooling")
        else _number(products[slot], "max_power_draw_w")
        for slot in slots
    ]
    if capacity is None or any(load is None for load in loads):
        _record(
            results,
            "psu+system_power",
            None,
            "Verified maximum DC power for every non-PSU part and PSU output required",
        )
        return
    total = sum((load for load in loads if load is not None), Decimal(0))
    required = total * POWER_MARGIN
    _record(
        results,
        "psu+system_power",
        required <= capacity,
        f"Maximum DC draw {total} W; with 20% margin {required} W; PSU {capacity} W",
    )


def check_selections(
    db: Session, selections: dict[str, int], build_id: int = 0
) -> CompatibilityResult:
    """Return compatible only if all eight parts and every modeled check pass."""
    results: list[CompatibilityResult] = []
    products = _load_products(db, list(dict.fromkeys(selections.values())))
    selected_products: dict[str, Product] = {}
    for slot, product_id in selections.items():
        product = products.get(product_id)
        result = _evaluate_slot(product, product_id, slot)
        results.append(result)
        if result.is_compatible and product is not None:
            selected_products[slot] = product
    # One bulk query for all values: definitions are never fetched per rule.
    values = spec_service.load_values(
        db, list({product.id for product in selected_products.values()})
    )
    selected: dict[str, Values] = {
        slot: values.get(product.id, {}) for slot, product in selected_products.items()
    }

    for slot in sorted(set(SLOT_CATEGORIES) - set(selections)):
        _record(results, slot, None, "Required component is missing")

    # A malformed/incorrect selection is incompatible, even if other data is missing.
    if len(selected) == len(SLOT_CATEGORIES):
        cpu = selected["cpu"]
        board = selected["mobo"]
        memory = selected["ram"]
        gpu = selected["gpu"]
        storage = selected["storage"]
        psu = selected["psu"]
        chassis = selected["case"]
        cooler = selected["cooling"]

        _equals(
            results, "cpu+mobo_socket", _text(cpu, "socket"), _text(board, "socket")
        )
        _member(
            results,
            "cpu+mobo_bios_support",
            _text(cpu, "model_id"),
            _values(board, "supported_cpu_models"),
        )
        _equals(
            results,
            "ram+mobo_type",
            _text(memory, "memory_type"),
            _text(board, "memory_type"),
        )
        _fits(
            results,
            "ram+mobo_capacity",
            _number(memory, "capacity_gb"),
            _number(board, "max_memory_gb"),
        )
        _fits(
            results,
            "ram+mobo_slots",
            _number(memory, "module_count"),
            _number(board, "ram_slots"),
        )
        _member(
            results,
            "mobo+case_form_factor",
            _text(board, "form_factor"),
            _values(chassis, "supported_motherboard_form_factors"),
        )
        _member(
            results,
            "cpu+cooling_socket",
            _text(cpu, "socket"),
            _values(cooler, "supported_sockets"),
        )
        _fits(
            results,
            "cpu+cooling_thermal",
            _number(cpu, "thermal_design_power_w"),
            _number(cooler, "cooling_capacity_w"),
        )
        cooling_type = _text(cooler, "cooling_type")
        if cooling_type == "air":
            _fits(
                results,
                "cooling+case_height",
                _number(cooler, "height_mm"),
                _number(chassis, "max_cooler_height_mm"),
            )
        elif cooling_type == "liquid":
            size = _number(cooler, "radiator_size_mm")
            supported = _size_list(chassis, "supported_radiator_sizes_mm")
            ok = None if size is None or supported is None else size in supported
            _record(
                results,
                "cooling+case_radiator",
                ok,
                "Explicit radiator mounting support is required",
            )
        else:
            _record(results, "cooling+case_mount", None, "Unknown cooling type")
        if cooling_type == "air":
            _fits(
                results,
                "ram+cooling_clearance",
                _number(memory, "height_mm"),
                _number(cooler, "ram_clearance_mm"),
            )
        _fits(
            results,
            "gpu+case_length",
            _number(gpu, "length_mm"),
            _number(chassis, "max_gpu_length_mm"),
        )
        _fits(
            results,
            "gpu+case_thickness",
            _number(gpu, "thickness_slots"),
            _number(chassis, "max_gpu_thickness_slots"),
        )
        _member(
            results,
            "gpu+mobo_slot",
            _text(gpu, "interface"),
            _values(board, "gpu_interfaces"),
        )
        _member(
            results,
            "storage+mobo_interface",
            _text(storage, "interface"),
            _values(board, "storage_interfaces"),
        )
        storage_type = _text(storage, "interface")
        if storage_type == "nvme":
            length = _number(storage, "length_mm")
            supported = _size_list(board, "supported_nvme_lengths_mm")
            ok = None if length is None or supported is None else length in supported
            _record(results, "storage+mobo_length", ok, "Verified M.2 lengths required")
        elif storage_type == "sata":
            _member(
                results,
                "storage+case_bay",
                _text(storage, "drive_form_factor"),
                _values(chassis, "supported_drive_form_factors"),
            )
        elif storage_type is None:
            _record(results, "storage+physical_fit", None, "Storage type unknown")
        _member(
            results,
            "psu+case_form_factor",
            _text(psu, "form_factor"),
            _values(chassis, "supported_psu_form_factors"),
        )
        _fits(
            results,
            "psu+case_length",
            _number(psu, "length_mm"),
            _number(chassis, "max_psu_length_mm"),
        )
        _connectors(
            results,
            "psu+gpu_connectors",
            _values(gpu, "required_power_connectors", allow_empty=True),
            _values(psu, "available_gpu_power_connectors", allow_empty=True),
        )
        _connectors(
            results,
            "psu+mobo_main_connector",
            _values(board, "required_board_power_connectors", allow_empty=True),
            _values(psu, "available_board_power_connectors", allow_empty=True),
        )
        _connectors(
            results,
            "psu+mobo_connectors",
            _values(board, "required_cpu_power_connectors", allow_empty=True),
            _values(psu, "available_cpu_power_connectors", allow_empty=True),
        )
        _power(selected, results)

    if any(item.is_incompatible for item in results):
        status = "incompatible"
        message = "A verified incompatibility was found"
    elif len(selected) != len(SLOT_CATEGORIES) or any(
        item.status == "unknown" for item in results
    ):
        status = "unknown"
        message = "Compatibility cannot be verified with available technical data"
    else:
        status = "compatible"
        message = "All documented compatibility checks passed"
    return CompatibilityResult(build_id, f"build_{build_id}", status, message, results)


def check_build_compatibility(db: Session, build: SavedBuild) -> CompatibilityResult:
    """Evaluate the saved build with the same rules used by cart validation."""
    items = db.scalars(
        select(SavedBuildItem).where(SavedBuildItem.build_id == build.id)
    ).all()
    return check_selections(
        db, {item.slot: item.product_id for item in items}, build.id
    )
