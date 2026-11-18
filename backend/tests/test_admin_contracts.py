"""Administration API contracts that never touch a database.

These tests run in every environment: they validate OpenAPI generation, response
shapes for the future Orval client, request validation and the pure security
helpers (event sanitizing, upload sniffing, media path resolution).
"""

from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert

from app.main import app
from app.models import SiteEvent
from app.schemas.admin_events import AdminEventOut
from app.schemas.admin_products import (
    AdminImageOrderRequest,
    AdminProductCreate,
    AdminProductUpdate,
)
from app.schemas.admin_reviews import AdminReviewCreate, AdminReviewUpdate
from app.schemas.admin_users import AdminUserUpdate
from app.services import product_image_service
from app.services.event_service import sanitize_details
from app.services.product_admin_service import slugify

ADMIN_PATHS = {
    "/api/v1/admin/users",
    "/api/v1/admin/users/{user_id}",
    "/api/v1/admin/products",
    "/api/v1/admin/products/{product_id}",
    "/api/v1/admin/product-options",
    "/api/v1/admin/product-types/{product_type_id}/spec-fields",
    "/api/v1/admin/products/{product_id}/images",
    "/api/v1/admin/products/{product_id}/images/{image_id}",
    "/api/v1/admin/products/{product_id}/images/order",
    "/api/v1/admin/reviews",
    "/api/v1/admin/products/{product_id}/reviews",
    "/api/v1/admin/reviews/{review_id}",
    "/api/v1/admin/events",
    "/api/v1/admin/events/filters",
    "/api/v1/admin/stats/overview",
    "/api/v1/admin/stats/products",
    "/api/v1/admin/stats/products/{product_id}",
    "/api/v1/admin/stats/timeline",
}


def test_openapi_generates_admin_contracts():
    schema = app.openapi()
    missing = ADMIN_PATHS - set(schema["paths"])
    assert not missing, f"Missing admin endpoints: {sorted(missing)}"
    components = schema["components"]["schemas"]
    for name, definition in components.items():
        properties = definition.get("properties", {})
        assert "password_hash" not in properties, name
        if name.endswith(("Out", "Response")):
            assert "password" not in properties, name
    for path in ADMIN_PATHS:
        for operation in schema["paths"][path].values():
            assert operation.get("security"), f"{path} must declare authentication"


def test_pagination_contract_fields():
    schema = app.openapi()["components"]["schemas"]
    for name in (
        "AdminPaginatedUsersOut",
        "AdminPaginatedProductsOut",
        "AdminPaginatedReviewsOut",
        "AdminPaginatedEventsOut",
        "AdminPaginatedProductStatsOut",
    ):
        assert {"items", "total", "page", "page_size", "total_pages"} <= set(
            schema[name]["properties"]
        ), name


def test_admin_review_defaults_are_minimal():
    payload = AdminReviewCreate(author_name="Редакция", rating=5, body="Хорошо")
    assert payload.displayed_at is None
    assert payload.store_reply is None
    assert payload.is_published is True
    explicit = AdminReviewCreate(
        author_name="Редакция",
        rating=4,
        body="Хорошо",
        is_published=False,
        store_reply="Спасибо",
    )
    assert explicit.is_published is False
    assert explicit.store_reply == "Спасибо"
    with pytest.raises(ValidationError):
        AdminReviewCreate(
            author_name="Редакция", rating=4, body="Хорошо", unexpected=True
        )


def test_admin_review_update_rejects_null_displayed_at():
    with pytest.raises(ValidationError):
        AdminReviewUpdate(displayed_at=None)
    assert AdminReviewUpdate(store_reply=None).store_reply is None
    with pytest.raises(ValidationError):
        AdminReviewUpdate(rating=6)


def test_product_payload_validation():
    with pytest.raises(ValidationError):
        AdminProductCreate(
            name="X",
            product_type_id=1,
            manufacturer_id=1,
            price="10.00",
        )
    with pytest.raises(ValidationError):
        AdminProductCreate(
            name="Valid name",
            product_type_id=1,
            manufacturer_id=1,
            price="-1.00",
        )
    with pytest.raises(ValidationError):
        AdminProductUpdate(price=None)
    payload = AdminProductCreate(
        name="  Видеокарта  ",
        product_type_id=1,
        manufacturer_id=1,
        price="199.99",
        sku=" ab-12 ",
        slug="My_Product",
    )
    assert payload.name == "Видеокарта"
    assert payload.sku == "AB-12"
    assert payload.slug == "my-product"
    with pytest.raises(ValidationError):
        AdminImageOrderRequest(image_ids=[1] * 11)


