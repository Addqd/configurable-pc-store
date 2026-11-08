"""Validated saved-build input/output models."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

VALID_SLOTS = ("cpu", "mobo", "gpu", "ram", "storage", "psu", "case", "cooling")
Slot = Literal["cpu", "mobo", "gpu", "ram", "storage", "psu", "case", "cooling"]
Status = Literal["compatible", "incompatible", "unknown"]


class BuildItemOut(BaseModel):
    slot: str
    product_id: int
    product_name: str
    product_slug: str
    price: Decimal


class BuildItemCreate(BaseModel):
    slot: Slot
    product_id: int = Field(gt=0)


class BuildItemUpdate(BaseModel):
    product_id: int = Field(gt=0)


class SavedBuildOut(BaseModel):
    id: int
    user_id: int
    name: str
    description: str
    image_url: str | None = None
    version: int
    created_at: datetime
    updated_at: datetime
    items: list[BuildItemOut] = Field(default_factory=list)


class SavedBuildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    items: list[BuildItemCreate] = Field(default_factory=list, max_length=8)


class SavedBuildUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    items: list[BuildItemCreate] | None = Field(default=None, max_length=8)


class CompatibilityStatus(BaseModel):
    product_id: int
    product_name: str
    slot: str
    status: Status
    message: str | None = None


class BuildCompatibilityOut(BaseModel):
    build_id: int
    overall_status: Status
    items: list[CompatibilityStatus]


class BuildTotalOut(BaseModel):
    build_id: int
    total_price: Decimal
    item_count: int


class BuildUpdateItemsRequest(BaseModel):
    items: list[BuildItemCreate] = Field(max_length=8)
