"""Normalized, category-scoped product characteristics.

This module is the single source of truth for reading, validating, formatting and
persisting `product_characteristics` values. The database stores native JSON
(``numbers stay numbers``, ``booleans stay booleans``, lists keep order and
duplicates); every rule below is enforced here because the schema intentionally
declares no cross-table type constraint.

Definitions belong to a **category**, so every product type inside a category
shares the same set. All bulk helpers are written to keep request handling free
of N+1 queries: one query for definitions of all involved categories and one
query for the values of all involved products.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Characteristic, ProductCharacteristic
from app.services.errors import InvalidInputError

# Upper bound for a single free-text value; keeps payloads and rows bounded.
MAX_STRING_LENGTH = 500
# Upper bound for one list value (connector lists etc. are far below this).
MAX_LIST_LENGTH = 50

TRUE_LABEL = "Да"
FALSE_LABEL = "Нет"


@dataclass(frozen=True, slots=True)
class CharacteristicDefinition:
    """Immutable view of one `characteristics` row."""

    id: int
    category_id: int
    code: str
    name: str
    data_type: str
    unit: str | None
    sort_order: int
    is_required: bool
    show_in_short: bool
    show_in_details: bool

    @classmethod
    def from_row(cls, row: Characteristic) -> CharacteristicDefinition:
        return cls(
            id=row.id,
            category_id=row.category_id,
            code=row.code,
            name=row.name,
            data_type=row.data_type,
            unit=row.unit,
            sort_order=row.sort_order,
            is_required=row.is_required,
            show_in_short=row.show_in_short,
            show_in_details=row.show_in_details,
        )


# ── Loading ──────────────────────────────────────────────────────────────────


def load_definitions(
    db: Session, category_ids: Iterable[int]
) -> dict[int, list[CharacteristicDefinition]]:
    """Load the definitions of every requested category in one query."""
    wanted = sorted({int(value) for value in category_ids})
    if not wanted:
        return {}
    rows = db.scalars(
        select(Characteristic)
        .where(Characteristic.category_id.in_(wanted))
        .order_by(
            Characteristic.category_id,
            Characteristic.sort_order,
            Characteristic.id,
        )
    ).all()
    result: dict[int, list[CharacteristicDefinition]] = {cid: [] for cid in wanted}
    for row in rows:
        result[row.category_id].append(CharacteristicDefinition.from_row(row))
    return result


def definitions_for_category(
    db: Session, category_id: int
) -> list[CharacteristicDefinition]:
    """Definitions of one category ordered by `sort_order`."""
    return load_definitions(db, [category_id]).get(category_id, [])


def load_values(db: Session, product_ids: Iterable[int]) -> dict[int, dict[str, Any]]:
    """Load all characteristic values of the requested products in one query."""
    wanted = sorted({int(value) for value in product_ids})
    if not wanted:
        return {}
    rows = db.execute(
        select(
            ProductCharacteristic.product_id,
            Characteristic.code,
            ProductCharacteristic.value,
        )
        .join(
            Characteristic,
            Characteristic.id == ProductCharacteristic.characteristic_id,
        )
        .where(ProductCharacteristic.product_id.in_(wanted))
        .order_by(ProductCharacteristic.product_id, Characteristic.sort_order)
    ).all()
    result: dict[int, dict[str, Any]] = {pid: {} for pid in wanted}
    for product_id, code, value in rows:
        result[product_id][code] = value
    return result


def values_for_product(db: Session, product_id: int) -> dict[str, Any]:
    """Values of one product keyed by characteristic code."""
    return load_values(db, [product_id]).get(product_id, {})


# ── Value validation ─────────────────────────────────────────────────────────


def _fail(definition: CharacteristicDefinition, detail: str) -> InvalidInputError:
    return InvalidInputError(f"Characteristic '{definition.name}': {detail}")


def _clean_string(definition: CharacteristicDefinition, raw: Any) -> str:
    if not isinstance(raw, str):
        raise _fail(definition, "a text value is required")
    text = raw.strip()
    if not text:
        raise _fail(definition, "a non-empty text value is required")
    if len(text) > MAX_STRING_LENGTH:
        raise _fail(definition, f"text is longer than {MAX_STRING_LENGTH} characters")
    return text


def _clean_number(definition: CharacteristicDefinition, raw: Any) -> int | float:
    # bool is a subclass of int: it must never be accepted as a number.
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        raise _fail(definition, "a numeric value is required")
    if isinstance(raw, float) and not math.isfinite(raw):
        raise _fail(definition, "the numeric value must be finite")
    if isinstance(raw, int) and abs(raw) > 10**15:
        raise _fail(definition, "the numeric value is out of the supported range")
    return raw


def _clean_list(
    definition: CharacteristicDefinition, raw: Any
) -> list[str] | list[int | float]:
    if not isinstance(raw, list):
        raise _fail(definition, "a list value is required")
    if len(raw) > MAX_LIST_LENGTH:
        raise _fail(definition, f"the list must hold at most {MAX_LIST_LENGTH} items")
    if definition.data_type == "string_list":
        return [_clean_string(definition, item) for item in raw]
    return [_clean_number(definition, item) for item in raw]


def normalize_value(definition: CharacteristicDefinition, raw: Any) -> Any:
    """Validate one submitted value against its declared data type.

    Returns the value in its native JSON form. An absent value is expressed by
    omitting the code entirely — a JSON `null` is never a legal stored value.
    """
    if raw is None:
        raise _fail(definition, "a value is required; omit the code instead of null")
    match definition.data_type:
        case "string":
            return _clean_string(definition, raw)
        case "number":
            return _clean_number(definition, raw)
        case "boolean":
            if not isinstance(raw, bool):
                raise _fail(definition, "a boolean value is required")
            return raw
        case "string_list" | "number_list":
            return _clean_list(definition, raw)
        case _:  # pragma: no cover - the DB CHECK constraint rejects other types
            raise _fail(definition, "the declared data type is not supported")


def submitted_values(
    definitions: Sequence[CharacteristicDefinition],
    submitted: Mapping[str, Any] | Iterable[tuple[str, Any]],
) -> dict[str, Any]:
    """Validate a payload of code/value pairs.

    Codes are read from a sequence so a duplicated code in one payload can be
    rejected instead of being silently collapsed by a JSON object parser.
    """
    by_code = {definition.code: definition for definition in definitions}
    pairs = submitted.items() if isinstance(submitted, Mapping) else list(submitted)
    result: dict[str, Any] = {}
    for raw_code, raw_value in pairs:
        code = raw_code.strip() if isinstance(raw_code, str) else raw_code
        definition = by_code.get(code)
        if definition is None:
            raise InvalidInputError(f"Unknown characteristic code: {raw_code}")
        if code in result:
            raise InvalidInputError(f"Duplicate characteristic code: {code}")
        result[code] = normalize_value(definition, raw_value)
    return result


def removed_codes(
    definitions: Sequence[CharacteristicDefinition],
    requested: Iterable[str],
    *,
    also_known: Iterable[str] = (),
) -> set[str]:
    """Validate an explicit removal request.

    `also_known` carries the codes the product currently stores. A category
    transition legitimately removes values whose definitions only exist in the
    previous category, so those codes are valid removal targets.
    """
    known = {definition.code for definition in definitions} | set(also_known)
    result: set[str] = set()
    for raw_code in requested:
        code = raw_code.strip() if isinstance(raw_code, str) else raw_code
        if code not in known:
            raise InvalidInputError(f"Unknown characteristic code: {raw_code}")
        if code in result:
            raise InvalidInputError(f"Duplicate characteristic code: {code}")
        result.add(code)
    return result


def resolve_values(
    definitions: Sequence[CharacteristicDefinition],
    existing: Mapping[str, Any],
    submitted: Mapping[str, Any] | None = None,
    removed: Iterable[str] = (),
    *,
    require_complete: bool = True,
) -> dict[str, Any]:
    """Merge stored and submitted values into the value set to persist.

    Existing values are preserved unless the code is explicitly removed or a new
    value replaces it. A stored characteristic that the target category does not
    define is never dropped silently: the caller has to remove it explicitly,
    otherwise the whole change is rejected.
    """
    by_code = {definition.code: definition for definition in definitions}
    explicit_removals = removed_codes(definitions, removed, also_known=list(existing))
    merged: dict[str, Any] = {}

    orphans = sorted(
        code
        for code in existing
        if code not in by_code and code not in explicit_removals
    )
    if orphans:
        raise InvalidInputError(
            "Existing characteristics are not defined for the target category: "
            + ", ".join(orphans)
            + ". Remove them explicitly before changing the category."
        )

    for code, value in existing.items():
        if code in explicit_removals or code not in by_code:
            continue
        definition = by_code[code]
        try:
            merged[code] = normalize_value(definition, value)
        except InvalidInputError as exc:
            raise InvalidInputError(
                f"Stored characteristic '{definition.name}' does not match the "
                "target category definition; remove it explicitly to continue"
            ) from exc

    for code, value in (submitted or {}).items():
        merged[code] = value

    if require_complete:
        missing = [
            definition.name
            for definition in definitions
            if definition.is_required and merged.get(definition.code) is None
        ]
        if missing:
            raise InvalidInputError(
                "Missing required characteristics: " + ", ".join(missing)
            )
    return merged


def validate_values(
    db: Session,
    category_id: int,
    submitted: Mapping[str, Any] | Iterable[tuple[str, Any]] | None = None,
    existing: Mapping[str, Any] | None = None,
    removed: Iterable[str] = (),
    *,
    require_complete: bool = True,
) -> tuple[list[CharacteristicDefinition], dict[str, Any]]:
    """Validate a payload for one category and return the values to persist."""
    definitions = definitions_for_category(db, category_id)
    parsed = submitted_values(definitions, submitted or {})
    resolved = resolve_values(
        definitions,
        existing or {},
        parsed,
        removed,
        require_complete=require_complete,
    )
    return definitions, resolved


# ── Persistence ──────────────────────────────────────────────────────────────


def replace_values(
    db: Session,
    product_id: int,
    definitions: Sequence[CharacteristicDefinition],
    target: Mapping[str, Any],
) -> None:
    """Make the stored values of `product_id` exactly equal `target`.

    Only rows that actually change are written; removed codes are deleted. The
    JSONB column has no mutable tracker, so values are always assigned, never
    mutated in place. The caller owns the transaction boundary.
    """
    by_code = {definition.code: definition for definition in definitions}
    unknown = sorted(code for code in target if code not in by_code)
    if unknown:  # pragma: no cover - defensive: validation runs before persistence
        raise InvalidInputError("Unknown characteristic codes: " + ", ".join(unknown))
    wanted = {
        by_code[code].id: (by_code[code], value) for code, value in target.items()
    }
    rows = db.scalars(
        select(ProductCharacteristic).where(
            ProductCharacteristic.product_id == product_id
        )
    ).all()
    existing = {row.characteristic_id: row for row in rows}
    for characteristic_id, stale in existing.items():
        if characteristic_id not in wanted:
            db.delete(stale)
    for characteristic_id, (definition, value) in wanted.items():
        row = existing.get(characteristic_id)
        if row is None:
            db.add(
                ProductCharacteristic(
                    product_id=product_id,
                    characteristic_id=characteristic_id,
                    value=normalize_value(definition, value),
                )
            )
        elif row.value != value:
            row.value = normalize_value(definition, value)
    db.flush()


# ── Serialization ────────────────────────────────────────────────────────────


# Display-only precision limit. Characteristic values are ordinary hardware
# measurements (1-2 decimals); this only removes binary floating point noise from
# the rendered text and never changes the stored native value.
DISPLAY_DECIMAL_PLACES = 10


def format_number(value: float) -> str:
    """Deterministic, non-scientific rendering that never loses precision."""
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        return ""
    decimal = Decimal(str(round(value, DISPLAY_DECIMAL_PLACES))).normalize()
    text = format(decimal, "f")
    return "0" if text in {"-0", "0"} else text


def format_value(definition: CharacteristicDefinition, raw: Any) -> str:
    """Human-readable value: no raw JSON, no Python repr, unit appended once."""
    match definition.data_type:
        case "boolean":
            return TRUE_LABEL if raw is True else FALSE_LABEL
        case "number":
            text = format_number(raw)
        case "string_list":
            text = ", ".join(str(item) for item in raw)
        case "number_list":
            text = ", ".join(format_number(item) for item in raw)
        case _:
            text = str(raw)
    if definition.unit and text:
        return f"{text} {definition.unit}"
    return text


def serialize_definitions(
    definitions: Sequence[CharacteristicDefinition],
    values: Mapping[str, Any],
    *,
    short_only: bool = False,
    details_only: bool = False,
) -> list[dict[str, Any]]:
    """Serialize the values that exist for this product, in `sort_order`.

    Missing values are skipped instead of being rendered as placeholders, so a
    partially filled product still shows its available information.
    """
    rows: list[dict[str, Any]] = []
    for definition in definitions:
        if short_only and not definition.show_in_short:
            continue
        if details_only and not definition.show_in_details:
            continue
        if definition.code not in values:
            continue
        raw = values[definition.code]
        rows.append(
            {
                "code": definition.code,
                "name": definition.name,
                "data_type": definition.data_type,
                "unit": definition.unit,
                "sort_order": definition.sort_order,
                "is_required": definition.is_required,
                "show_in_short": definition.show_in_short,
                "show_in_details": definition.show_in_details,
                "value": raw,
                "display_value": format_value(definition, raw),
            }
        )
    return rows


def display_lines(
    definitions: Sequence[CharacteristicDefinition], values: Mapping[str, Any]
) -> list[str]:
    """Short display strings used for cart lines and order snapshots."""
    return [
        row["display_value"]
        for row in serialize_definitions(definitions, values, short_only=True)
    ]