def test_admin_user_update_transition_validation():
    with pytest.raises(ValidationError):
        AdminUserUpdate(status="blocked")
    with pytest.raises(ValidationError):
        AdminUserUpdate(status="active", blocked_reason="reason")
    with pytest.raises(ValidationError):
        AdminUserUpdate(role="owner")  # owner role is never assignable
    assert AdminUserUpdate(role="admin").role == "admin"
    assert AdminUserUpdate(status="blocked", blocked_reason="spam").status == "blocked"


def test_event_details_are_sanitized():
    details = sanitize_details(
        {
            "username": "probe",
            "password": "secret",
            "refresh_token": "token",
            "nested": {"cookie": "value", "ip_hint": "127.0.0.1"},
            "big": "x" * 500,
            "count": 3,
            "flag": True,
            "nothing": None,
            "unknown": object(),
        }
    )
    assert details["username"] == "probe"
    assert "password" not in details
    assert "refresh_token" not in details
    assert details["nested"] == {"ip_hint": "127.0.0.1"}
    assert len(details["big"]) == 300
    assert details["count"] == 3
    assert details["flag"] is True
    assert details["nothing"] is None
    assert details["unknown"] is None


def test_event_insert_statement_compiles_for_postgresql():
    """The de-duplicating audit insert must be valid PostgreSQL SQL."""
    statement = (
        insert(SiteEvent)
        .values(
            actor_user_id=None,
            actor_role=None,
            category="auth",
            event_type="auth.login_failed",
            outcome="failure",
            target_type=None,
            target_id=None,
            reason="Invalid credentials",
            details={},
            event_key="probe:1",
        )
        .on_conflict_do_nothing(index_elements=["event_key"])
        .returning(SiteEvent.id)
    )
    compiled = str(statement.compile(dialect=postgresql.dialect()))
    assert "INSERT INTO site_events" in compiled
    assert "ON CONFLICT (event_key) DO NOTHING" in compiled
    assert "RETURNING site_events.id" in compiled


def test_event_schema_rejects_unknown_shapes():
    event = AdminEventOut(
        id=1,
        occurred_at="2026-01-01T00:00:00Z",
        category="auth",
        event_type="auth.login_failed",
        outcome="failure",
        details={"reason": "Invalid credentials"},
    )
    assert event.actor_user_id is None
    assert event.details["reason"] == "Invalid credentials"


def test_slugify_and_media_safety(monkeypatch):
    assert slugify("Видеокарта GeForce RTX 5090") == "videokarta-geforce-rtx-5090"
    assert slugify("  ") == "product"

    # Scratch files must stay inside the workspace: .agent/tmp is the only
    # sanctioned location, never the system temp directory.
    work_dir = Path(__file__).resolve().parents[2] / ".agent" / "tmp"
    scratch = work_dir / f"media-{uuid4().hex}"
    media_root = scratch / "media"
    monkeypatch.setenv("MEDIA_ROOT", str(media_root))
    from app.core.security import get_settings

    get_settings.cache_clear()
    try:
        products = media_root / "products"
        products.mkdir(parents=True)
        allowed = products / ("a" * 32 + ".jpg")
        allowed.write_bytes(b"\xff\xd8\xffdata")
        assert (
            product_image_service.resolve_media_path(allowed.name) == allowed.resolve()
        )
        for name in (
            "../secret.jpg",
            "a" * 32 + ".exe",
            "a" * 31 + ".jpg",
            "..%2f" + "a" * 32 + ".jpg",
            str(Path("nested") / allowed.name),
        ):
            assert product_image_service.resolve_media_path(name) is None, name
        assert product_image_service.detect_image_type(b"\xff\xd8\xffrest") == "jpg"
        assert (
            product_image_service.detect_image_type(b"\x89PNG\r\n\x1a\nrest") == "png"
        )
        assert (
            product_image_service.detect_image_type(b"RIFF\x00\x00\x00\x00WEBPrest")
            == "webp"
        )
        assert product_image_service.detect_image_type(b"GIF89a") is None
        assert product_image_service.content_type_for(allowed.name) == "image/jpeg"
    finally:
        get_settings.cache_clear()
        shutil.rmtree(scratch, ignore_errors=True)
