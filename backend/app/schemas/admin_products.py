"""Pydantic contracts for product, specification and image administration."""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.catalog import (
    CategoryOut,
    ManufacturerOut,
    ProductDisplaySpecOut,
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

MAX_IMAGE_COUNT = 10
_SLUG_RE = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
_NON_NULLABLE_UPDATE_FIELDS = (
    "name",
    "product_type_id",
    "manufacturer_id",
    "price",
    "stock_quantity",
    "description",
    "slug",
    "spec_lines",
    "short_specs",
    "technical_specs",
    "display_specs",
    "on_sale",
    "is_active",
    "listed_at",
)


class ProductSpecOptionOut(BaseModel):
    id: int
    value: str
    sort_order: int


class ProductSpecFieldOut(BaseModel):
    id: int
    code: str
    label: str
    sort_order: int
    is_required: bool
    options: list[ProductSpecOptionOut] = []


class SpecificationTemplateOut(BaseModel):
    product_type_id: int
    product_type_name: str
    fields: list[ProductSpecFieldOut] = []


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
    spec_lines: list[str] = []
    short_specs: list[str] = []
    technical_specs: dict[str, Any] = {}
    display_specs: list[ProductDisplaySpecOut] = []
    specifications: dict[str, str] = {}
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


class ProductDisplaySpecIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    value: str = Field(min_length=1, max_length=300)

    @field_validator("label", "value")
    @classmethod
    def clean_text(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Value must not be blank")
        return cleaned


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


def _clean_lines(value: list[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in value:
        text = " ".join(raw.split())
        if not text:
            continue
        if len(text) > 300:
            raise ValueError("Specification lines must be at most 300 characters")
        cleaned.append(text)
    return cleaned


def _clean_technical_specs(value: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    for raw_key, raw_value in value.items():
        key = raw_key.strip()
        if not key or len(key) > 64:
            raise ValueError("Specification keys must be 1-64 characters")
        if isinstance(raw_value, str):
            cleaned[key] = raw_value.strip()[:500]
        elif isinstance(raw_value, bool | int | float) or raw_value is None:
            cleaned[key] = raw_value
        else:
            raise ValueError("Specification values must be scalar values")
    return cleaned


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
    spec_lines: list[str] = Field(default_factory=list, max_length=40)
    short_specs: list[str] = Field(default_factory=list, max_length=20)
    technical_specs: dict[str, Any] = Field(default_factory=dict)
    display_specs: list[ProductDisplaySpecIn] = Field(
        default_factory=list, max_length=60
    )
    specifications: dict[str, str] | None = None
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

    @field_validator("spec_lines", "short_specs")
    @classmethod
    def validate_spec_lines(cls, value: list[str]) -> list[str]:
        return _clean_lines(value)

    @field_validator("technical_specs")
    @classmethod
    def validate_technical(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _clean_technical_specs(value)


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
    spec_lines: list[str] | None = Field(default=None, max_length=40)
    short_specs: list[str] | None = Field(default=None, max_length=20)
    technical_specs: dict[str, Any] | None = None
    display_specs: list[ProductDisplaySpecIn] | None = Field(
        default=None, max_length=60
    )
    specifications: dict[str, str] | None = None
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

    @field_validator("spec_lines", "short_specs")
    @classmethod
    def validate_spec_lines(cls, value: list[str] | None) -> list[str] | None:
        return None if value is None else _clean_lines(value)

    @field_validator("technical_specs")
    @classmethod
    def validate_technical(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return None if value is None else _clean_technical_specs(value)

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
