"""Pydantic schemas for cart and orders API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.build import BuildItemCreate


class CartItemOut(BaseModel):
    id: int
    kind: str  # "product" or "custom_build"
    product_id: int | None = None
    saved_build_id: int | None = None
    product: dict[str, Any] | None = None  # minimal product info
    build_snapshot: dict[str, Any] | None = None
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    created_at: datetime
    updated_at: datetime


class CartOut(BaseModel):
    id: int
    items: list[CartItemOut] = []
    subtotal: Decimal
    item_count: int
    created_at: datetime
    updated_at: datetime


class CartAddProductRequest(BaseModel):
    product_id: int = Field(gt=0)
    quantity: int = Field(gt=0, default=1)


class BuyNowRequest(CartAddProductRequest):
    idempotency_key: UUID


class CartAddBuildRequest(BaseModel):
    """Add a saved build or a directly configured, never-saved build.

    Exactly one source is required: `saved_build_id` for an existing private
    saved build, or `items` for a configuration submitted from the configurator.

    `expected_items` optionally accompanies `saved_build_id`: it is the exact
    configuration the user verified in the configurator. The service compares it
    with the stored selections and refuses a stale one, so an outdated saved
    build is never silently added instead of what the user checked.
    """

    saved_build_id: int | None = Field(default=None, gt=0)
    expected_items: list[BuildItemCreate] | None = Field(default=None, max_length=8)
    items: list[BuildItemCreate] | None = Field(default=None, max_length=8)
    quantity: int = Field(gt=0, default=1)

    @model_validator(mode="after")
    def _exactly_one_source(self) -> CartAddBuildRequest:
        if (self.saved_build_id is None) == (self.items is None):
            raise ValueError(
                "Provide either saved_build_id or the selected component items"
            )
        if self.expected_items is not None and self.saved_build_id is None:
            raise ValueError("expected_items requires saved_build_id")
        return self


class CartUpdateQuantityRequest(BaseModel):
    quantity: int = Field(gt=0)


class CartItemSnapshot(BaseModel):
    kind: str
    product_id: int | None = None
    saved_build_id: int | None = None
    sku_snapshot: str | None = None
    name_snapshot: str
    image_url_snapshot: str | None = None
    unit_price: Decimal
    quantity: int
    specs_snapshot: list[Any] = []
    components_snapshot: list[dict[str, Any]] | None = None


class OrderItemOut(BaseModel):
    id: int
    kind: str
    product_id: int | None = None
    saved_build_id: int | None = None
    sku_snapshot: str | None = None
    name_snapshot: str
    image_url_snapshot: str | None = None
    unit_price: Decimal
    quantity: int
    line_total: Decimal | None = None
    specs_snapshot: list[Any] = []
    components_snapshot: list[dict[str, Any]] | None = None


class OrderOut(BaseModel):
    id: int
    user_id: int
    status: str
    total_amount: Decimal
    item_count: int
    items: list[OrderItemOut] = []
    created_at: datetime


class CheckoutRequest(BaseModel):
    pass  # no body needed for demo checkout


class CheckoutResponse(BaseModel):
    order: OrderOut
