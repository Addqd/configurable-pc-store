"""Pydantic schemas for cart and orders API."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


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
    saved_build_id: int = Field(gt=0)
    quantity: int = Field(gt=0, default=1)


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
