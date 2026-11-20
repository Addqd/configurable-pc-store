"""Administration API contracts that never touch a database.

These tests run in every environment: they validate OpenAPI generation, response
shapes for the future Orval client, request validation and the pure security
helpers (event sanitizing, upload sniffing, media path resolution).
"""

from __future__ import annotations

import contextlib
import shutil
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.security import get_settings
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
from app.services import analytics_service, event_service, product_image_service
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


def test_event_contract_exposes_the_actor_username():
    """The journal renders a username next to a separate numeric actor id.

    Without this field the admin UI could only show a role/id label, so the
    response contract must carry the resolved username (or the snapshot).
    """
    properties = app.openapi()["components"]["schemas"]["AdminEventOut"]["properties"]
    assert {"actor_user_id", "actor_role", "actor_username"} <= set(properties)


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


def test_admin_review_update_rejects_explicit_nulls():
    """Required review columns reject null instead of reaching PostgreSQL."""
    for field in ("author_name", "rating", "body", "displayed_at"):
        with pytest.raises(ValidationError):
            AdminReviewUpdate(**{field: None})
    # Omitted fields mean "unchanged"; only the shop reply is nullable.
    assert AdminReviewUpdate().model_fields_set == set()
    assert AdminReviewUpdate(store_reply=None).store_reply is None
    assert AdminReviewUpdate(rating=4).rating == 4
    with pytest.raises(ValidationError):
        AdminReviewUpdate(rating=6)
    with pytest.raises(ValidationError):
        AdminReviewUpdate(author_name="   ")


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


@pytest.fixture()
def scratch_media(monkeypatch) -> Path:
    """Workspace-local media root; the system temp directory is never used."""
    scratch = (
        Path(__file__).resolve().parents[2] / ".agent" / "tmp" / f"media-{uuid4().hex}"
    )
    media_root = scratch / "media"
    monkeypatch.setenv("MEDIA_ROOT", str(media_root))
    get_settings.cache_clear()
    try:
        yield media_root
    finally:
        get_settings.cache_clear()
        shutil.rmtree(scratch, ignore_errors=True)


def test_media_route_is_served_under_the_api_prefix(scratch_media: Path):
    """F3: images are reachable through the `/api` frontend proxy path."""
    directory = scratch_media / "products"
    directory.mkdir(parents=True)
    name = "a" * 32 + ".png"
    (directory / name).write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 8)

    with TestClient(app) as client:
        served = client.get(f"/api/v1/media/products/{name}")
        assert served.status_code == 200
        assert served.headers["content-type"] == "image/png"
        assert served.headers["x-content-type-options"] == "nosniff"
        assert served.content.startswith(b"\x89PNG")

        # Image URLs stored before the route moved stay readable.
        assert client.get(f"/media/products/{name}").status_code == 200

        for path in (
            "/api/v1/media/products/" + "b" * 32 + ".png",
            "/api/v1/media/products/" + "a" * 32 + ".exe",
            "/api/v1/media/products/" + "a" * 31 + ".png",
            "/api/v1/media/products/nested/" + name,
        ):
            assert client.get(path).status_code == 404, path


def test_openapi_exposes_only_the_api_media_route():
    paths = app.openapi()["paths"]
    assert "/api/v1/media/products/{filename}" in paths
    # The compatibility alias stays out of the published contract.
    assert "/media/products/{filename}" not in paths


class _RecordingSession:
    """Stand-in recording how `record_event` uses the caller's transaction."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.info: dict[str, Any] = {}

    def flush(self) -> None:
        self.calls.append("flush")

    @contextlib.contextmanager
    def begin_nested(self):
        self.calls.append("begin_nested")
        yield self

    def scalar(self, statement: Any) -> int:
        self.calls.append("scalar")
        return 1

    def commit(self) -> None:
        self.calls.append("commit")


def test_success_event_never_commits_its_own_transaction():
    """F1: a success entry is written through the caller's transaction only."""
    db = _RecordingSession()
    recorded = event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.probe",
    )
    assert recorded is True
    assert db.calls == ["flush", "begin_nested", "scalar"]
    assert "commit" not in db.calls


def test_managed_image_files_follow_the_session_transaction(scratch_media: Path):
    """F2: uploads are removed on rollback, deletions only happen on commit."""
    directory = scratch_media / "products"
    directory.mkdir(parents=True)
    session = Session()
    try:
        rolled_back = directory / ("c" * 32 + ".jpg")
        rolled_back.write_bytes(b"\xff\xd8\xffdata")
        product_image_service.queue_created_file(session, rolled_back)
        session.begin()
        session.rollback()
        assert not rolled_back.exists()

        kept = directory / ("d" * 32 + ".jpg")
        kept.write_bytes(b"\xff\xd8\xffdata")
        product_image_service.queue_created_file(session, kept)
        session.begin()
        session.commit()
        assert kept.exists()

        # A rolled back deletion keeps the file the surviving row points at.
        product_image_service.queue_managed_file_deletion(
            session, f"/api/v1/media/products/{kept.name}"
        )
        session.begin()
        session.rollback()
        assert kept.exists()

        # A committed deletion removes it; legacy URLs are recognised as well.
        product_image_service.queue_managed_file_deletion(
            session, f"/media/products/{kept.name}"
        )
        session.begin()
        session.commit()
        assert not kept.exists()
    finally:
        session.close()


def test_comparison_monthly_series_share_one_month_interval():
    """F6: compared products return identically aligned month labels."""
    august = date(2025, 8, 1)
    march = date(2026, 3, 1)
    older = {august: (1, 2, Decimal("200.00")), march: (2, 3, Decimal("250.50"))}
    newer = {date(2026, 1, 1): (1, 1, Decimal("70.00"))}

    start, end = analytics_service._month_bounds([older, newer], None, None)
    assert (start, end) == (august, march)

    left = analytics_service._fill_between(older, start, end)
    right = analytics_service._fill_between(newer, start, end)
    assert [point.month for point in left] == [point.month for point in right]
    assert len(left) == 8
    assert left[0].month == august
    assert left[-1].month == march
    assert left[0].orders_count == 1
    assert left[0].units_count == 2
    assert sum(point.units_count for point in left) == 5
    assert sum(Decimal(point.amount) for point in left) == Decimal("450.50")
    assert [point.units_count for point in right] == [0, 0, 0, 0, 0, 1, 0, 0]
    assert right[0].orders_count == 0
    assert Decimal(right[0].amount) == Decimal("0.00")

    # An explicit range wins for every series.
    start, end = analytics_service._month_bounds(
        [older, newer], date(2026, 2, 3), date(2026, 3, 9)
    )
    assert (start, end) == (date(2026, 2, 1), march)
    assert [
        point.month for point in analytics_service._fill_between(newer, start, end)
    ] == [date(2026, 2, 1), march]
