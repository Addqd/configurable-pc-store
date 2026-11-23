"""Pydantic schemas for the catalog API."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel

# ── Category / Type / Manufacturer ───────────────────────────────────────────


class CategoryOut(BaseModel):
    id: int
    slug: str
    name: str
    sort_order: int


class ProductTypeOut(BaseModel):
    id: int
    category_id: int
    slug: str
    name: str


class ManufacturerOut(BaseModel):
    id: int
    slug: str
    name: str


# ── Product characteristics ──────────────────────────────────────────────────


class CharacteristicValueOut(BaseModel):
    """One category-scoped characteristic value of a product.

    `value` keeps its native JSON type (number, boolean, ordered list) so clients
    can reason about it structurally. `display_value` is the ready-to-render
    string: unit appended once, no raw JSON and no Python representation.
    """

    code: str
    name: str
    data_type: str
    unit: str | None = None
    sort_order: int
    is_required: bool
    show_in_short: bool
    show_in_details: bool
    value: Any
    display_value: str


# ── Product ──────────────────────────────────────────────────────────────────


class ProductImageOut(BaseModel):
    url: str
    alt_text: str | None = None
    sort_order: int


class ProductDetailOut(BaseModel):
    id: int
    sku: str | None = None
    slug: str
    name: str
    description: str
    price: Decimal
    stock_quantity: int
    color: str | None = None
    graphics_chip_brand: str | None = None
    # Every value of the product's category, ordered by the definition order.
    characteristics: list[CharacteristicValueOut] = []
    on_sale: bool
    is_active: bool
    listed_at: date
    created_at: datetime
    updated_at: datetime
    # Relationships
    category: CategoryOut
    product_type: ProductTypeOut
    manufacturer: ManufacturerOut
    # Images
    cover_image_url: str
    images: list[ProductImageOut] = []
    # Rating metadata
    average_rating: float = 0.0
    review_count: int = 0


class ProductSummaryOut(BaseModel):
    id: int
    slug: str
    name: str
    price: Decimal
    # Only characteristics flagged `show_in_short`, ordered by `sort_order`.
    short_characteristics: list[CharacteristicValueOut] = []
    color: str | None = None
    graphics_chip_brand: str | None = None
    on_sale: bool
    is_active: bool
    # Images
    cover_image_url: str
    images: list[ProductImageOut] = []
    # Rating metadata
    average_rating: float = 0.0
    review_count: int = 0
    # Category/type for display
    category: CategoryOut
    product_type: ProductTypeOut
    manufacturer: ManufacturerOut


class PaginatedProductsOut(BaseModel):
    items: list[ProductSummaryOut]
    total: int
    page: int
    page_size: int
    total_pages: int


# ── Search ───────────────────────────────────────────────────────────────────


class SearchSuggestionOut(BaseModel):
    id: int
    slug: str
    name: str
    price: Decimal
    cover_image_url: str


class SearchResultsOut(BaseModel):
    items: list[SearchSuggestionOut]
    total: int


# ── Filter options ───────────────────────────────────────────────────────────


class FilterOptionsOut(BaseModel):
    categories: list[CategoryOut]
    types: list[ProductTypeOut]
    colors: list[str]
    manufacturers: list[ManufacturerOut]
