"""Small, shared SQL helpers used by the administrative services."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

_CENT = Decimal("0.01")


def escape_like(value: str) -> str:
    """Escape LIKE wildcards so a user-supplied term is matched literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def like_pattern(value: str) -> str:
    return f"%{escape_like(value.strip())}%"


def money(value: Any) -> Decimal:
    """Coerce an aggregate result into an exact, 2-decimal monetary value."""
    if value is None:
        return Decimal("0.00")
    if isinstance(value, Decimal):
        return value.quantize(_CENT, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)


def as_int(value: Any) -> int:
    return int(value or 0)
