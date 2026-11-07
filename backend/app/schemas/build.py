"""Pydantic schemas for saved builds API."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

VALID_SLOTS = ("cpu", "mobo", "gpu", "ram", "storage", "psu", "case", "cooling")


class BuildItemOut(BaseModel):
    slot: str
    product_id: int
    product_name: str
    product_slug: str
    price: float


class BuildItemCreate(BaseModel):
    slot: str = Field(min_length=1, max_length=16)
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
    items: list[BuildItemOut] = []


class SavedBuildCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    items: list[BuildItemCreate] = []


class SavedBuildUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class CompatibilityStatus(BaseModel):
    product_id: int
    product_name: str
    slot: str
    status: str  # "compatible", "incompatible", "unknown"
    message: str | None = None


class BuildCompatibilityOut(BaseModel):
    build_id: int
    overall_status: str  # "compatible", "incompatible", "unknown"
    items: list[CompatibilityStatus]


class BuildTotalOut(BaseModel):
    build_id: int
    total_price: float
    item_count: int


class BuildUpdateItemsRequest(BaseModel):
    items: list[BuildItemCreate]
