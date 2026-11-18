"""Product specification templates from `product_spec_fields` / `_options`.

The template is the server-side contract for administratively created products:
only configured codes are accepted, required fields must be present, and fields
that declare dropdown options accept only those values. The validated values are
merged into `products.technical_specs`, which the compatibility engine and the
public catalog already consume, so no schema or JSON shape change is required.

`technical_specs` also carries legitimate non-template keys used by the catalog
and the compatibility engine. Template codes are therefore validated wherever
they appear in a request: the same allowed-value and length rules apply whether
the value arrived through `specifications` or through `technical_specs`, and a
conflict between the two inputs is rejected instead of silently resolved.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ProductSpecField, ProductSpecOption
from app.services.errors import InvalidInputError

MAX_FIELD_VALUE_LENGTH = 180


def template_fields(
    db: Session, product_type_id: int
) -> tuple[list[ProductSpecField], dict[int, list[ProductSpecOption]]]:
    fields = list(
        db.scalars(
            select(ProductSpecField)
            .where(ProductSpecField.product_type_id == product_type_id)
            .order_by(ProductSpecField.sort_order, ProductSpecField.id)
        ).all()
    )
    options: dict[int, list[ProductSpecOption]] = {}
    if fields:
        rows = db.scalars(
            select(ProductSpecOption)
            .where(ProductSpecOption.field_id.in_([field.id for field in fields]))
            .order_by(
                ProductSpecOption.field_id,
                ProductSpecOption.sort_order,
                ProductSpecOption.id,
            )
        ).all()
        for row in rows:
            options.setdefault(row.field_id, []).append(row)
    return fields, options


def specifications_view(
    technical_specs: dict[str, Any] | None, fields: list[ProductSpecField]
) -> dict[str, str]:
    """Return only template codes that currently hold a scalar value."""
    source = technical_specs or {}
    view: dict[str, str] = {}
    for field in fields:
        value = source.get(field.code)
        if isinstance(value, str | int | float) and not isinstance(value, bool):
            text = str(value).strip()
            if text:
                view[field.code] = text
    return view


def _template_text(field: ProductSpecField, raw: object) -> str:
    """Normalize one raw `technical_specs` value for a template field."""
    if raw is None or isinstance(raw, bool):
        return ""
    if isinstance(raw, str | int | float):
        return str(raw).strip()
    raise InvalidInputError(
        f"Specification '{field.label}' must be a single scalar value"
    )


def validate_specifications(
    db: Session,
    product_type_id: int,
    submitted: dict[str, str] | None = None,
    technical_specs: dict[str, Any] | None = None,
    base: dict[str, Any] | None = None,
    *,
    require_complete: bool = True,
) -> dict[str, Any]:
    """Validate submitted codes/values and return the merged technical specs.

    `submitted` is the `specifications` property (template codes only).
    `technical_specs` is the raw property from the same request: its template
    codes are validated exactly like `submitted`, while its other keys remain
    legitimate non-template specifications. `base` is the raw `technical_specs`
    the result is merged onto (the request payload when it replaces the stored
    value, otherwise the stored specs).
    """
    fields, options = template_fields(db, product_type_id)
    by_code = {field.code: field for field in fields}

    submitted_values: dict[str, str] = {}
    for raw_code, raw_value in (submitted or {}).items():
        code = raw_code.strip()
        field = by_code.get(code)
        if field is None:
            raise InvalidInputError(f"Unknown specification field: {code}")
        submitted_values[code] = str(raw_value).strip()

    technical_values: dict[str, str] = {}
    for code, field in by_code.items():
        if technical_specs is not None and code in technical_specs:
            technical_values[code] = _template_text(field, technical_specs[code])

    merged: dict[str, Any] = dict(base or {})
    for code, field in by_code.items():
        provided = [
            value
            for value in (
                submitted_values.get(code),
                technical_values.get(code),
            )
            if value is not None
        ]
        if not provided:
            continue
        if len(set(provided)) > 1:
            raise InvalidInputError(
                f"Conflicting values submitted for specification '{field.label}'"
            )
        text = provided[0]
        if len(text) > MAX_FIELD_VALUE_LENGTH:
            raise InvalidInputError(
                f"Specification '{field.label}' is longer than "
                f"{MAX_FIELD_VALUE_LENGTH} characters"
            )
        allowed = [option.value for option in options.get(field.id, [])]
        if text and allowed and text not in allowed:
            raise InvalidInputError(
                f"Value '{text}' is not allowed for specification '{field.label}'"
            )
        merged[code] = text

    if require_complete:
        missing = [
            field.label
            for field in fields
            if field.is_required and not str(merged.get(field.code) or "").strip()
        ]
        if missing:
            raise InvalidInputError(
                "Missing required specifications: " + ", ".join(missing)
            )
    return merged
