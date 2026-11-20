"""Managed product image files: transaction ownership and stored URL exposure.

These tests run without a database: the file lifecycle is a SQLAlchemy session
event concern, and a bind-less `Session` emits the same transaction events
(including SAVEPOINT release/rollback) as a bound one without touching a DB.
Row/file consistency against PostgreSQL lives in `test_admin_products.py`.
"""

from __future__ import annotations

import shutil
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.main import app
from app.models import Category, Manufacturer, Product, ProductImage, ProductType
from app.services import product_admin_service, product_image_service
from app.services.catalog import PLACEHOLDER_URL, _detail, _images, _summary

API_PREFIX = "/api/v1/media/products"
LEGACY_PREFIX = "/media/products"


@pytest.fixture()
def media_root(monkeypatch) -> Path:
    """Workspace-local media root; the system temp directory is never used."""
    scratch = (
        Path(__file__).resolve().parents[2]
        / ".agent"
        / "tmp"
        / f"image-lifecycle-{uuid4().hex}"
    )
    root = scratch / "media"
    monkeypatch.setenv("MEDIA_ROOT", str(root))
    get_settings.cache_clear()
    try:
        yield root
    finally:
        get_settings.cache_clear()
        shutil.rmtree(scratch, ignore_errors=True)


def _managed_file(root: Path) -> tuple[Path, str]:
    """Create one stored managed image and return its path and API URL."""
    directory = root / "products"
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}.jpg"
    path = directory / name
    path.write_bytes(b"\xff\xd8\xffstored")
    return path, f"{API_PREFIX}/{name}"


def _legacy_url(api_url: str) -> str:
    return api_url.replace(API_PREFIX, LEGACY_PREFIX, 1)


def _product(*urls: str) -> Product:
    """A transient product with server-side ids, enough for response helpers."""
    category = Category(id=1, slug="gpu", name="Видеокарты", sort_order=1)
    product_type = ProductType(
        id=2,
        category_id=category.id,
        category=category,
        slug="gpu",
        name="Видеокарты",
    )
    manufacturer = Manufacturer(id=3, slug="probe-maker", name="Probe Maker")
    product = Product(
        id=7,
        product_type_id=product_type.id,
        manufacturer_id=manufacturer.id,
        slug="probe-gpu",
        sku="PROBE-GPU-1",
        name="Probe GPU",
        description="Probe",
        price=Decimal("199.99"),
        stock_quantity=3,
        spec_lines=[],
        short_specs=[],
        technical_specs={},
        display_specs=[],
        on_sale=False,
        is_active=True,
        listed_at=date(2026, 1, 2),
        created_at=datetime(2026, 1, 2, tzinfo=UTC),
        updated_at=datetime(2026, 1, 2, tzinfo=UTC),
        product_type=product_type,
        manufacturer=manufacturer,
    )
    product.images = [
        ProductImage(
            id=100 + index,
            product_id=product.id,
            image_url=url,
            alt_text=None,
            sort_order=index,
        )
        for index, url in enumerate(urls)
    ]
    return product


# Nested transaction file lifecycle


def test_deletion_in_a_rolled_back_savepoint_keeps_the_file(media_root: Path):
    """Scenario A: a nested rollback must cancel its deletion request."""
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        savepoint = session.begin_nested()
        product_image_service.queue_managed_file_deletion(session, url)
        savepoint.rollback()
        session.commit()
        assert path.exists()
    finally:
        session.close()


def test_upload_in_a_rolled_back_savepoint_removes_the_file(media_root: Path):
    """Scenario B: the file created inside the SAVEPOINT is removed again."""
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        savepoint = session.begin_nested()
        product_image_service.queue_created_file(session, path)
        savepoint.rollback()
        session.commit()
        assert not path.exists()
    finally:
        session.close()


def test_committed_savepoint_upload_dies_with_the_outer_rollback(media_root: Path):
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        savepoint = session.begin_nested()
        product_image_service.queue_created_file(session, path)
        savepoint.commit()
        assert path.exists(), "a SAVEPOINT release must not settle the file"
        session.rollback()
        assert not path.exists()
    finally:
        session.close()


def test_committed_savepoint_deletion_dies_with_the_outer_rollback(media_root: Path):
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        savepoint = session.begin_nested()
        product_image_service.queue_managed_file_deletion(session, url)
        savepoint.commit()
        assert path.exists(), "a SAVEPOINT release must not unlink files"
        session.rollback()
        assert path.exists()
    finally:
        session.close()


def test_outer_commit_applies_the_deletion(media_root: Path):
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_managed_file_deletion(session, url)
        assert path.exists(), "the file survives until the outermost commit"
        session.commit()
        assert not path.exists()
    finally:
        session.close()


def test_outer_commit_keeps_the_uploaded_file(media_root: Path):
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        session.commit()
        assert path.exists()
    finally:
        session.close()


