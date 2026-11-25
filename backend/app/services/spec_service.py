"""Central, dictionary-backed product characteristics.

The database stores characteristics in three normalized tables and this module is
the only place that interprets them:

* ``characteristics`` — category-scoped definitions (code, label, data type, unit,
  ordering, requirement and display flags);
* ``characteristic_options`` — an independent dictionary of display-ready string
  values, scoped to exactly one definition (``AM5``, ``DDR5``, ``750 Вт``,
  ``307 × 125 × 46 мм``);
* ``product_characteristics`` — product/definition/option associations with a
  positive ``quantity`` (four identical PCIe 8-pin connectors are one row with
  ``quantity = 4``).

Nothing here writes a value that is not in the dictionary. The single documented
exception is the GPU ``dimensions_mm`` field, whose three measurements are turned
into one canonical dictionary value by the backend: the dictionary row is created
(or reused) inside the same transaction as the product write.

Selectable values always come from PostgreSQL. Only the *behaviour* of a field is
declared in code, and it is keyed by ``(category slug, characteristic code)``, so
no database identifier is hardcoded anywhere.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Category, Characteristic, CharacteristicOption
from app.models import ProductCharacteristic as ProductCharacteristicRow
from app.services.errors import InvalidInputError

# Upper bound for one dictionary value; mirrors `characteristic_options.value`.
MAX_VALUE_LENGTH = 500
# Upper bound for the number of options submitted for one characteristic.
MAX_SELECTION_COUNT = 50
# Upper bound for one connector quantity. A single PSU never needs more.
MAX_QUANTITY: Final = 32

TRUE_LABEL = "Да"
FALSE_LABEL = "Нет"

EDITOR_SELECT = "select"
EDITOR_BOOLEAN = "boolean"
EDITOR_MULTISELECT = "multiselect"
EDITOR_CONNECTORS = "connector_quantity"
EDITOR_DIMENSIONS = "dimensions"

EDITORS: Final = (
    EDITOR_SELECT,
    EDITOR_BOOLEAN,
    EDITOR_MULTISELECT,
    EDITOR_CONNECTORS,
    EDITOR_DIMENSIONS,
)

# ── Field behaviour (category-scoped codes, no database identifiers) ─────────

# Fields whose identical repeats are stored once with a `quantity`.
REPEATED_CONNECTOR_FIELDS: Final[dict[tuple[str, str], str]] = {
    ("gpu", "required_power_connectors"): "connector_quantity",
    ("mobo", "required_cpu_power_connectors"): "connector_quantity",
    ("mobo", "required_board_power_connectors"): "connector_quantity",
    ("psu", "available_cpu_power_connectors"): "connector_quantity",
    ("psu", "available_gpu_power_connectors"): "connector_quantity",
    ("psu", "available_board_power_connectors"): "connector_quantity",
}

# Fields edited as an ordered triple of measurements instead of a dictionary pick.
DIMENSION_FIELDS: Final[dict[tuple[str, str], str]] = {
    ("gpu", "dimensions_mm"): "dimensions",
}

# GPU dimensions: three measurements in millimetres.
DIMENSION_COUNT: Final = 3
DIMENSION_UNIT: Final = "мм"
DIMENSION_SEPARATOR: Final = " × "
MAX_DIMENSION_MM: Final = Decimal(1000)
DIMENSION_DECIMAL_PLACES: Final = 2

# A plain decimal literal: no exponent, no sign, no grouping, no whitespace.
_DIMENSION_LITERAL: Final = re.compile(r"^\d{1,4}(?:\.\d{1,2})?$")
# One measurement as a dictionary value: `307`, `269.1` or `134.85` with an
# optional unit suffix. A suffix may not start with a digit, so `1 234` never
# becomes `1234`.
_MEASUREMENT_LITERAL: Final = re.compile(
    r"^(?P<number>\d+(?:[.,]\d+)?)(?:\s*(?P<suffix>[^\d\s].*))?$"
)

# Sentinel of a dimension value that still has to be created in the dictionary.
UNRESOLVED_OPTION_ID: Final = 0


def editor_for(category_slug: str, code: str, data_type: str) -> str:
    """Editor behaviour of one definition, derived from data, never from an id."""
    key = (category_slug, code)
    if key in DIMENSION_FIELDS:
        return EDITOR_DIMENSIONS
    if key in REPEATED_CONNECTOR_FIELDS:
        return EDITOR_CONNECTORS
    if data_type == "boolean":
        return EDITOR_BOOLEAN
    if data_type in ("string_list", "number_list"):
        return EDITOR_MULTISELECT
    return EDITOR_SELECT


def is_repeatable(editor: str) -> bool:
    """Whether one option may carry a quantity greater than one."""
    return editor == EDITOR_CONNECTORS


# ── Definitions and dictionary ──────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class CharacteristicDefinition:
    """Immutable view of one `characteristics` row plus its category slug."""

    id: int
    category_id: int
    category_slug: str
    code: str
    name: str
    data_type: str
    unit: str | None
    sort_order: int
    is_required: bool
    show_in_short: bool
    show_in_details: bool

    @property
    def editor(self) -> str:
        return editor_for(self.category_slug, self.code, self.data_type)

    @classmethod
    def from_row(
        cls, row: Characteristic, category_slug: str
    ) -> CharacteristicDefinition:
        """Build the immutable view of one freshly created definition row."""
        return cls(
            id=row.id,
            category_id=row.category_id,
            category_slug=category_slug,
            code=row.code,
            name=row.name,
            data_type=row.data_type,
            unit=row.unit,
            sort_order=row.sort_order,
            is_required=row.is_required,
            show_in_short=row.show_in_short,
            show_in_details=row.show_in_details,
        )


@dataclass(frozen=True, slots=True)
class DictionaryOption:
    """One display-ready dictionary value of one definition."""

    id: int
    characteristic_id: int
    value: str


@dataclass(frozen=True, slots=True)
class SelectedOption:
    """One option a product stores, with its repeat count."""

    option_id: int
    value: str
    quantity: int = 1


# A product's values: characteristic code -> selected options in display order.
Values = dict[str, tuple[SelectedOption, ...]]


def load_definitions(
    db: Session, category_ids: Iterable[int]
) -> dict[int, list[CharacteristicDefinition]]:
    """Load the definitions of every requested category in one query."""
    wanted = sorted({int(value) for value in category_ids})
    if not wanted:
        return {}
    rows = db.execute(
        select(Characteristic, Category.slug)
        .join(Category, Category.id == Characteristic.category_id)
        .where(Characteristic.category_id.in_(wanted))
        .order_by(
            Characteristic.category_id,
            Characteristic.sort_order,
            Characteristic.id,
        )
    ).all()
    result: dict[int, list[CharacteristicDefinition]] = {cid: [] for cid in wanted}
    for row, category_slug in rows:
        result[row.category_id].append(
            CharacteristicDefinition(
                id=row.id,
                category_id=row.category_id,
                category_slug=category_slug,
                code=row.code,
                name=row.name,
                data_type=row.data_type,
                unit=row.unit,
                sort_order=row.sort_order,
                is_required=row.is_required,
                show_in_short=row.show_in_short,
                show_in_details=row.show_in_details,
            )
        )
    return result


def definitions_for_category(
    db: Session, category_id: int
) -> list[CharacteristicDefinition]:
    """Definitions of one category ordered by `sort_order`."""
    return load_definitions(db, [category_id]).get(category_id, [])


def load_options(
    db: Session, characteristic_ids: Iterable[int]
) -> dict[int, list[DictionaryOption]]:
    """Load the whole dictionary of the requested definitions in one query.

    Options are returned for every definition, including values that no product
    uses yet, because the administration editor offers the complete dictionary.
    """
    wanted = sorted({int(value) for value in characteristic_ids})
    if not wanted:
        return {}
    rows = db.scalars(
        select(CharacteristicOption)
        .where(CharacteristicOption.characteristic_name_id.in_(wanted))
        .order_by(
            CharacteristicOption.characteristic_name_id,
            CharacteristicOption.value,
            CharacteristicOption.id,
        )
    ).all()
    result: dict[int, list[DictionaryOption]] = {cid: [] for cid in wanted}
    for row in rows:
        result[row.characteristic_name_id].append(
            DictionaryOption(
                id=row.id,
                characteristic_id=row.characteristic_name_id,
                value=row.value,
            )
        )
    return result


def options_by_value(
    options: Mapping[int, Sequence[DictionaryOption]],
) -> dict[int, dict[str, DictionaryOption]]:
    """Index a loaded dictionary by `(definition id, value)`."""
    return {
        characteristic_id: {option.value: option for option in rows}
        for characteristic_id, rows in options.items()
    }


# ── Loading a product's stored values ───────────────────────────────────────


def load_values(db: Session, product_ids: Iterable[int]) -> dict[int, Values]:
    """Load every stored value of the requested products in one query.

    One joined statement returns the product, the definition code and ordering,
    and the dictionary value with its quantity. Options of one characteristic are
    ordered by the definition `sort_order` and then by dictionary value, which is
    deterministic because the schema stores no per-row position.
    """
    wanted = sorted({int(value) for value in product_ids})
    if not wanted:
        return {}
    rows = db.execute(
        select(
            ProductCharacteristicRow.product_id,
            ProductCharacteristicRow.characteristic_id,
            ProductCharacteristicRow.quantity,
            Characteristic.code,
            Characteristic.sort_order,
            CharacteristicOption.id,
            CharacteristicOption.value,
        )
        .join(
            Characteristic,
            Characteristic.id == ProductCharacteristicRow.characteristic_id,
        )
        .join(
            CharacteristicOption,
            CharacteristicOption.id
            == ProductCharacteristicRow.characteristic_option_id,
        )
        .where(ProductCharacteristicRow.product_id.in_(wanted))
        .order_by(
            ProductCharacteristicRow.product_id,
            Characteristic.sort_order,
            Characteristic.id,
            CharacteristicOption.value,
            CharacteristicOption.id,
        )
    ).all()
    collected: dict[int, dict[str, list[SelectedOption]]] = {pid: {} for pid in wanted}
    for (
        product_id,
        _characteristic_id,
        quantity,
        code,
        _sort_order,
        option_id,
        value,
    ) in rows:
        # The statement already orders by definition `sort_order` and then by
        # dictionary value, so the collected order is the display order.
        collected[product_id].setdefault(code, []).append(
            SelectedOption(option_id=option_id, value=value, quantity=quantity)
        )
    return {
        product_id: {code: tuple(options) for code, options in per_product.items()}
        for product_id, per_product in collected.items()
    }


def values_for_product(db: Session, product_id: int) -> Values:
    """Stored values of one product keyed by characteristic code."""
    return load_values(db, [product_id]).get(product_id, {})


# ── Semantic interpretation ─────────────────────────────────────────────────


def normalize_text(value: str) -> str:
    """Comparison form of a technical identifier.

    Only the two transformations that never change meaning are applied: the
    surrounding/inner whitespace is collapsed and the case is folded, because the
    restored dictionary really does contain `AM4` and `am4` for the same socket.
    Nothing is stripped, split or reordered.
    """
    return " ".join(value.split()).casefold()


def parse_measurement(value: str) -> Decimal | None:
    """Numeric magnitude of a display value such as `750 Вт` or `269.1 мм`.

    The number has to start the value and may only be followed by a unit suffix
    that does not start with a digit, so grouping separators (`1 234 ГБ`),
    embedded whitespace and text values (`AM5`) stay unparseable instead of being
    guessed.
    """
    match = _MEASUREMENT_LITERAL.match(value.strip())
    if match is None:
        return None
    try:
        number = Decimal(match.group("number").replace(",", "."))
    except InvalidOperation:  # pragma: no cover - the pattern already validates
        return None
    return number if number.is_finite() else None


def parse_boolean(value: str) -> bool | None:
    """Boolean meaning of a dictionary value, or `None` when it carries none."""
    text = normalize_text(value)
    if text == normalize_text(TRUE_LABEL):
        return True
    if text == normalize_text(FALSE_LABEL):
        return False
    return None


def _number_or_text(value: str) -> Any:
    """Numeric magnitude of a `number` option, keeping text it cannot represent.

    Integral magnitudes become `int` so a stored `5000 МГц` reads back as `5000`
    rather than `5000.0`, while a value with no numeric head (`CL16`) keeps its
    dictionary text instead of being guessed into a number.
    """
    measurement = parse_measurement(value)
    if measurement is None:
        return value
    if measurement == measurement.to_integral_value():
        return int(measurement)
    return float(measurement)


# ── Dimensions ──────────────────────────────────────────────────────────────


def format_measurement(number: Decimal) -> str:
    """Canonical measurement text: no trailing zeros, no exponent notation."""
    text = format(number.normalize(), "f")
    return "0" if text in {"-0", "0"} else text


def canonical_dimensions(measurements: Sequence[Decimal]) -> str:
    """The one dictionary value that represents three GPU measurements."""
    parts = [format_measurement(measurement) for measurement in measurements]
    return f"{DIMENSION_SEPARATOR.join(parts)} {DIMENSION_UNIT}"


def parse_dimensions(value: str) -> list[float] | None:
    """Ordered measurements of a canonical dimension value, or `None`."""
    text = value.strip()
    suffix = f" {DIMENSION_UNIT}"
    if not text.endswith(suffix):
        return None
    parts = [
        part.strip() for part in text[: -len(suffix)].split(DIMENSION_SEPARATOR.strip())
    ]
    if len(parts) != DIMENSION_COUNT:
        return None
    numbers: list[float] = []
    for part in parts:
        if _DIMENSION_LITERAL.match(part) is None:
            return None
        numbers.append(float(part))
    return numbers


def parse_dimension_input(raw: Any) -> Decimal:
    """Validate one submitted dimension measurement.

    Accepts a JSON number with at most two decimals, or a plain decimal string.
    Exponent notation, grouping separators, signs, surrounding whitespace and
    non-numeric text are rejected instead of being repaired.
    """
    if isinstance(raw, bool) or raw is None:
        raise InvalidInputError("A dimension measurement must be a number")
    if isinstance(raw, str):
        text = raw
        if _DIMENSION_LITERAL.match(text) is None:
            raise InvalidInputError(
                "A dimension measurement must be a plain number with at most two "
                "decimal places"
            )
        number = Decimal(text)
    elif isinstance(raw, int):
        number = Decimal(raw)
    elif isinstance(raw, float):
        if not math.isfinite(raw):
            raise InvalidInputError("A dimension measurement must be finite")
        number = Decimal(repr(raw))
    elif isinstance(raw, Decimal):
        number = raw
    else:
        raise InvalidInputError("A dimension measurement must be a number")
    if not number.is_finite():
        raise InvalidInputError("A dimension measurement must be finite")
    exponent = number.as_tuple().exponent
    if (
        number != number.to_integral_value()
        and isinstance(exponent, int)
        and -exponent > DIMENSION_DECIMAL_PLACES
    ):
        raise InvalidInputError(
            "A dimension measurement supports at most two decimal places"
        )
    if number <= 0:
        raise InvalidInputError("A dimension measurement must be greater than zero")
    if number > MAX_DIMENSION_MM:
        raise InvalidInputError(
            f"A dimension measurement must not exceed {MAX_DIMENSION_MM} mm"
        )
    return number


def validate_dimensions(raw: Iterable[Any]) -> tuple[Decimal, Decimal, Decimal]:
    """Validate exactly three measurements and return them in order."""
    measurements = [parse_dimension_input(item) for item in raw]
    if len(measurements) != DIMENSION_COUNT:
        raise InvalidInputError("Exactly three dimensions are required")
    return (measurements[0], measurements[1], measurements[2])


# ── Submission model ────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class OptionSelection:
    """One submitted dictionary pick with its repeat count."""

    option_id: int
    quantity: int = 1


@dataclass(frozen=True, slots=True)
class CharacteristicSubmission:
    """One submitted characteristic: either dictionary picks or dimensions."""

    code: str
    options: tuple[OptionSelection, ...] = ()
    dimensions: tuple[Decimal, Decimal, Decimal] | None = None


def _fail(definition: CharacteristicDefinition, detail: str) -> InvalidInputError:
    return InvalidInputError(f"Characteristic '{definition.name}': {detail}")


def _validate_selection(
    definition: CharacteristicDefinition,
    submission: CharacteristicSubmission,
    dictionary: Mapping[str, DictionaryOption],
    by_id: Mapping[int, DictionaryOption],
) -> tuple[SelectedOption, ...]:
    """Validate dictionary picks of one definition and return them resolved."""
    editor = definition.editor
    if not submission.options:
        raise _fail(definition, "at least one option is required")
    if editor == EDITOR_DIMENSIONS:
        raise _fail(
            definition,
            "exactly three measurements are required; dictionary picks are not "
            "accepted for this characteristic",
        )
    if len(submission.options) > MAX_SELECTION_COUNT:
        raise _fail(
            definition, f"at most {MAX_SELECTION_COUNT} options may be selected"
        )
    repeatable = is_repeatable(editor)
    single = editor in (EDITOR_SELECT, EDITOR_BOOLEAN)
    if single and len(submission.options) > 1:
        raise _fail(definition, "only one option may be selected")
    seen: set[int] = set()
    resolved: list[SelectedOption] = []
    for selection in submission.options:
        option_id = selection.option_id
        if not isinstance(option_id, int) or isinstance(option_id, bool):
            raise _fail(definition, "an option id must be an integer")
        option = by_id.get(option_id)
        if option is None:
            raise _fail(
                definition,
                f"unknown option id {option_id}; the option may belong to another "
                "characteristic or another category",
            )
        if option_id in seen:
            raise _fail(definition, "the same option must not be selected twice")
        seen.add(option_id)
        quantity = selection.quantity
        if not isinstance(quantity, int) or isinstance(quantity, bool):
            raise _fail(definition, "a quantity must be an integer")
        if quantity < 1:
            raise _fail(definition, "a quantity must be greater than zero")
        if quantity > MAX_QUANTITY:
            raise _fail(definition, f"a quantity must not exceed {MAX_QUANTITY}")
        if not repeatable and quantity != 1:
            raise _fail(definition, "this characteristic does not accept a quantity")
        resolved.append(
            SelectedOption(option_id=option_id, value=option.value, quantity=quantity)
        )
    return tuple(resolved)


def submitted_values(
    definitions: Sequence[CharacteristicDefinition],
    submissions: Iterable[CharacteristicSubmission],
    dictionary: Mapping[int, Sequence[DictionaryOption]],
) -> Values:
    """Validate submitted characteristics against their definitions.

    Every submitted option id is resolved against the dictionary of *this*
    definition, so an option of another characteristic, another category or a
    previous category can never be reused. Repeated codes and undefined codes are
    rejected instead of being collapsed.
    """
    by_code = {definition.code: definition for definition in definitions}
    by_id_dictionary = {
        definition_id: {option.id: option for option in options}
        for definition_id, options in dictionary.items()
    }
    by_value_dictionary = options_by_value(dictionary)
    result: Values = {}
    for raw_submission in submissions:
        code = (
            raw_submission.code.strip()
            if isinstance(raw_submission.code, str)
            else raw_submission.code
        )
        definition = by_code.get(code)
        if definition is None:
            raise InvalidInputError(
                f"Unknown characteristic code: {raw_submission.code}"
            )
        if code in result:
            raise InvalidInputError(f"Duplicate characteristic code: {code}")
        assert definition is not None  # narrowed by the check above
        if definition.editor == EDITOR_DIMENSIONS:
            if raw_submission.options:
                raise _fail(
                    definition,
                    "exactly three measurements are required; dictionary picks are "
                    "not accepted for this characteristic",
                )
            if raw_submission.dimensions is None:
                raise _fail(definition, "exactly three dimensions are required")
            measurements = validate_dimensions(raw_submission.dimensions)
            canonical = canonical_dimensions(measurements)
            if len(canonical) > MAX_VALUE_LENGTH:  # pragma: no cover - bounded input
                raise _fail(definition, "the dimension value is too long")
            known = by_value_dictionary.get(definition.id, {}).get(canonical)
            result[code] = (
                SelectedOption(
                    option_id=known.id if known is not None else UNRESOLVED_OPTION_ID,
                    value=canonical,
                    quantity=1,
                ),
            )
            continue
        if raw_submission.dimensions is not None:
            raise _fail(definition, "this characteristic does not accept dimensions")
        result[code] = _validate_selection(
            definition,
            raw_submission,
            by_value_dictionary.get(definition.id, {}),
            by_id_dictionary.get(definition.id, {}),
        )
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


def is_missing_value(definition: CharacteristicDefinition, value: Any) -> bool:
    """Whether a resolved value fails the requirement of its definition.

    A resolved value is a non-empty tuple of selected options, so only an absent
    or empty selection counts as missing. `Да`/`Нет` are real options, and an
    explicit `Нет` is a stored value rather than an absence.
    """
    return not value


def resolve_values(
    definitions: Sequence[CharacteristicDefinition],
    existing: Mapping[str, tuple[SelectedOption, ...]],
    submitted: Mapping[str, tuple[SelectedOption, ...]] | None = None,
    removed: Iterable[str] = (),
    *,
    carry_over: bool = True,
    require_complete: bool = True,
) -> Values:
    """Merge stored and submitted selections into the value set to persist.

    Option identifiers are scoped to one definition, so a stored value can only be
    carried over while the product stays inside its category (`carry_over=True`).
    After a category change every stored code has to be replaced by a valid option
    of the target dictionary or removed explicitly; nothing is dropped silently and
    no identifier of the previous category is reused.

    A code may never be replaced *and* removed by the same request: the submitted
    codes and the requested removals are both validated first, then their
    intersection is rejected, so neither side can silently win. Nothing is written
    here — the caller owns the transaction, so a rejected request leaves the
    product, its associations and the dictionary untouched.
    """
    by_code = {definition.code: definition for definition in definitions}
    explicit_removals = removed_codes(definitions, removed, also_known=list(existing))
    replacements = dict(submitted or {})

    conflicting = sorted(set(replacements) & explicit_removals)
    if conflicting:
        raise InvalidInputError(
            "A characteristic cannot be replaced and removed by the same request: "
            + ", ".join(conflicting)
        )

    unresolved = sorted(
        code
        for code in existing
        if code not in explicit_removals
        and code not in replacements
        and not (carry_over and code in by_code)
    )
    if unresolved:
        raise InvalidInputError(
            "Existing characteristics must be replaced or removed explicitly: "
            + ", ".join(unresolved)
        )

    merged: Values = {}
    if carry_over:
        for code, options in existing.items():
            if code in explicit_removals or code in replacements:
                continue
            if code not in by_code:  # pragma: no cover - rejected above
                continue
            merged[code] = options

    merged.update(replacements)

    if require_complete:
        missing = [
            definition.name
            for definition in definitions
            if definition.is_required
            and is_missing_value(definition, merged.get(definition.code))
        ]
        if missing:
            raise InvalidInputError(
                "Missing required characteristics: " + ", ".join(missing)
            )
    return merged


def validate_values(
    db: Session,
    category_id: int,
    submissions: Iterable[CharacteristicSubmission] = (),
    existing: Mapping[str, tuple[SelectedOption, ...]] | None = None,
    removed: Iterable[str] = (),
    *,
    carry_over: bool = True,
    require_complete: bool = True,
) -> tuple[list[CharacteristicDefinition], Values]:
    """Validate a submission for one category and return the values to persist."""
    definitions = definitions_for_category(db, category_id)
    dictionary = load_options(db, [definition.id for definition in definitions])
    parsed = submitted_values(definitions, submissions, dictionary)
    resolved = resolve_values(
        definitions,
        existing or {},
        parsed,
        removed,
        carry_over=carry_over,
        require_complete=require_complete,
    )
    return definitions, resolved


# ── Persistence ─────────────────────────────────────────────────────────────


def ensure_option(db: Session, characteristic_id: int, value: str) -> int:
    """Return the dictionary id of `value`, inserting it once if it is new.

    `ON CONFLICT DO NOTHING` makes two concurrent editors computing the same GPU
    dimensions converge on one dictionary row: the loser of the race re-reads the
    row the winner inserted instead of failing or duplicating it. The caller owns
    the transaction, so a failed product write removes a newly created value too.
    """
    statement = (
        pg_insert(CharacteristicOption)
        .values(characteristic_name_id=characteristic_id, value=value)
        .on_conflict_do_nothing(
            index_elements=["characteristic_name_id", "value"],
        )
        .returning(CharacteristicOption.id)
    )
    inserted = db.execute(statement).scalar_one_or_none()
    if inserted is not None:
        return int(inserted)
    existing = db.scalar(
        select(CharacteristicOption.id).where(
            CharacteristicOption.characteristic_name_id == characteristic_id,
            CharacteristicOption.value == value,
        )
    )
    if existing is None:  # pragma: no cover - defensive
        raise InvalidInputError("The characteristic option could not be stored")
    return int(existing)


def replace_values(
    db: Session,
    product_id: int,
    definitions: Sequence[CharacteristicDefinition],
    target: Mapping[str, tuple[SelectedOption, ...]],
) -> None:
    """Make the stored associations of `product_id` exactly equal `target`.

    Rows that disappear are deleted, changed quantities are updated and new
    options are inserted. A value whose option id is still unresolved (only the
    canonical GPU dimensions) is written to the dictionary first, inside the
    caller's transaction.
    """
    by_code = {definition.code: definition for definition in definitions}
    unknown = sorted(code for code in target if code not in by_code)
    if unknown:  # pragma: no cover - validation runs before persistence
        raise InvalidInputError("Unknown characteristic codes: " + ", ".join(unknown))

    wanted: dict[int, list[SelectedOption]] = {}
    for code, submitted_options in target.items():
        definition = by_code[code]
        resolved: list[SelectedOption] = []
        for option in submitted_options:
            option_id = option.option_id
            if option_id == UNRESOLVED_OPTION_ID:
                option_id = ensure_option(db, definition.id, option.value)
            resolved.append(
                SelectedOption(
                    option_id=option_id,
                    value=option.value,
                    quantity=option.quantity,
                )
            )
        wanted[definition.id] = resolved

    stored_rows = db.scalars(
        select(ProductCharacteristicRow).where(
            ProductCharacteristicRow.product_id == product_id
        )
    ).all()
    existing = {
        (stored.characteristic_id, stored.characteristic_option_id): stored
        for stored in stored_rows
    }
    keep: set[tuple[int, int]] = set()
    for characteristic_id, selections in wanted.items():
        for option in selections:
            keep.add((characteristic_id, option.option_id))

    removed = [stored for key, stored in existing.items() if key not in keep]
    for stored in removed:
        db.delete(stored)
    if removed:
        # Deletions are flushed first so a re-inserted combination can never hit
        # the composite primary key of a row that is about to disappear.
        db.flush()

    for characteristic_id, selections in wanted.items():
        for option in selections:
            current = existing.get((characteristic_id, option.option_id))
            if current is None:
                db.add(
                    ProductCharacteristicRow(
                        product_id=product_id,
                        characteristic_id=characteristic_id,
                        characteristic_option_id=option.option_id,
                        quantity=option.quantity,
                    )
                )
            elif current.quantity != option.quantity:
                current.quantity = option.quantity
    db.flush()


# ── Serialization and formatting ────────────────────────────────────────────


def _contains_unit(text: str, unit: str) -> bool:
    """Whether a display value already carries its unit.

    The dictionary values are display-ready (`750 Вт`, `6 ядер`, `307 × 125 × 46 мм`),
    so a unit is never appended twice. Comparison is token-based, and a token may
    end with the unit because multipliers are written together (`об/мин`, `МБ/с`).
    """
    if not unit:
        return True
    return any(token == unit or token.endswith(unit) for token in text.split())


def append_unit(text: str, unit: str | None) -> str:
    """Append a unit only to a value that does not already contain it."""
    if not text or not unit or _contains_unit(text, unit):
        return text
    return f"{text} {unit}"


def structured_value(
    definition: CharacteristicDefinition, options: Sequence[SelectedOption]
) -> Any:
    """Native representation of a stored characteristic for API clients.

    Scalars keep one value, lists keep one entry per selected option, repeated
    connector options are repeated `quantity` times and dimensions become an
    ordered triple of numbers. Quantities themselves remain explicit in the
    serialized `options` array.
    """
    editor = definition.editor
    if editor == EDITOR_BOOLEAN:
        return parse_boolean(options[0].value) if options else None
    if not options:
        return None
    if editor == EDITOR_DIMENSIONS:
        return parse_dimensions(options[0].value)
    if editor == EDITOR_SELECT:
        value = options[0].value
        if definition.data_type == "number":
            return _number_or_text(value)
        return value
    expanded: list[Any] = []
    for option in options:
        if definition.data_type == "number_list":
            item: Any = _number_or_text(option.value)
        else:
            item = option.value
        repeats = option.quantity if editor == EDITOR_CONNECTORS else 1
        expanded.extend(item for _ in range(repeats))
    return expanded


def display_value(
    definition: CharacteristicDefinition, options: Sequence[SelectedOption]
) -> str:
    """Ready-to-render string of a stored characteristic.

    Units come from the dictionary values themselves; `append_unit` only covers a
    definition whose values do not carry their unit yet, and never duplicates one.
    """
    if not options:
        return ""
    if definition.editor == EDITOR_CONNECTORS:
        parts = [
            option.value
            if option.quantity == 1
            else f"{option.value} × {option.quantity}"
            for option in options
        ]
        return append_unit(", ".join(parts), definition.unit)
    if definition.editor == EDITOR_DIMENSIONS:
        # The canonical dictionary value already carries its unit and separators.
        return options[0].value
    return append_unit(", ".join(option.value for option in options), definition.unit)


def serialize_options(options: Sequence[SelectedOption]) -> list[dict[str, Any]]:
    """Explicit option/quantity rows of one characteristic."""
    return [
        {
            "option_id": option.option_id,
            "value": option.value,
            "quantity": option.quantity,
        }
        for option in options
    ]


def serialize_definitions(
    definitions: Sequence[CharacteristicDefinition],
    values: Mapping[str, tuple[SelectedOption, ...]],
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
        options = values.get(definition.code)
        if not options:
            continue
        rows.append(
            {
                "code": definition.code,
                "name": definition.name,
                "data_type": definition.data_type,
                "editor": definition.editor,
                "unit": definition.unit,
                "sort_order": definition.sort_order,
                "is_required": definition.is_required,
                "show_in_short": definition.show_in_short,
                "show_in_details": definition.show_in_details,
                "value": structured_value(definition, options),
                "options": serialize_options(options),
                "display_value": display_value(definition, options),
            }
        )
    return rows


def display_lines(
    definitions: Sequence[CharacteristicDefinition], values: Values
) -> list[str]:
    """Short display strings used for cart lines and order snapshots."""
    return [
        row["display_value"]
        for row in serialize_definitions(definitions, values, short_only=True)
    ]


def serialize_definition_fields(
    definitions: Sequence[CharacteristicDefinition],
    dictionary: Mapping[int, Sequence[DictionaryOption]],
) -> list[dict[str, Any]]:
    """Editor payload of every definition of one category.

    The full dictionary is returned — including options that no product uses yet —
    together with the editor behaviour and the limits the editor enforces.
    """
    fields: list[dict[str, Any]] = []
    for definition in definitions:
        editor = definition.editor
        fields.append(
            {
                "id": definition.id,
                "code": definition.code,
                "name": definition.name,
                "data_type": definition.data_type,
                "editor": editor,
                "unit": definition.unit,
                "sort_order": definition.sort_order,
                "is_required": definition.is_required,
                "show_in_short": definition.show_in_short,
                "show_in_details": definition.show_in_details,
                "options": [
                    {"option_id": option.id, "value": option.value}
                    for option in dictionary.get(definition.id, ())
                ],
                "limits": _editor_limits(editor),
            }
        )
    return fields


def _editor_limits(editor: str) -> dict[str, Any]:
    if editor == EDITOR_DIMENSIONS:
        return {
            "max_selections": DIMENSION_COUNT,  # one value built from three numbers
            "max_quantity": 1,
            "repeatable": False,
            "dimensions": {
                "count": DIMENSION_COUNT,
                "unit": DIMENSION_UNIT,
                "max_value": str(MAX_DIMENSION_MM),
                "decimal_places": DIMENSION_DECIMAL_PLACES,
            },
        }
    return {
        "max_selections": 1
        if editor in (EDITOR_SELECT, EDITOR_BOOLEAN)
        else MAX_SELECTION_COUNT,
        "max_quantity": MAX_QUANTITY if editor == EDITOR_CONNECTORS else 1,
        "repeatable": editor == EDITOR_CONNECTORS,
        "dimensions": None,
    }
