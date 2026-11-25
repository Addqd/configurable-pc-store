"""Central policy of the editable scalar numeric characteristics.

The administration editor may accept a custom scalar number for a small, explicit
set of category-scoped definitions. That set — and the limits every custom value
has to respect — lives here and nowhere else: the API exposes it, the service
enforces it and the frontend consumes it, so no second allowlist can drift.

Nothing in this module touches the database. The dictionary keeps storing
display-ready strings (`750 Вт`, `3.4 ГГц`, `CL36`, `24″`, `2.5 слота`), so a
submitted number is turned into exactly the wording the restored export uses for
that field, and an already stored equivalent value is reused instead of being
duplicated. No ORM model, table or column is added for this.

Keyed by ``(category slug, characteristic code)`` — never by a database id.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Final

from app.services.errors import InvalidInputError

# How the fixed part of the value is attached to the number.
STYLE_SUFFIX: Final = "suffix"
STYLE_PREFIX: Final = "prefix"
STYLE_SYMBOL: Final = "symbol"

STYLES: Final = (STYLE_SUFFIX, STYLE_PREFIX, STYLE_SYMBOL)

# A plain decimal literal. A leading sign is matched only so that a negative
# number is rejected with its own message instead of a generic format error;
# exponent notation, grouping separators and whitespace never match. Only ASCII
# digits are accepted, so a mixed-script number cannot enter the dictionary.
_NUMERIC_LITERAL: Final = re.compile(r"[+-]?[0-9]+(?:\.[0-9]+)?")
# Upper bound for one submitted value text (the dictionary column allows 500).
MAX_NUMERIC_TEXT_LENGTH: Final = 20


@dataclass(frozen=True, slots=True)
class PluralForms:
    """Russian count word of one field, in all three grammatical numbers."""

    one: str
    few: str
    many: str


@dataclass(frozen=True, slots=True)
class NumericFieldPolicy:
    """Everything that makes one field's custom numeric value well formed."""

    max_value: Decimal
    decimal_places: int
    style: str = STYLE_SUFFIX
    # Constant unit/prefix/symbol; `None` when the word depends on the number.
    affix: str | None = None
    plural: PluralForms | None = None

    @property
    def suffix_words(self) -> tuple[str, ...]:
        """Every word that may follow the number of this field."""
        if self.plural is not None:
            return (self.plural.one, self.plural.few, self.plural.many)
        return (self.affix,) if self.affix else ()


# ── Russian count words used by the allowlisted fields ──────────────────────
CORES = PluralForms("ядро", "ядра", "ядер")
THREADS = PluralForms("поток", "потока", "потоков")
SLOTS = PluralForms("слот", "слота", "слотов")


def _suffix(unit: str, maximum: str, places: int = 0) -> NumericFieldPolicy:
    return NumericFieldPolicy(
        max_value=Decimal(maximum),
        decimal_places=places,
        style=STYLE_SUFFIX,
        affix=unit,
    )


def _plural(forms: PluralForms, maximum: str, places: int = 0) -> NumericFieldPolicy:
    return NumericFieldPolicy(
        max_value=Decimal(maximum),
        decimal_places=places,
        style=STYLE_SUFFIX,
        plural=forms,
    )


def _prefix(affix: str, maximum: str) -> NumericFieldPolicy:
    return NumericFieldPolicy(
        max_value=Decimal(maximum), decimal_places=0, style=STYLE_PREFIX, affix=affix
    )


def _symbol(symbol: str, maximum: str, places: int) -> NumericFieldPolicy:
    return NumericFieldPolicy(
        max_value=Decimal(maximum),
        decimal_places=places,
        style=STYLE_SYMBOL,
        affix=symbol,
    )


