"""Catalog counting, filters, review summaries, image ordering and placeholder tests."""

import json

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import ProductImage
from tests.conftest import apply_characteristics


def test_placeholder_is_original_jpeg(api_client: TestClient):
    response = api_client.get("/api/v1/assets/product-placeholder.jpg")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("image/jpeg")
    assert response.content.startswith(b"\xff\xd8\xff")


def test_catalog_count_and_search(api_client: TestClient, sample_products: dict):
    unique = sample_products["cpu"].name.split()[0]
    results = api_client.get("/api/v1/products", params={"q": unique})
    assert results.status_code == 200, results.text
    result = results.json()
    assert result["total"] == len(sample_products), result
    assert len(result["items"]) == len(sample_products)
    assert result["total_pages"] == 1
    no_hits = api_client.get("/api/v1/products", params={"q": "zzzzzzzzzzzzzzzzzz"})
    assert no_hits.status_code == 200
    assert no_hits.json()["total"] == 0
    assert no_hits.json()["items"] == []


def test_images_are_product_specific_and_sorted(
    api_client: TestClient, test_db_session: Session, sample_products: dict
):
    cpu, gpu = sample_products["cpu"], sample_products["gpu"]
    test_db_session.add_all(
        [
            ProductImage(product_id=cpu.id, image_url="  ", sort_order=0),
            ProductImage(
                product_id=gpu.id,
                image_url="https://example.invalid/z.jpg",
                sort_order=2,
            ),
            ProductImage(
                product_id=gpu.id,
                image_url="https://example.invalid/a.jpg",
                sort_order=1,
            ),
        ]
    )
    test_db_session.flush()
    without = api_client.get(f"/api/v1/products/{cpu.slug}").json()
    with_images = api_client.get(f"/api/v1/products/{gpu.slug}").json()
    assert without["images"] == []
    assert without["cover_image_url"].endswith("/product-placeholder.jpg")
    assert [i["url"] for i in with_images["images"]] == [
        "https://example.invalid/a.jpg",
        "https://example.invalid/z.jpg",
    ]
    assert with_images["cover_image_url"] == "https://example.invalid/a.jpg"
    assert "example.invalid" not in without["cover_image_url"]
    gallery = api_client.get(f"/api/v1/products/{gpu.id}/images").json()
    assert len(gallery["images"]) == 2


def test_single_image_is_cover_and_alt_text_is_serialized(
    api_client: TestClient, test_db_session: Session, sample_products: dict
):
    product = sample_products["ram"]
    test_db_session.add(
        ProductImage(
            product_id=product.id,
            image_url="https://example.invalid/only.jpg",
            alt_text="Только один ракурс",
            sort_order=0,
        )
    )
    test_db_session.flush()
    body = api_client.get(f"/api/v1/products/{product.slug}").json()
    assert body["cover_image_url"] == "https://example.invalid/only.jpg"
    assert body["images"] == [
        {
            "url": "https://example.invalid/only.jpg",
            "alt_text": "Только один ракурс",
            "sort_order": 0,
        }
    ]
    gallery = api_client.get(f"/api/v1/products/{product.id}/images").json()
    assert gallery["cover_image_url"] == "https://example.invalid/only.jpg"
    assert len(gallery["images"]) == 1


def test_product_detail_exposes_show_in_details_characteristics(
    api_client: TestClient, test_db_session: Session, sample_products: dict
):
    product = sample_products["gpu"]
    apply_characteristics(
        test_db_session, product, {"vram_gb": 12, "memory_bus_bits": 192}
    )
    body = api_client.get(f"/api/v1/products/{product.slug}").json()
    rows = {row["code"]: row for row in body["characteristics"]}
    assert rows["vram_gb"]["value"] == 12
    assert rows["memory_bus_bits"]["value"] == 192
    # Native JSON numbers stay numbers; the display string carries the unit once.
    assert isinstance(rows["vram_gb"]["value"], int)
    assert rows["memory_bus_bits"]["display_value"].endswith("бит")
    # No raw JSON object, no internal metadata, no Python representation.
    assert "{" not in json.dumps(body["characteristics"], ensure_ascii=False)
    empty = api_client.get(f"/api/v1/products/{sample_products['cpu'].slug}").json()
    assert empty["characteristics"] == []
    assert empty["short_characteristics"] == []


def test_filter_total_matches_products(api_client: TestClient, sample_products: dict):
    p = sample_products["gpu"]
    response = api_client.get(
        "/api/v1/products", params={"categories": "gpu", "q": p.name.split()[0]}
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["id"] == p.id
    assert api_client.get("/api/v1/products", params={"page": 0}).status_code == 422


def test_search_suggestions_have_distinct_items(
    api_client: TestClient, test_db_session: Session, sample_products: dict
):
    p = sample_products["cpu"]
    test_db_session.add_all(
        [
            ProductImage(
                product_id=p.id,
                image_url="https://example.invalid/one.jpg",
                sort_order=0,
            ),
            ProductImage(
                product_id=p.id,
                image_url="https://example.invalid/two.jpg",
                sort_order=1,
            ),
        ]
    )
    test_db_session.flush()
    results = api_client.get(
        "/api/v1/products/search/suggestions",
        params={"q": p.name.split()[0], "limit": 8},
    )
    assert results.status_code == 200, results.text
    ids = [r["id"] for r in results.json()]
    assert len(ids) == len(set(ids))
    assert any(
        x["id"] == p.id and x["cover_image_url"].endswith("/one.jpg")
        for x in results.json()
    )