def test_sibling_savepoints_keep_independent_file_operations(media_root: Path):
    rolled_back_path, _ = _managed_file(media_root)
    deleted_path, deleted_url = _managed_file(media_root)
    committed_path, _ = _managed_file(media_root)
    kept_path, kept_url = _managed_file(media_root)

    session = Session()
    try:
        session.begin()

        discarded = session.begin_nested()
        product_image_service.queue_created_file(session, rolled_back_path)
        product_image_service.queue_managed_file_deletion(session, deleted_url)
        discarded.rollback()

        kept = session.begin_nested()
        product_image_service.queue_created_file(session, committed_path)
        product_image_service.queue_managed_file_deletion(session, kept_url)
        kept.commit()

        assert not rolled_back_path.exists()
        assert deleted_path.exists()
        assert committed_path.exists()
        assert kept_path.exists()

        session.commit()
        assert committed_path.exists()
        assert not kept_path.exists()
    finally:
        session.close()


def test_upload_and_deletion_of_one_file_in_a_single_transaction(media_root: Path):
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        product_image_service.queue_managed_file_deletion(session, url)
        session.commit()
        assert not path.exists(), "a committed upload+delete leaves no file"
    finally:
        session.close()


def test_audit_savepoints_never_clean_up_the_business_transaction(media_root: Path):
    """`event_service.record_event()` opens one SAVEPOINT per audit entry."""
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        audit = session.begin_nested()
        audit.commit()
        assert path.exists(), "an audit SAVEPOINT must not settle file state"
        session.commit()
        assert path.exists()
    finally:
        session.close()


def test_legacy_urls_are_recognised_when_deleting(media_root: Path):
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_managed_file_deletion(session, _legacy_url(url))
        session.commit()
        assert not path.exists()
    finally:
        session.close()


# Abandoned transaction: Session.close() without an explicit rollback


def test_uncommitted_upload_is_removed_when_the_session_is_closed(media_root: Path):
    """Closing an uncommitted transaction must not leave its upload on disk."""
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        assert path.exists()
        session.close()
        assert not path.exists()
    finally:
        session.close()


def test_pending_deletion_is_cancelled_when_the_session_is_closed(media_root: Path):
    """A deletion only applies on commit, so closing must keep the file."""
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_managed_file_deletion(session, url)
        session.close()
        assert path.exists()
    finally:
        session.close()


def test_committed_upload_survives_the_session_close(media_root: Path):
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        session.commit()
        session.close()
        assert path.exists()
    finally:
        session.close()


def test_committed_deletion_is_applied_before_the_session_close(media_root: Path):
    path, url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_managed_file_deletion(session, url)
        session.commit()
        assert not path.exists()
        session.close()
        assert not path.exists()
    finally:
        session.close()


def test_closing_a_session_settles_an_open_savepoint_too(media_root: Path):
    """`close()` unwinds every open transaction, the SAVEPOINT included."""
    path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        session.begin_nested()
        product_image_service.queue_created_file(session, path)
        session.close()
        assert not path.exists()
    finally:
        session.close()


def test_rolled_back_savepoint_cleans_only_its_own_files(media_root: Path):
    nested_path, _ = _managed_file(media_root)
    nested_deleted_path, nested_deleted_url = _managed_file(media_root)
    parent_path, _ = _managed_file(media_root)
    parent_deleted_path, parent_deleted_url = _managed_file(media_root)

    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, parent_path)
        product_image_service.queue_managed_file_deletion(session, parent_deleted_url)

        savepoint = session.begin_nested()
        product_image_service.queue_created_file(session, nested_path)
        product_image_service.queue_managed_file_deletion(session, nested_deleted_url)
        savepoint.rollback()

        assert not nested_path.exists()
        assert nested_deleted_path.exists()
        assert parent_path.exists(), "the enclosing transaction is still open"
        assert parent_deleted_path.exists()

        session.close()
        assert not parent_path.exists()
        assert parent_deleted_path.exists()
    finally:
        session.close()


def test_released_savepoint_is_discarded_by_the_outer_close(media_root: Path):
    path, _ = _managed_file(media_root)
    deleted_path, deleted_url = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        savepoint = session.begin_nested()
        product_image_service.queue_created_file(session, path)
        product_image_service.queue_managed_file_deletion(session, deleted_url)
        savepoint.commit()
        assert path.exists(), "a SAVEPOINT release must not settle the file"

        session.close()
        assert not path.exists()
        assert deleted_path.exists(), "the outer transaction never committed"
    finally:
        session.close()


def test_operations_queued_before_the_transaction_are_cleaned_on_close(
    media_root: Path,
):
    path, _ = _managed_file(media_root)
    deleted_path, deleted_url = _managed_file(media_root)
    session = Session()
    try:
        product_image_service.queue_created_file(session, path)
        product_image_service.queue_managed_file_deletion(session, deleted_url)
        session.begin()
        session.close()
        assert not path.exists()
        assert deleted_path.exists()
    finally:
        session.close()