# ── The allowlist: exactly 52 definitions ───────────────────────────────────
NUMERIC_FIELDS: Final[dict[tuple[str, str], NumericFieldPolicy]] = {
    # CPU (17)
    ("cpu", "cores"): _plural(CORES, "1024"),
    ("cpu", "threads"): _plural(THREADS, "2048"),
    ("cpu", "base_clock_ghz"): _suffix("ГГц", "20", 3),
    ("cpu", "max_clock_ghz"): _suffix("ГГц", "20", 3),
    ("cpu", "cache_l1_kb"): _suffix("КБ", "1048576"),
    ("cpu", "cache_l2_mb"): _suffix("МБ", "16384", 3),
    ("cpu", "cache_l3_mb"): _suffix("МБ", "16384", 3),
    ("cpu", "thermal_design_power_w"): _suffix("Вт", "2000", 2),
    ("cpu", "max_temperature_c"): _suffix("°C", "200", 2),
    ("cpu", "supported_ram_speed_mhz"): _suffix("МГц", "50000"),
    ("cpu", "integrated_gpu_cores"): _plural(CORES, "131072"),
    ("cpu", "integrated_gpu_clock_mhz"): _suffix("МГц", "10000"),
    ("cpu", "performance_cores"): _plural(CORES, "1024"),
    ("cpu", "efficiency_cores"): _plural(CORES, "1024"),
    ("cpu", "cache_smart_mb"): _suffix("МБ", "16384", 3),
    ("cpu", "processor_base_power_w"): _suffix("Вт", "2000", 2),
    ("cpu", "maximum_turbo_power_w"): _suffix("Вт", "2000", 2),
    # GPU (10)
    ("gpu", "cuda_cores"): _plural(CORES, "131072"),
    ("gpu", "vram_gb"): _suffix("ГБ", "2048", 2),
    ("gpu", "memory_speed_gbps"): _suffix("Гбит/с", "1000", 3),
    ("gpu", "boost_clock_mhz"): _suffix("МГц", "10000"),
    ("gpu", "extreme_clock_mhz"): _suffix("МГц", "10000"),
    ("gpu", "max_power_draw_w"): _suffix("Вт", "5000", 2),
    ("gpu", "recommended_psu_w"): _suffix("Вт", "10000"),
    ("gpu", "weight_g"): _suffix("г", "20000", 2),
    ("gpu", "length_mm"): _suffix("мм", "1000", 2),
    ("gpu", "thickness_slots"): _plural(SLOTS, "20", 2),
    # Motherboards (1)
    ("mobo", "max_memory_gb"): _suffix("ГБ", "65536"),
    # RAM (4)
    ("ram", "frequency_mhz"): _suffix("МГц", "50000"),
    ("ram", "cas_latency"): _prefix("CL", "256"),
    ("ram", "module_size_gb"): _suffix("ГБ", "4096"),
    ("ram", "capacity_gb"): _suffix("ГБ", "65536"),
    # SSD / storage (4)
    ("storage", "read_speed_mb_s"): _suffix("МБ/с", "1000000", 2),
    ("storage", "write_speed_mb_s"): _suffix("МБ/с", "1000000", 2),
    ("storage", "dram_cache_gb"): _suffix("ГБ", "1024", 3),
    ("storage", "capacity_gb"): _suffix("ГБ", "1048576"),
    # HDD (3)
    ("hdd", "rpm"): _suffix("об/мин", "30000"),
    ("hdd", "cache_mb"): _suffix("МБ", "16384"),
    ("hdd", "capacity_gb"): _suffix("ГБ", "1048576"),
    # PSU (2)
    ("psu", "wattage_w"): _suffix("Вт", "10000"),
    ("psu", "length_mm"): _suffix("мм", "1000", 2),
    # Monitors (3)
    ("monitor", "diagonal_inch"): _symbol("″", "200", 2),
    ("monitor", "refresh_rate_hz"): _suffix("Гц", "2000", 2),
    ("monitor", "response_time_ms"): _suffix("мс", "1000", 4),
    # Peripherals (2)
    ("peripheral", "sensor_dpi"): _suffix("DPI", "1000000"),
    ("peripheral", "driver_diameter_mm"): _suffix("мм", "1000", 2),
    # Prebuilt PCs (6)
    ("prebuilt", "cores"): _plural(CORES, "1024"),
    ("prebuilt", "threads"): _plural(THREADS, "2048"),
    ("prebuilt", "base_clock_ghz"): _suffix("ГГц", "20", 3),
    ("prebuilt", "max_clock_ghz"): _suffix("ГГц", "20", 3),
    ("prebuilt", "ram_capacity_gb"): _suffix("ГБ", "65536"),
    ("prebuilt", "storage_capacity_gb"): _suffix("ГБ", "1048576"),
}


def numeric_policy(category_slug: str, code: str) -> NumericFieldPolicy | None:
    """Policy of one definition, or `None` when it is not editable."""
    return NUMERIC_FIELDS.get((category_slug, code))


def is_numeric_field(category_slug: str, code: str) -> bool:
    """Whether a custom scalar number may be submitted for this definition."""
    return (category_slug, code) in NUMERIC_FIELDS


# ── Validation ──────────────────────────────────────────────────────────────


def _decimal_places(number: Decimal) -> int:
    """Fractional digits of a number, ignoring trailing zeros."""
    exponent = number.normalize().as_tuple().exponent
    if isinstance(exponent, int) and exponent < 0:
        return -exponent
    return 0


