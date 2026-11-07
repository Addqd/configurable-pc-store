"""Compatibility checking for saved builds."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, SavedBuild, SavedBuildItem


# Compatibility rules based on product_type slugs
# Rules are simplified for demo; real PC building needs more detailed checks.
def _get_product_type_info(db: Session, product_id: int) -> dict | None:
    """Get product type and key attributes for compatibility checks."""
    product = db.execute(
        select(Product)
        .join(Product.product_type)
        .options(
            # type is already loaded via relationship
        )
        .where(Product.id == product_id)
    ).scalar_one_or_none()

    if not product:
        return None

    return {
        "id": product.id,
        "slug": product.slug,
        "name": product.name,
        "product_type_slug": product.product_type.slug,
        "product_type_name": product.product_type.name,
        "category_slug": product.product_type.category.slug,
        "spec_lines": product.spec_lines or [],
        "technical_specs": product.technical_specs or {},
    }


def check_slot_compatibility(
    db: Session,
    product_id: int,
    slot: str,
) -> CompatibilityResult:
    """Check if a product fits a specific slot."""
    info = _get_product_type_info(db, product_id)
    if not info:
        return CompatibilityResult(
            product_id=product_id,
            slot=slot,
            status="incompatible",
            message="Product not found",
        )

    # Basic slot validation: category must match expected types
    category = info["category_slug"]
    expected_categories: dict[str, list[str]] = {
        "cpu": ["cpu"],
        "mobo": ["mobo"],
        "gpu": ["gpu"],
        "ram": ["ram"],
        "storage": ["storage", "hdd"],
        "psu": ["psu"],
        "case": ["case"],
        "cooling": ["cooling"],
    }

    expected = expected_categories.get(slot, [])
    if category not in expected:
        return CompatibilityResult(
            product_id=product_id,
            slot=slot,
            status="incompatible",
            message=f"Product category '{category}' is not suitable for slot '{slot}'",
        )

    return CompatibilityResult(
        product_id=product_id,
        slot=slot,
        status="compatible",
        message="Product matches slot requirements",
    )


def check_build_compatibility(
    db: Session,
    build: SavedBuild,
) -> CompatibilityResult:
    """Check full build compatibility. Returns overall status and per-item details."""
    items = (
        db.execute(select(SavedBuildItem).where(SavedBuildItem.build_id == build.id))
        .scalars()
        .all()
    )

    results: list[CompatibilityResult] = []
    has_incompatible = False

    for item in items:
        result = check_slot_compatibility(db, item.product_id, item.slot)
        results.append(result)
        if result.status == "incompatible":
            has_incompatible = True

    # Additional cross-slot checks
    cpu_item = next((r for r in results if r.slot == "cpu"), None)
    mobo_item = next((r for r in results if r.slot == "mobo"), None)

    if (
        cpu_item
        and mobo_item
        and cpu_item.status == "compatible"
        and mobo_item.status == "compatible"
    ):
        cpu_info = _get_product_type_info(db, cpu_item.product_id)
        mobo_info = _get_product_type_info(db, mobo_item.product_id)

        if cpu_info and mobo_info:
            # Check socket compatibility
            cpu_specs = cpu_info.get("spec_lines", [])
            mobo_specs = mobo_info.get("spec_lines", [])

            cpu_socket = None
            for spec in cpu_specs:
                if "AM" in spec or "LGA" in spec:
                    cpu_socket = spec
                    break

            if cpu_socket:
                socket_found = any(cpu_socket in spec for spec in mobo_specs)
                if not socket_found:
                    # Add note to mobo result
                    mobo_result = next((r for r in results if r.slot == "mobo"), None)
                    if mobo_result:
                        mobo_result.status = "incompatible"
                        mobo_result.message = (
                            f"Socket mismatch: CPU requires {cpu_socket}"
                        )
                        has_incompatible = True

    if not results:
        overall = "unknown"
    elif has_incompatible:
        overall = "incompatible"
    else:
        overall = "compatible"

    return CompatibilityResult(
        product_id=build.id,
        slot=f"build_{build.id}",
        status=overall,
        message="Build has incompatible components"
        if has_incompatible
        else "All components are compatible",
        items=results,
    )


from dataclasses import dataclass


@dataclass
class CompatibilityResult:
    product_id: int
    slot: str
    status: str  # "compatible", "incompatible", "unknown"
    message: str | None = None
    items: list[CompatibilityResult] | None = None

    @property
    def is_compatible(self) -> bool:
        return self.status == "compatible"

    @property
    def is_incompatible(self) -> bool:
        return self.status == "incompatible"


# Also export for imports