def test_reused_session_carries_no_stale_file_operations(media_root: Path):
    path, _ = _managed_file(media_root)
    deleted_path, deleted_url = _managed_file(media_root)
    fresh_path, _ = _managed_file(media_root)
    session = Session()
    try:
        session.begin()
        product_image_service.queue_created_file(session, path)
        product_image_service.queue_managed_file_deletion(session, deleted_url)
        session.close()
        assert not path.exists()
        assert deleted_path.exists()

        session.begin()
        product_image_service.queue_created_file(session, fresh_path)
        session.commit()
        assert fresh_path.exists()
        assert not path.exists(), "the discarded upload must not come back"
        assert deleted_path.exists(), "the discarded deletion must not be applied"
    finally:
        session.close()


# Stored URL normalization


def test_public_serialization_normalizes_legacy_managed_urls():
    first = f"{LEGACY_PREFIX}/{uuid4().hex}.jpg"
    second = f"{LEGACY_PREFIX}/{uuid4().hex}.png"
    normalized_first = f"{API_PREFIX}/{first.rsplit('/', 1)[-1]}"
    normalized_second = f"{API_PREFIX}/{second.rsplit('/', 1)[-1]}"
    product = _product(first, second)

    images, cover = _images(product)
    assert cover == normalized_first
    assert [image.url for image in images] == [normalized_first, normalized_second]

    summary = _summary(product, (0.0, 0))
    assert summary.cover_image_url == normalized_first
    assert [image.url for image in summary.images] == [
        normalized_first,
        normalized_second,
    ]
    # The stored value of the row itself is never rewritten.
    assert product.images[0].image_url == first


def test_public_product_detail_normalizes_cover_and_gallery():
    legacy = f"{LEGACY_PREFIX}/{uuid4().hex}.webp"
    normalized = f"{API_PREFIX}/{legacy.rsplit('/', 1)[-1]}"
    product = _product(legacy)

    detail = _detail(product, (0.0, 0))
    assert detail.cover_image_url == normalized
    assert [image.url for image in detail.images] == [normalized]


def test_admin_serialization_normalizes_legacy_managed_urls():
    legacy = f"{LEGACY_PREFIX}/{uuid4().hex}.jpg"
    stored = f"{API_PREFIX}/{uuid4().hex}.jpg"
    normalized = f"{API_PREFIX}/{legacy.rsplit('/', 1)[-1]}"
    product = _product(legacy, stored)

    rows = product_admin_service._sorted_images(product)
    assert [row.url for row in rows] == [normalized, stored]
    assert rows[0].is_cover is True
    assert rows[1].is_cover is False
    assert product_admin_service._cover_url(product) == normalized

    gallery = product_image_service.list_images(product)
    assert [row.url for row in gallery] == [normalized, stored]


def test_correct_external_and_placeholder_urls_are_untouched():
    correct = f"{API_PREFIX}/{uuid4().hex}.png"
    external = f"https://cdn.example.com{LEGACY_PREFIX}/{uuid4().hex}.jpg"
    asset = "/assets/images/gpu.webp"
    assert product_image_service.normalize_media_url(correct) == correct
    assert product_image_service.normalize_media_url(external) == external
    assert product_image_service.normalize_media_url(asset) == asset
    placeholder = product_image_service.normalize_media_url(PLACEHOLDER_URL)
    assert placeholder == PLACEHOLDER_URL

    product = _product(correct, external)
    images, cover = _images(product)
    assert cover == correct
    assert [image.url for image in images] == [correct, external]

    empty = _product()
    assert _images(empty) == ([], PLACEHOLDER_URL)
    assert _summary(empty, (0.0, 0)).cover_image_url == PLACEHOLDER_URL


@pytest.mark.parametrize(
    "url",
    [
        f"{LEGACY_PREFIX}/{uuid4().hex}.exe",
        f"{LEGACY_PREFIX}/{'a' * 31}.jpg",
        f"{LEGACY_PREFIX}/nested/{uuid4().hex}.jpg",
        f"{LEGACY_PREFIX}/../{uuid4().hex}.jpg",
        f"{LEGACY_PREFIX}/%2e%2e/{uuid4().hex}.jpg",
        f"/media/{uuid4().hex}.jpg",
        f"//evil.example{LEGACY_PREFIX}/{uuid4().hex}.jpg",
        f"{LEGACY_PREFIX}/{uuid4().hex}.jpg '",
        "",
    ],
    ids=[
        "wrong-extension",
        "short-name",
        "nested-path",
        "traversal",
        "encoded-traversal",
        "other-media-path",
        "protocol-relative",
        "padded",
        "empty",
    ],
)
def test_normalization_keeps_every_other_url_unchanged(url: str):
    assert product_image_service.normalize_media_url(url) == url


def test_legacy_media_route_still_serves_stored_files(media_root: Path):
    _, url = _managed_file(media_root)
    normalized = product_image_service.normalize_media_url(_legacy_url(url))
    assert normalized == url

    with TestClient(app) as client:
        for served in (url, _legacy_url(url)):
            response = client.get(served)
            assert response.status_code == 200, served
            assert response.headers["content-type"] == "image/jpeg"
        # Normalization cannot widen the strict filename/path validation.
        for name in (f"{uuid4().hex}.exe", f"{'a' * 31}.jpg"):
            assert client.get(f"{API_PREFIX}/{name}").status_code == 404
            assert client.get(f"{LEGACY_PREFIX}/{name}").status_code == 404