def parse_numeric_literal(raw: object) -> Decimal:
    """Strict lexical parse of a submitted numeric value.

    Only a plain decimal literal is accepted. Exponent notation, grouping
    separators, embedded whitespace, unit suffixes and non-string values are
    rejected instead of being repaired — `1 2` never becomes `12`.
    """
    if isinstance(raw, bool) or not isinstance(raw, str):
        # A `ValueError`-free path: the caller maps this to HTTP 422.
        raise InvalidInputError("A custom numeric value must be a decimal string")
    text = raw
    if not text.strip():
        raise InvalidInputError("A custom numeric value must not be empty")
    if len(text) > MAX_NUMERIC_TEXT_LENGTH:
        raise InvalidInputError("A custom numeric value is too long")
    if _NUMERIC_LITERAL.fullmatch(text) is None:
        raise InvalidInputError(
            "A custom numeric value must be a plain decimal number without "
            "exponent notation, spaces, grouping separators or a unit"
        )
    try:
        number = Decimal(text)
    except InvalidOperation:  # pragma: no cover - the pattern already validates
        raise InvalidInputError("A custom numeric value is not a number") from None
    if not number.is_finite():  # pragma: no cover - no literal form reaches this
        raise InvalidInputError("A custom numeric value must be finite")
    return number


def validate_numeric_value(policy: NumericFieldPolicy, raw: object) -> Decimal:
    """Validate one submitted number against its field policy."""
    number = parse_numeric_literal(raw)
    if number <= 0:
        raise InvalidInputError("A custom numeric value must be greater than zero")
    if number > policy.max_value:
        raise InvalidInputError(
            f"A custom numeric value must not exceed {format_decimal(policy.max_value)}"
        )
    places = _decimal_places(number)
    if places > policy.decimal_places:
        raise InvalidInputError(
            "A custom numeric value supports at most "
            f"{policy.decimal_places} decimal places"
        )
    return number


# ── Canonical display wording ───────────────────────────────────────────────


def format_decimal(number: Decimal) -> str:
    """Canonical decimal text: no trailing zeros, no exponent notation."""
    text = format(number.normalize(), "f")
    return "0" if text in {"-0", "0"} else text


def plural_word(forms: PluralForms, number: Decimal) -> str:
    """Russian count word of `number` (`1 ядро`, `2 ядра`, `6 ядер`)."""
    if number != number.to_integral_value():
        # A fraction takes the genitive singular: `2.5 слота`.
        return forms.few
    count = int(number)
    if 11 <= count % 100 <= 14:
        return forms.many
    last = count % 10
    if last == 1:
        return forms.one
    if 2 <= last <= 4:
        return forms.few
    return forms.many


def format_numeric_value(policy: NumericFieldPolicy, number: Decimal) -> str:
    """The dictionary wording of one validated number for its own field."""
    text = format_decimal(number)
    if policy.style == STYLE_PREFIX:
        return f"{policy.affix}{text}"
    if policy.style == STYLE_SYMBOL:
        return f"{text}{policy.affix}"
    word = (
        plural_word(policy.plural, number)
        if policy.plural is not None
        else policy.affix
    )
    return f"{text} {word}"


def parse_numeric_option(policy: NumericFieldPolicy, value: str) -> Decimal | None:
    """Magnitude of an already stored dictionary value of this field.

    Used to recognise an equivalent existing option (`3.40 ГГц` next to a stored
    `3.4 ГГц`) so a custom submission reuses it instead of adding a duplicate.
    A value that does not follow the field's own wording is not guessed.
    """
    text = value.strip()
    if policy.style == STYLE_PREFIX:
        if not policy.affix or not text.startswith(policy.affix):
            return None
        text = text[len(policy.affix) :].strip()
    elif policy.style == STYLE_SYMBOL:
        if not policy.affix or not text.endswith(policy.affix):
            return None
        text = text[: -len(policy.affix)].strip()
    else:
        body: str | None = None
        for word in policy.suffix_words:
            suffix = f" {word}"
            if text.endswith(suffix):
                body = text[: -len(suffix)]
                break
        if body is None:
            return None
        text = body.strip()
    if _NUMERIC_LITERAL.fullmatch(text) is None:
        return None
    try:
        return Decimal(text)
    except InvalidOperation:  # pragma: no cover - the pattern already validates
        return None


def numeric_editor_limits(policy: NumericFieldPolicy) -> dict[str, Any]:
    """Metadata of one numeric editor, as exposed to the administration client."""
    forms = policy.plural
    return {
        "max_value": format_decimal(policy.max_value),
        "decimal_places": policy.decimal_places,
        "style": policy.style,
        "affix": policy.affix,
        "plural_forms": (
            {"one": forms.one, "few": forms.few, "many": forms.many}
            if forms is not None
            else None
        ),
    }


def numeric_sort_key(policy: NumericFieldPolicy, value: str) -> tuple[int, Any, str]:
    """Sort key ordering stored options by magnitude, then by their text."""
    magnitude = parse_numeric_option(policy, value)
    if magnitude is None:
        # A value the field's own wording cannot explain stays last but is kept.
        return (1, Decimal(0), value)
    return (0, magnitude, value)
