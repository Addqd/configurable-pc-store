"""Sales analytics: totals, date ranges, product aggregates, no double counting."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient


def _overview(api_client: TestClient, admin_user: dict, **params) -> dict:
    response = api_client.get(
        "/api/v1/admin/stats/overview", headers=admin_user["headers"], params=params
    )
    assert response.status_code == 200, response.text
    return response.json()


def _purchase(
    api_client: TestClient, headers: dict, lines: list[tuple[int, int]]
) -> int:
    for product_id, quantity in lines:
        added = api_client.post(
            "/api/v1/cart/products",
            headers=headers,
            json={"product_id": product_id, "quantity": quantity},
        )
        assert added.status_code == 200, added.text
    order = api_client.post("/api/v1/cart/checkout", headers=headers, json={})
    assert order.status_code == 200, order.text
    return order.json()["order"]["id"]


def test_overview_counts_orders_once_and_uses_ledger_prices(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    cpu = sample_products["cpu"]
    gpu = sample_products["gpu"]
    before = _overview(api_client, admin_user)
    order_id = _purchase(
        api_client, registered_user["headers"], [(cpu.id, 2), (gpu.id, 3)]
    )
    assert order_id > 0
    after = _overview(api_client, admin_user)

    expected_delta = Decimal(cpu.price) * 2 + Decimal(gpu.price) * 3
    assert after["completed_orders"] - before["completed_orders"] == 1
    assert after["sold_units"] - before["sold_units"] == 5
    assert Decimal(after["revenue"]) - Decimal(before["revenue"]) == expected_delta

    months = [point["month"] for point in after["monthly"]]
    assert months == sorted(months)
    current = date.today().replace(day=1).isoformat()
    current_point = next(
        point for point in after["monthly"] if point["month"] == current
    )
    assert current_point["units_count"] >= 5
    assert current_point["orders_count"] >= 1

    # Historical values come from the ledger snapshot, not the current price.
    updated = api_client.patch(
        f"/api/v1/admin/products/{cpu.id}",
        headers=admin_user["headers"],
        json={"price": "1.00"},
    )
    assert updated.status_code == 200, updated.text
    repriced = _overview(api_client, admin_user)
    assert Decimal(repriced["revenue"]) == Decimal(after["revenue"])

    tops = after["top_products_by_sales"]
    assert len(tops) <= 5
    assert all(item["units"] >= 0 for item in tops)
    assert [item["units"] for item in tops] == sorted(
        (item["units"] for item in tops), reverse=True
    )

    rated = after["top_products_by_reviews"]
    assert len(rated) <= 5
    assert all(0 <= item["average_rating"] <= 5 for item in rated)


def test_date_range_filtering(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    today = date.today()
    _purchase(api_client, registered_user["headers"], [(sample_products["ram"].id, 1)])
    inside = _overview(
        api_client, admin_user, date_from=today.isoformat(), date_to=today.isoformat()
    )
    assert inside["completed_orders"] >= 1
    assert Decimal(inside["revenue"]) > 0
    assert len(inside["monthly"]) == 1

    tomorrow = (today + timedelta(days=1)).isoformat()
    outside = _overview(api_client, admin_user, date_from=tomorrow, date_to=tomorrow)
    assert outside["completed_orders"] == 0
    assert Decimal(outside["revenue"]) == Decimal("0.00")
    assert outside["monthly"][0]["units_count"] == 0

    invalid = api_client.get(
        "/api/v1/admin/stats/overview",
        headers=admin_user["headers"],
        params={"date_from": today.isoformat(), "date_to": "2000-01-01"},
    )
    assert invalid.status_code == 422


def test_product_stats_table_and_detail(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    cpu = sample_products["cpu"]
    gpu = sample_products["gpu"]
    today = date.today().isoformat()
    _purchase(api_client, registered_user["headers"], [(cpu.id, 2), (gpu.id, 3)])

    # Publish reviews through the admin API so rating aggregates are exercised.
    for rating in (5, 4):
        created = api_client.post(
            f"/api/v1/admin/products/{cpu.id}/reviews",
            headers=admin_user["headers"],
            json={
                "author_name": "Редакция",
                "rating": rating,
                "body": f"Оценка {rating}",
            },
        )
        assert created.status_code == 201, created.text

    table = api_client.get(
        "/api/v1/admin/stats/products",
        headers=admin_user["headers"],
        params={
            "q": cpu.sku,
            "date_from": today,
            "date_to": today,
            "manufacturer": sample_products["cpu"].manufacturer.slug,
        },
    )
    assert table.status_code == 200, table.text
    body = table.json()
    assert body["total"] == 1
    row = body["items"][0]
    assert row["id"] == cpu.id
    assert row["sold_units"] == 2
    assert Decimal(row["revenue"]) == Decimal(cpu.price) * 2
    assert row["orders_count"] == 1
    assert row["review_count"] == 2
    assert row["average_rating"] == 4.5

    filtered = api_client.get(
        "/api/v1/admin/stats/products",
        headers=admin_user["headers"],
        params={"q": cpu.sku, "min_rating": 4.6},
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 0

    sorted_by_revenue = api_client.get(
        "/api/v1/admin/stats/products",
        headers=admin_user["headers"],
        params={
            "manufacturer": sample_products["cpu"].manufacturer.slug,
            "sort": "revenue_desc",
            "page_size": 10,
        },
    ).json()
    revenues = [Decimal(item["revenue"]) for item in sorted_by_revenue["items"]]
    assert revenues == sorted(revenues, reverse=True)

    detail = api_client.get(
        f"/api/v1/admin/stats/products/{cpu.id}",
        headers=admin_user["headers"],
        params={"date_from": today, "date_to": today},
    )
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["product"]["sold_units"] == 2
    assert len(detail_body["rating_distribution"]) == 5
    assert sum(bucket["count"] for bucket in detail_body["rating_distribution"]) == 2
    assert detail_body["monthly"]

    timeline = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[
            ("product_ids", cpu.id),
            ("product_ids", gpu.id),
            ("date_from", today),
            ("date_to", today),
        ],
    )
    assert timeline.status_code == 200, timeline.text
    series = timeline.json()["series"]
    assert len(series) == 2
    assert {item["product_id"] for item in series} == {cpu.id, gpu.id}
    assert len({len(item["monthly"]) for item in series}) == 1

    missing = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params={"product_ids": 999_999},
    )
    assert missing.status_code == 404

    assert (
        api_client.get(
            "/api/v1/admin/stats/products/999999", headers=admin_user["headers"]
        ).status_code
        == 404
    )


def test_account_deletion_does_not_change_historical_metrics(
    api_client: TestClient,
    admin_user: dict,
    registered_user: dict,
    sample_products: dict,
):
    _purchase(api_client, registered_user["headers"], [(sample_products["psu"].id, 2)])
    before = _overview(api_client, admin_user)
    deleted = api_client.request(
        "DELETE",
        f"/api/v1/admin/users/{registered_user['id']}",
        headers=admin_user["headers"],
        json={"confirm": True},
    )
    assert deleted.status_code == 204
    after = _overview(api_client, admin_user)
    assert after["completed_orders"] == before["completed_orders"]
    assert after["sold_units"] == before["sold_units"]
    assert Decimal(after["revenue"]) == Decimal(before["revenue"])

    stats = api_client.get(
        "/api/v1/admin/stats/products",
        headers=admin_user["headers"],
        params={"q": sample_products["psu"].sku},
    ).json()
    assert stats["total"] == 1
    assert stats["items"][0]["sold_units"] == 2
