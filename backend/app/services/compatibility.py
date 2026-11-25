"""Server-side component compatibility, based on explicit structured evidence.

Only values of the normalized `product_characteristics` tables are considered,
addressed by characteristic `code`. A missing, malformed, or unverified dimension
gives ``unknown``, never a false positive. Nothing is inferred from product names
or marketing strings.

The approved rule set is the ``RULES`` table below. It contains only comparisons
that the current characteristic definitions genuinely support:

* ``equal`` — two text identifiers must be identical (CPU and motherboard socket);
* ``member`` — a value must appear in a documented supported list (form factors,
  interfaces, NVMe lengths, cooler sockets, supported CPU memory types);
* ``limit`` — a documented maximum must not be exceeded (memory capacity, module
  count, recommended PSU wattage vs rated wattage);
* ``connectors`` — the documented set of available connectors must cover the
  documented required set, counting duplicates.

Rules whose evidence does not exist in the normalized model are deliberately
absent instead of being guessed: CPU/BIOS model support lists, cooler thermal
capacity, cooler/GPU/PSU physical clearances inside a case, SATA drive bays,
radiator mounting, RAM heat-spreader clearance and a full system power budget.
``thermal_design_power_w`` is a thermal design power, not a maximum electrical
draw, so it is never compared with a PSU rating (see ``POWER_NOTE``).

A rule that cannot be resolved for one product is reported as ``unknown`` for that
product, which is different from a rule that does not exist at all. A verified
conflict always wins over an unknown check.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal

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

CheckKind = Literal["equal", "member", "limit", "connectors"]


@dataclass(frozen=True, slots=True)
class Field:
    """One characteristic of one component slot, addressed by its code."""

    slot: str
    code: str


@dataclass(frozen=True, slots=True)
class Rule:
    """One comparison of the approved basic compatibility assessment."""

    code: str
    """Stable identifier, e.g. ``cpu+mobo_socket``; the client localizes it."""
    kind: CheckKind
    left: Field
    right: Field
    when_field: Field | None = None
    """The rule only applies when this text field has the documented value."""
    when_value: str | None = None
    when_numeric: bool = False
    """The rule only applies when this field holds a usable number."""


RULES: tuple[Rule, ...] = (
    Rule("cpu+mobo_socket", "equal", Field("cpu", "socket"), Field("mobo", "socket")),
    Rule(
        "cpu+ram_type",
        "member",
        Field("ram", "memory_type"),
        Field("cpu", "memory_type"),
    ),
    Rule(
        "ram+mobo_type",
        "equal",
        Field("ram", "memory_type"),
        Field("mobo", "memory_type"),
    ),
    Rule(
        "ram+mobo_capacity",
        "limit",
        Field("ram", "capacity_gb"),
        Field("mobo", "max_memory_gb"),
    ),
    Rule(
        "ram+mobo_slots",
        "limit",
        Field("ram", "module_count"),
        Field("mobo", "ram_slots"),
    ),
    Rule(
        "mobo+case_form_factor",
        "member",
        Field("mobo", "form_factor"),
        Field("case", "supported_motherboard_form_factors"),
    ),
    Rule(
        "cpu+cooling_socket",
        "member",
        Field("cpu", "socket"),
        Field("cooling", "supported_sockets"),
    ),
    Rule(
        "gpu+mobo_slot",
        "member",
        Field("gpu", "interface"),
        Field("mobo", "gpu_interfaces"),
    ),
    Rule(
        "storage+mobo_interface",
        "member",
        Field("storage", "interface"),
        Field("mobo", "storage_interfaces"),
    ),
    # An M.2 slot only accepts the drive lengths the board documents.
    Rule(
        "storage+mobo_length",
        "member",
        Field("storage", "length_mm"),
        Field("mobo", "supported_nvme_lengths_mm"),
        when_field=Field("storage", "interface"),
        when_value="nvme",
    ),
    Rule(
        "psu+case_form_factor",
        "member",
        Field("psu", "form_factor"),
        Field("case", "supported_psu_form_factors"),
    ),
    Rule(
        "psu+gpu_connectors",
        "connectors",
        Field("gpu", "required_power_connectors"),
        Field("psu", "available_gpu_power_connectors"),
    ),
    Rule(
        "psu+mobo_main_connector",
        "connectors",
        Field("mobo", "required_board_power_connectors"),
        Field("psu", "available_board_power_connectors"),
    ),
    Rule(
        "psu+mobo_connectors",
        "connectors",
        Field("mobo", "required_cpu_power_connectors"),
        Field("psu", "available_cpu_power_connectors"),
    ),
    # Only compared when the GPU documents a vendor recommendation at all.
    Rule(
        "psu+gpu_recommended_power",
        "limit",
        Field("gpu", "recommended_psu_w"),
        Field("psu", "wattage_w"),
        when_field=Field("gpu", "recommended_psu_w"),
        when_numeric=True,
    ),
)


@dataclass
class Evidence:
    """One characteristic that took part in a check."""

    slot: str
    product_id: int
    product_name: str
    code: str
    name: str
    data_type: str
    unit: str | None
    value: Any
    display_value: str | None


@dataclass
class CompatibilityResult:
    product_id: int
    slot: str
    status: str
    message: str | None = None
    items: list[CompatibilityResult] | None = None
    product_name: str = ""
    details: list[Evidence] = field(default_factory=list)

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


# One product's characteristic values: characteristic code -> selected options.
Values = dict[str, tuple[spec_service.SelectedOption, ...]]


def _raw(values: Values, code: str) -> tuple[spec_service.SelectedOption, ...] | None:
    """Read one stored characteristic without inferring anything elsewhere."""
    options = values.get(code)
    return options if options else None


def _text(values: Values, code: str) -> str | None:
    """One technical identifier of a characteristic that stores exactly one option."""
    options = _raw(values, code)
    if options is None or len(options) != 1:
        return None
    value = options[0].value.strip()
    return spec_service.normalize_text(value) if value else None


def _values(values: Values, code: str) -> list[str] | None:
    """Every selected identifier, repeated as many times as its quantity.

    Connector requirements are stored once with a `quantity`, so the repeat count
    is what the coverage check has to see. An empty selection is *not* a verified
    "nothing required": in this catalog it is indistinguishable from "not filled
    in", so it stays unresolved.
    """
    options = _raw(values, code)
    if options is None:
        return None
    result: list[str] = []
    for option in options:
        value = option.value.strip()
        if not value:
            return None
        result.extend([spec_service.normalize_text(value)] * max(1, option.quantity))
    return result or None


def _measurement(value: object) -> Decimal | None:
    """Validated numeric magnitude of one display value (never from a boolean)."""
    if isinstance(value, bool) or not isinstance(value, str):
        return None
    return spec_service.parse_measurement(value)


def _number(values: Values, code: str) -> Decimal | None:
    """Positive magnitude of a characteristic that stores exactly one option."""
    options = _raw(values, code)
    if options is None or len(options) != 1:
        return None
    result = _measurement(options[0].value)
    return result if result is not None and result > 0 else None


def _size_list(values: Values, code: str) -> list[Decimal] | None:
    """Positive magnitudes of a numeric list characteristic."""
    options = _raw(values, code)
    if options is None:
        return None
    sizes: list[Decimal] = []
    for option in options:
        size = _measurement(option.value)
        if size is None or size <= 0:
            return None
        sizes.append(size)
    return sizes or None


def _display(
    definition: spec_service.CharacteristicDefinition | None,
    options: tuple[spec_service.SelectedOption, ...] | None,
) -> tuple[str, str | None, str | None]:
    """Definition label, unit and server rendering of one characteristic."""
    if definition is None:
        return ("", None, None)
    if not options:
        return (definition.name, definition.unit, None)
    return (
        definition.name,
        definition.unit,
        spec_service.display_value(definition, options),
    )


@dataclass
class _Context:
    """Everything one evaluation needs, loaded in three bulk queries."""

    products: dict[str, Product]
    values: dict[str, Values]
    definitions: dict[tuple[int, str], spec_service.CharacteristicDefinition]

    def data_type(self, reference: Field) -> str:
        """Declared data type of a referenced characteristic."""
        category_id = self.products[reference.slot].product_type.category_id
        definition = self.definitions.get((category_id, reference.code))
        return definition.data_type if definition else "string"

    def evidence(self, reference: Field) -> Evidence:
        product = self.products[reference.slot]
        category_id = product.product_type.category_id
        definition = self.definitions.get((category_id, reference.code))
        options = _raw(self.values[reference.slot], reference.code)
        name, unit, rendered = _display(definition, options)
        return Evidence(
            slot=reference.slot,
            product_id=product.id,
            product_name=product.name,
            code=reference.code,
            name=name or reference.code,
            data_type=definition.data_type if definition else "string",
            unit=unit,
            value=(
                spec_service.structured_value(definition, options)
                if definition is not None and options
                else None
            ),
            display_value=rendered,
        )


def _record(
    results: list[CompatibilityResult],
    rule: Rule,
    ok: bool | None,
    message: str,
    details: list[Evidence],
) -> None:
    status = "unknown" if ok is None else ("compatible" if ok else "incompatible")
    results.append(CompatibilityResult(0, rule.code, status, message, details=details))


def _applies(rule: Rule, context: _Context) -> bool:
    if rule.when_field is None:
        return True
    values = context.values[rule.when_field.slot]
    if rule.when_numeric:
        return _number(values, rule.when_field.code) is not None
    return _text(values, rule.when_field.code) == rule.when_value


def _evaluate_rule(
    rule: Rule, context: _Context, results: list[CompatibilityResult]
) -> None:
    left_values = context.values[rule.left.slot]
    right_values = context.values[rule.right.slot]
    match rule.kind:
        case "equal":
            left = _text(left_values, rule.left.code)
            right = _text(right_values, rule.right.code)
            _record(
                results,
                rule,
                None if left is None or right is None else left == right,
                f"{rule.left.slot}.{rule.left.code} must equal "
                f"{rule.right.slot}.{rule.right.code}",
                [context.evidence(rule.left), context.evidence(rule.right)],
            )
        case "member":
            # The declared definition decides whether this is a numeric list.
            if context.data_type(rule.right) == "number_list":
                size = _number(left_values, rule.left.code)
                sizes = _size_list(right_values, rule.right.code)
                hit = None if size is None or sizes is None else size in sizes
            else:
                item = _text(left_values, rule.left.code)
                supported = _values(right_values, rule.right.code)
                hit = None if item is None or supported is None else item in supported
            _record(
                results,
                rule,
                hit,
                f"{rule.left.slot}.{rule.left.code} must be listed in "
                f"{rule.right.slot}.{rule.right.code}",
                [context.evidence(rule.left), context.evidence(rule.right)],
            )
        case "limit":
            requirement = _number(left_values, rule.left.code)
            limit = _number(right_values, rule.right.code)
            _record(
                results,
                rule,
                None if requirement is None or limit is None else requirement <= limit,
                f"{rule.left.slot}.{rule.left.code} must not exceed "
                f"{rule.right.slot}.{rule.right.code}",
                [context.evidence(rule.left), context.evidence(rule.right)],
            )
        case "connectors":
            required = _values(left_values, rule.left.code)
            available = _values(right_values, rule.right.code)
            ok = (
                None
                if required is None or available is None
                else not (Counter(required) - Counter(available))
            )
            _record(
                results,
                rule,
                ok,
                f"{rule.right.slot}.{rule.right.code} must cover "
                f"{rule.left.slot}.{rule.left.code}",
                [context.evidence(rule.left), context.evidence(rule.right)],
            )


def check_selections(
    db: Session, selections: dict[str, int], build_id: int = 0
) -> CompatibilityResult:
    """Return compatible only if all eight parts and every approved check pass."""
    results: list[CompatibilityResult] = []
    products = _load_products(db, list(dict.fromkeys(selections.values())))
    selected_products: dict[str, Product] = {}
    for slot, product_id in selections.items():
        product = products.get(product_id)
        result = _evaluate_slot(product, product_id, slot)
        results.append(result)
        if result.is_compatible and product is not None:
            selected_products[slot] = product

    product_ids = list({product.id for product in selected_products.values()})
    # Two bulk queries for the whole build: values once, definitions once.
    values = spec_service.load_values(db, product_ids)
    category_ids = {
        product.product_type.category_id for product in selected_products.values()
    }
    definitions = {
        (category_id, definition.code): definition
        for category_id, rows in spec_service.load_definitions(db, category_ids).items()
        for definition in rows
    }
    context = _Context(
        products=selected_products,
        values={
            slot: values.get(product.id, {})
            for slot, product in selected_products.items()
        },
        definitions=definitions,
    )

    for slot in sorted(set(SLOT_CATEGORIES) - set(selections)):
        results.append(
            CompatibilityResult(0, slot, "unknown", "Required component is missing")
        )

    # A malformed/incorrect selection is incompatible, even if other data is missing.
    if len(selected_products) == len(SLOT_CATEGORIES):
        for rule in RULES:
            if rule.left.slot not in selected_products:
                continue
            if rule.right.slot not in selected_products:
                continue
            if not _applies(rule, context):
                continue
            _evaluate_rule(rule, context, results)

    if any(item.is_incompatible for item in results):
        status = "incompatible"
        message = "A verified incompatibility was found"
    elif len(selected_products) != len(SLOT_CATEGORIES) or any(
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
