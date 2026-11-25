"""Pydantic contracts for product, characteristic and image administration."""

from __future__ import annotations

import math
import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.schemas.catalog import (
    CategoryOut,
    CharacteristicValueOut,
    ManufacturerOut,
    ProductTypeOut,
)

ProductStatusFilter = Literal["all", "active", "inactive"]
ProductSort = Literal[
    "created_desc",
    "created_asc",
    "updated_desc",
    "updated_asc",
    "name_asc",
    "name_desc",
    "price_asc",
    "price_desc",
    "stock_asc",
    "stock_desc",
    "id_asc",
    "id_desc",
]
CharacteristicDataType = Literal[
    "string", "number", "boolean", "string_list", "number_list"
]
CharacteristicEditor = Literal[
    "select", "boolean", "multiselect", "connector_quantity", "dimensions"
]

MAX_IMAGE_COUNT = 10
# Mirrors the service limits so an oversized payload fails before the service.
MAX_SELECTION_COUNT = 50
MAX_QUANTITY = 32
MAX_DIMENSION_MM = 1000
# A plain decimal literal: no exponent, no sign, no grouping, no whitespace.
_DIMENSION_TEXT = re.compile(r"^\d{1,4}(?:\.\d{1,2})?$")
_SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_NON_NULLABLE_UPDATE_FIELDS = (
    "name",
    "product_type_id",
    "manufacturer_id",
    "price",
    "stock_quantity",
    "description",
    "slug",
    "characteristics",
    "on_sale",
    "is_active",
    "listed_at",
)


# ── Characteristic definitions (category-scoped) ─────────────────────────────


class CharacteristicOptionOut(BaseModel):
    """One selectable dictionary value of a definition."""

    option_id: int
    value: str


class CharacteristicDimensionLimitsOut(BaseModel):
    """Limits of the three-measurement dimensions editor."""

    count: int
    unit: str
    max_value: str
    decimal_places: int


class CharacteristicEditorLimitsOut(BaseModel):
    """Limits the editor enforces for one definition."""

    max_selections: int
    max_quantity: int
    repeatable: bool
    dimensions: CharacteristicDimensionLimitsOut | None = None


class CharacteristicDefinitionOut(BaseModel):
    """One server-side field definition the admin editor renders dynamically."""

    id: int
    code: str
    name: str
    data_type: CharacteristicDataType
    editor: CharacteristicEditor
    unit: str | None = None
    sort_order: int
    is_required: bool
    show_in_short: bool
    show_in_details: bool
    # The complete dictionary of this definition, including unused options.
    options: list[CharacteristicOptionOut] = []
    limits: CharacteristicEditorLimitsOut


class CharacteristicDefinitionsOut(BaseModel):
    category_id: int
    category_name: str
    fields: list[CharacteristicDefinitionOut] = []


class CharacteristicOptionSelectionIn(BaseModel):
    """One submitted dictionary pick with its repeat count."""

    model_config = ConfigDict(extra="forbid")

    option_id: int = Field(gt=0)
    quantity: int = Field(default=1, ge=1, le=MAX_QUANTITY)


class CharacteristicOptionsIn(BaseModel):
    """An ordinary characteristic write: explicit dictionary selections.

    A list of pairs (instead of an object) lets the API reject a duplicated code
    in the same payload, which an object would silently collapse.
    """

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    options: list[CharacteristicOptionSelectionIn] = Field(
        min_length=1, max_length=MAX_SELECTION_COUNT
    )

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Characteristic code must not be blank")
        return cleaned


DimensionMeasurement = Annotated[
    Decimal, Field(gt=0, le=MAX_DIMENSION_MM, allow_inf_nan=False)
]


def _dimension_text(value: object) -> str:
    """Canonical plain-decimal text of one submitted measurement.

    Exponent notation, grouping separators, signs, whitespace and non-numeric
    text are rejected instead of being repaired; more than two decimal places is
    rejected because the stored dictionary value cannot represent it faithfully.
    """
    if isinstance(value, bool) or value is None:
        raise ValueError("A dimension measurement must be a number")
    if isinstance(value, str):
        text = value
    elif isinstance(value, int):
        text = str(value)
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("A dimension measurement must be finite")
        text = format(Decimal(repr(value)), "f")
    elif isinstance(value, Decimal):
        if not value.is_finite():
            raise ValueError("A dimension measurement must be finite")
        text = format(value, "f")
    else:
        raise TypeError("A dimension measurement must be a number")
    if _DIMENSION_TEXT.match(text) is None:
        raise ValueError(
            "A dimension measurement must be a plain number with at most two "
            "decimal places"
        )
    return text


