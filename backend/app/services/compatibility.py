"""Fail-closed PC compatibility checks based only on structured catalog metadata."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, SavedBuild, SavedBuildItem

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


def check_slot_compatibility(
    db: Session, product_id: int, slot: str
) -> CompatibilityResult:
    if slot not in SLOT_CATEGORIES:
        return CompatibilityResult(
            product_id, slot, "incompatible", "Invalid component slot"
        )
    product = db.get(Product, product_id)
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


def _spec(product: Product, field: str) -> str | None:
    value = (product.technical_specs or {}).get(field)
    return (
        str(value).strip().casefold()
        if isinstance(value, str) and value.strip()
        else None
    )


def check_selections(
    db: Session, selections: dict[str, int], build_id: int = 0
) -> CompatibilityResult:
    """Never report 'compatible' without complete selections and verified technical evidence."""
    results: list[CompatibilityResult] = []
    incompatible = False
    unknown = False
    products: dict[str, Product] = {}
    for slot, product_id in selections.items():
        result = check_slot_compatibility(db, product_id, slot)
        results.append(result)
        incompatible |= result.status == "incompatible"
        if result.status == "compatible":
            product = db.get(Product, product_id)
            if product is not None:
                products[slot] = product

    missing = set(SLOT_CATEGORIES) - set(selections)
    if missing:
        unknown = True
        for slot in sorted(missing):
            results.append(
                CompatibilityResult(0, slot, "unknown", "Component is missing")
            )

    # Only structured, verified metadata is usable. Never infer sockets from display strings.
    if "cpu" in products and "mobo" in products:
        cpu_socket = _spec(products["cpu"], "socket")
        board_socket = _spec(products["mobo"], "socket")
        if not cpu_socket or not board_socket:
            unknown = True
            results.append(
                CompatibilityResult(0, "cpu+mobo", "unknown", "Socket data unavailable")
            )
        elif cpu_socket != board_socket:
            incompatible = True
            results.append(
                CompatibilityResult(
                    0, "cpu+mobo", "incompatible", "CPU and board sockets differ"
                )
            )
    else:
        unknown = True

    if "ram" in products and "mobo" in products:
        ram = _spec(products["ram"], "memory_type")
        board = _spec(products["mobo"], "memory_type")
        if not ram or not board:
            unknown = True
            results.append(
                CompatibilityResult(
                    0, "ram+mobo", "unknown", "Memory type data unavailable"
                )
            )
        elif ram != board:
            incompatible = True
            results.append(
                CompatibilityResult(
                    0, "ram+mobo", "incompatible", "RAM and board memory types differ"
                )
            )
    else:
        unknown = True

    # There are more physical constraints (power, clearances, board dimensions etc.).
    # All must be validated using sourced structured metadata before a green result.
    for slot in ("gpu", "psu", "case", "cooling", "storage"):
        p = products.get(slot)
        if p is None or not p.technical_specs:
            unknown = True

    if incompatible:
        status, message = "incompatible", "A confirmed incompatibility was detected"
    elif unknown:
        status, message = (
            "unknown",
            "Compatibility cannot be confirmed with available technical data",
        )
    else:
        # Even populated metadata can lack clearance/power checks. Until each rule has a
        # confirmed implementation, do not permit unchecked builds to be purchased.
        status, message = (
            "unknown",
            "Additional verified compatibility rules are required",
        )
    return CompatibilityResult(build_id, f"build_{build_id}", status, message, results)


def check_build_compatibility(db: Session, build: SavedBuild) -> CompatibilityResult:
    items = db.scalars(
        select(SavedBuildItem).where(SavedBuildItem.build_id == build.id)
    ).all()
    return check_selections(
        db, {item.slot: item.product_id for item in items}, build.id
    )
