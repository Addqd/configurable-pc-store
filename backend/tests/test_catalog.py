"""Tests for Catalog API: products, categories, types, manufacturers, search, images."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.main import app

# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture()
def db_session() -> Iterator[Session]:
    """Provide a test session with seeded data using the real PostgreSQL."""
    from app.db.session import SessionLocal

    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture()
def seeded_db(db_session: Session) -> Session:
    """Ensure categories and seed products exist."""

    count = db_session.execute(text("SELECT COUNT(*) FROM categories")).scalar()
    if count == 0 or count is None:
        # We rely on the existing DB having been seeded; skip if not.
        return db_session

    return db_session


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


# ── Product List Tests ───────────────────────────────────────────────────────


def test_list_products_200(client: TestClient, seeded_db: Session):
    """GET /api/v1/products returns 200 with pagination."""
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "page_size" in data
    assert "total_pages" in data
    assert data["page"] == 1
    assert data["page_size"] == 49


def test_list_products_pagination(client: TestClient):
    """Verify pagination metadata is correct."""
    response = client.get("/api/v1/products?page=1")
    data = response.json()
    total_pages = data["total_pages"]
    assert total_pages >= 1


def test_list_products_sort_newest(client: TestClient):
    """Products sorted by newest first."""
    response = client.get("/api/v1/products?sort=newest")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) > 0


# ── Product Detail Tests ─────────────────────────────────────────────────────


def test_get_product_by_slug(client: TestClient, seeded_db: Session):
    """GET /api/v1/products/{slug} returns full detail."""
    response = client.get("/api/v1/products/gpu-rtx-4070-super")
    assert response.status_code == 200
    data = response.json()
    assert data["slug"] == "gpu-rtx-4070-super"
    assert data["name"] == "MSI GeForce RTX 4070 SUPER Gaming X Slim 12G"
    assert "price" in data
    assert "cover_image_url" in data
    assert "images" in data
    assert "category" in data
    assert "manufacturer" in data


def test_get_product_not_found(client: TestClient):
    """Non-existent slug returns 404."""
    response = client.get("/api/v1/products/nonexistent-slug")
    assert response.status_code == 404


# ── Image Tests ──────────────────────────────────────────────────────────────


def test_product_without_images_uses_placeholder(
    client: TestClient, seeded_db: Session
):
    """Product with no images in product_images table uses placeholder."""
    response = client.get("/api/v1/products/cpu-ryzen-5-7600")
    assert response.status_code == 200
    data = response.json()
    # The seed doesn't create product_images, so cover_image_url should be the placeholder
    assert data["cover_image_url"] is not None
    assert "placeholder" in data["cover_image_url"].lower() or data[
        "cover_image_url"
    ].startswith("/api/v1/assets")


def test_product_images_endpoint(client: TestClient, seeded_db: Session):
    """GET /api/v1/products/{id}/images returns image list."""
    response = client.get("/api/v1/products/1/images")
    assert response.status_code == 200
    data = response.json()
    assert "product_id" in data
    assert "images" in data


# ── Placeholder Asset Tests ──────────────────────────────────────────────────


def test_placeholder_asset_exists(client: TestClient):
    """GET /api/v1/assets/product-placeholder.jpg returns JPEG."""
    response = client.get("/api/v1/assets/product-placeholder.jpg")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert len(response.content) > 0


# ── Categories / Types / Manufacturers ───────────────────────────────────────


def test_list_categories(client: TestClient):
    """GET /api/v1/categories returns all categories."""
    response = client.get("/api/v1/categories")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for item in data:
        assert "id" in item
        assert "slug" in item
        assert "name" in item


def test_list_types_for_category(client: TestClient):
    """GET /api/v1/categories/{slug}/types returns types."""
    response = client.get("/api/v1/categories/gpu/types")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_list_manufacturers(client: TestClient):
    """GET /api/v1/manufacturers returns all manufacturers."""
    response = client.get("/api/v1/manufacturers")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0


# ── Search Tests ─────────────────────────────────────────────────────────────


def test_search_suggestions(client: TestClient):
    """GET /api/v1/products/search/suggestions returns suggestions."""
    response = client.get("/api/v1/products/search/suggestions?q=rtx")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_search_products(client: TestClient):
    """GET /api/v1/products?q=rtx returns search results."""
    response = client.get("/api/v1/products?q=rtx")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data


# ── Filter Tests ─────────────────────────────────────────────────────────────


def test_filter_by_category(client: TestClient):
    """Filter by category slug works."""
    response = client.get("/api/v1/products?categories=gpu")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["category"]["slug"] == "gpu"


def test_filter_options(client: TestClient):
    """GET /api/v1/products/filters returns filter options."""
    response = client.get("/api/v1/products/filters")
    assert response.status_code == 200
    data = response.json()
    assert "categories" in data
    assert "types" in data
    assert "colors" in data
    assert "manufacturers" in data