class CharacteristicDimensionsIn(BaseModel):
    """A GPU dimensions write: exactly three ordered millimetre measurements."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    dimensions: tuple[DimensionMeasurement, DimensionMeasurement, DimensionMeasurement]

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Characteristic code must not be blank")
        return cleaned

    @field_validator("dimensions", mode="before")
    @classmethod
    def clean_dimensions(cls, value: object) -> object:
        if not isinstance(value, list | tuple):
            raise TypeError("Exactly three dimensions are required")
        if len(value) != 3:
            raise ValueError("Exactly three dimensions are required")
        return tuple(_dimension_text(item) for item in value)


CharacteristicValueIn = Annotated[
    CharacteristicOptionsIn | CharacteristicDimensionsIn,
    Field(union_mode="left_to_right"),
]


# ── Shared catalogue payloads ────────────────────────────────────────────────


class ProductTypeWithCategoryOut(BaseModel):
    category: CategoryOut
    product_types: list[ProductTypeOut] = []


class ProductFormOptionsOut(BaseModel):
    categories: list[ProductTypeWithCategoryOut] = []
    manufacturers: list[ManufacturerOut] = []


class AdminProductImageOut(BaseModel):
    id: int
    url: str
    alt_text: str | None = None
    sort_order: int
    is_cover: bool = False


class AdminProductSummaryOut(BaseModel):
    id: int
    slug: str
    sku: str | None = None
    name: str
    price: Decimal
    stock_quantity: int
    is_active: bool
    on_sale: bool
    category: CategoryOut
    product_type: ProductTypeOut
    manufacturer: ManufacturerOut
    cover_image_url: str
    image_count: int
    listed_at: date
    created_at: datetime
    updated_at: datetime


class AdminPaginatedProductsOut(BaseModel):
    items: list[AdminProductSummaryOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class AdminProductDetailOut(BaseModel):
    id: int
    slug: str
    sku: str | None = None
    name: str
    description: str
    price: Decimal
    stock_quantity: int
    color: str | None = None
    graphics_chip_brand: str | None = None
    # Every value currently stored for the product, ordered by definition order.
    characteristics: list[CharacteristicValueOut] = []
    on_sale: bool
    is_active: bool
    listed_at: date
    created_at: datetime
    updated_at: datetime
    category: CategoryOut
    product_type: ProductTypeOut
    manufacturer: ManufacturerOut
    images: list[AdminProductImageOut] = []
    cover_image_url: str
    average_rating: float = 0.0
    review_count: int = 0


def _clean_name(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    if len(cleaned) < 2:
        raise ValueError("Name must contain at least 2 characters")
    return cleaned


def _clean_sku(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    if not cleaned:
        return None
    if not cleaned.replace("-", "").replace("_", "").replace(".", "").isalnum():
        raise ValueError("SKU may contain letters, digits, '-', '_' and '.' only")
    return cleaned


def _clean_slug(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = "-".join(
        part for part in value.strip().lower().replace("_", "-").split("-") if part
    )
    if not cleaned:
        return None
    if _SLUG_RE.fullmatch(cleaned) is None:
        raise ValueError("Slug must use lowercase latin letters, digits and '-' only")
    return cleaned[:180]


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    return " ".join(value.split()) or None


class AdminProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=255)
    product_type_id: int = Field(gt=0)
    manufacturer_id: int = Field(gt=0)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0, le=1_000_000)
    description: str = Field(default="", max_length=20000)
    sku: str | None = Field(default=None, max_length=80)
    slug: str | None = Field(default=None, max_length=180)
    color: str | None = Field(default=None, max_length=80)
    graphics_chip_brand: str | None = Field(default=None, max_length=40)
    characteristics: list[CharacteristicValueIn] = Field(
        default_factory=list, max_length=200
    )
    on_sale: bool = False
    is_active: bool = True
    listed_at: date | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = _clean_name(value)
        if cleaned is None:  # pragma: no cover - Field guarantees a string
            raise ValueError("Name is required")
        return cleaned

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, value: str | None) -> str | None:
        return _clean_sku(value)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        return _clean_slug(value)

    @field_validator("color", "graphics_chip_brand")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return _clean_optional_text(value)


class AdminProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=255)
    product_type_id: int | None = Field(default=None, gt=0)
    manufacturer_id: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    stock_quantity: int | None = Field(default=None, ge=0, le=1_000_000)
    description: str | None = Field(default=None, max_length=20000)
    sku: str | None = Field(default=None, max_length=80)
    slug: str | None = Field(default=None, max_length=180)
    color: str | None = Field(default=None, max_length=80)
    graphics_chip_brand: str | None = Field(default=None, max_length=40)
    characteristics: list[CharacteristicValueIn] | None = Field(
        default=None, max_length=200
    )
    remove_characteristics: list[str] | None = Field(default=None, max_length=200)
    on_sale: bool | None = None
    is_active: bool | None = None
    listed_at: date | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        return _clean_name(value)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("sku")
    @classmethod
    def validate_sku(cls, value: str | None) -> str | None:
        return _clean_sku(value)

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, value: str | None) -> str | None:
        return _clean_slug(value)

    @field_validator("color", "graphics_chip_brand")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        return _clean_optional_text(value)

    @model_validator(mode="after")
    def reject_explicit_nulls(self) -> AdminProductUpdate:
        provided = self.model_fields_set
        for field in _NON_NULLABLE_UPDATE_FIELDS:
            if field in provided and getattr(self, field) is None:
                raise ValueError(f"'{field}' cannot be null")
        return self


class AdminImageOrderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_ids: list[int] = Field(min_length=1, max_length=MAX_IMAGE_COUNT)
