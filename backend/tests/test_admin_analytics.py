"""Sales analytics: totals, date ranges, product aggregates, no double counting."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import SaleLineFact


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
    # Every sale of this test happened today, i.e. inside a single calendar month,
    # so the series is drawn per day and the only non-empty bucket is today.
    assert after["granularity"] == "day"
    assert months[-1] == date.today().isoformat()
    current_point = after["monthly"][-1]
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
    assert inside["granularity"] == "day"
    assert len(inside["monthly"]) == 1

    tomorrow = (today + timedelta(days=1)).isoformat()
    outside = _overview(api_client, admin_user, date_from=tomorrow, date_to=tomorrow)
    assert outside["completed_orders"] == 0
    assert Decimal(outside["revenue"]) == Decimal("0.00")
    assert outside["granularity"] == "day"
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


def test_comparison_timeline_aligns_products_with_different_periods(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """F6: every compared product returns the same ordered month labels."""
    older = sample_products["cpu"]
    newer = sample_products["gpu"]
    test_db_session.add_all(
        [
            SaleLineFact(
                source_order_item_id=uuid4().int % 10**17,
                source_order_id=uuid4().int % 10**17,
                product_id=older.id,
                kind="product",
                sku_snapshot=older.sku,
                name_snapshot=older.name,
                unit_price=Decimal("100.00"),
                quantity=2,
                line_total=Decimal("200.00"),
                ordered_at=datetime(2025, 8, 12, 9, 30, tzinfo=UTC),
            ),
            SaleLineFact(
                source_order_item_id=uuid4().int % 10**17,
                source_order_id=uuid4().int % 10**17,
                product_id=newer.id,
                kind="product",
                sku_snapshot=newer.sku,
                name_snapshot=newer.name,
                unit_price=Decimal("70.00"),
                quantity=1,
                line_total=Decimal("70.00"),
                ordered_at=datetime(2026, 3, 4, 18, 0, tzinfo=UTC),
            ),
        ]
    )
    test_db_session.flush()

    response = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[("product_ids", older.id), ("product_ids", newer.id)],
    )
    assert response.status_code == 200, response.text
    series = response.json()["series"]
    assert len(series) == 2
    by_product = {item["product_id"]: item["monthly"] for item in series}
    labels = [[point["month"] for point in item] for item in by_product.values()]
    assert labels[0] == labels[1]
    assert labels[0][0] == "2025-08-01"
    assert labels[0][-1] == "2026-03-01"
    assert len(labels[0]) == 8

    older_points = by_product[older.id]
    assert older_points[0]["orders_count"] == 1
    assert older_points[0]["units_count"] == 2
    assert Decimal(older_points[0]["amount"]) == Decimal("200.00")
    assert all(
        point["orders_count"] == 0
        and point["units_count"] == 0
        and Decimal(point["amount"]) == Decimal("0.00")
        for point in older_points[1:]
    )
    newer_points = by_product[newer.id]
    assert all(point["units_count"] == 0 for point in newer_points[:-1])
    assert newer_points[-1]["orders_count"] == 1
    assert newer_points[-1]["units_count"] == 1
    assert Decimal(newer_points[-1]["amount"]) == Decimal("70.00")
    assert sum(point["units_count"] for point in older_points) == 2
    assert sum(point["units_count"] for point in newer_points) == 1

    # An explicit range is shared too, including months without any sales.
    ranged = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[
            ("product_ids", older.id),
            ("product_ids", newer.id),
            ("date_from", date(2025, 7, 15).isoformat()),
            ("date_to", date(2026, 4, 2).isoformat()),
        ],
    )
    assert ranged.status_code == 200, ranged.text
    ranged_series = ranged.json()["series"]
    ranged_labels = [
        [point["month"] for point in item["monthly"]] for item in ranged_series
    ]
    assert ranged_labels[0] == ranged_labels[1]
    assert ranged_labels[0][0] == "2025-07-01"
    assert ranged_labels[0][-1] == "2026-04-01"
    assert len(ranged_labels[0]) == 10


def _ledger_row(
    product,
    *,
    day: date,
    quantity: int,
    unit_price: str,
    order_id: int,
) -> SaleLineFact:
    """One product line of a completed demo sale on the given calendar day."""
    price = Decimal(unit_price)
    return SaleLineFact(
        source_order_item_id=order_id * 10 + product.id,
        source_order_id=order_id,
        product_id=product.id,
        kind="product",
        sku_snapshot=product.sku,
        name_snapshot=product.name,
        unit_price=price,
        quantity=quantity,
        line_total=price * quantity,
        ordered_at=datetime(day.year, day.month, day.day, 12, 0, tzinfo=UTC),
    )


def test_sales_of_one_month_are_drawn_per_day(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """One calendar month of records: daily points, identical zero filling."""
    ram = sample_products["ram"]
    test_db_session.add_all(
        [
            _ledger_row(
                ram, day=date(2026, 4, 2), quantity=2, unit_price="100.00", order_id=1
            ),
            _ledger_row(
                ram, day=date(2026, 4, 5), quantity=1, unit_price="100.00", order_id=2
            ),
        ]
    )
    test_db_session.flush()

    overview = _overview(
        api_client,
        admin_user,
        date_from=date(2026, 4, 1).isoformat(),
        date_to=date(2026, 4, 30).isoformat(),
    )
    assert overview["granularity"] == "day"
    labels = [point["month"] for point in overview["monthly"]]
    assert labels[0] == "2026-04-01"
    assert labels[-1] == "2026-04-30"
    # One point per calendar day of the selected interval, none invented.
    assert len(labels) == 30
    assert len(set(labels)) == 30

    by_day = {point["month"]: point for point in overview["monthly"]}
    assert by_day["2026-04-02"]["units_count"] == 2
    assert by_day["2026-04-02"]["orders_count"] == 1
    assert Decimal(by_day["2026-04-02"]["amount"]) == Decimal("200.00")
    assert by_day["2026-04-05"]["units_count"] == 1
    assert Decimal(by_day["2026-04-05"]["amount"]) == Decimal("100.00")
    empty_days = [
        point
        for label, point in by_day.items()
        if label not in {"2026-04-02", "2026-04-05"}
    ]
    assert len(empty_days) == 28
    assert all(
        point["orders_count"] == 0
        and point["units_count"] == 0
        and Decimal(point["amount"]) == Decimal("0.00")
        for point in empty_days
    )
    # Totals stay the recorded amounts, never the zero-filled ones.
    assert overview["completed_orders"] == 2
    assert overview["sold_units"] == 3
    assert Decimal(overview["revenue"]) == Decimal("300.00")

    detail = api_client.get(
        f"/api/v1/admin/stats/products/{ram.id}",
        headers=admin_user["headers"],
        params={"date_from": "2026-04-01", "date_to": "2026-04-30"},
    )
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["granularity"] == "day"
    assert [point["month"] for point in detail_body["monthly"]] == labels
    assert sum(point["units_count"] for point in detail_body["monthly"]) == 3

    # The same one-month dataset keeps daily points without an explicit range.
    all_time = _overview(api_client, admin_user)
    assert all_time["granularity"] == "day"
    assert [point["month"] for point in all_time["monthly"]] == [
        "2026-04-02",
        "2026-04-03",
        "2026-04-04",
        "2026-04-05",
    ]


def test_sales_of_several_months_keep_monthly_points(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    cpu = sample_products["cpu"]
    gpu = sample_products["gpu"]
    test_db_session.add_all(
        [
            _ledger_row(
                cpu, day=date(2026, 3, 9), quantity=1, unit_price="50.00", order_id=11
            ),
            _ledger_row(
                cpu, day=date(2026, 4, 14), quantity=4, unit_price="50.00", order_id=12
            ),
            _ledger_row(
                gpu, day=date(2026, 4, 20), quantity=1, unit_price="70.00", order_id=13
            ),
        ]
    )
    test_db_session.flush()

    overview = _overview(api_client, admin_user)
    assert overview["granularity"] == "month"
    assert [point["month"] for point in overview["monthly"]] == [
        "2026-03-01",
        "2026-04-01",
    ]
    march, april = overview["monthly"]
    assert march["units_count"] == 1
    assert april["units_count"] == 5
    assert Decimal(april["amount"]) == Decimal("270.00")

    detail = api_client.get(
        f"/api/v1/admin/stats/products/{cpu.id}", headers=admin_user["headers"]
    )
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["granularity"] == "month"
    assert [point["month"] for point in detail_body["monthly"]] == [
        "2026-03-01",
        "2026-04-01",
    ]

    timeline = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[("product_ids", cpu.id), ("product_ids", gpu.id)],
    )
    assert timeline.status_code == 200, timeline.text
    timeline_body = timeline.json()
    assert timeline_body["granularity"] == "month"
    labels = [
        [point["month"] for point in item["monthly"]]
        for item in timeline_body["series"]
    ]
    assert labels[0] == labels[1] == ["2026-03-01", "2026-04-01"]


def test_comparison_of_sparse_products_shares_one_daily_axis(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    cpu = sample_products["cpu"]
    gpu = sample_products["gpu"]
    test_db_session.add_all(
        [
            _ledger_row(
                cpu, day=date(2026, 4, 2), quantity=2, unit_price="50.00", order_id=21
            ),
            _ledger_row(
                gpu, day=date(2026, 4, 20), quantity=1, unit_price="70.00", order_id=22
            ),
        ]
    )
    test_db_session.flush()

    response = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[("product_ids", cpu.id), ("product_ids", gpu.id)],
    )
    assert response.status_code == 200, response.text
    body = response.json()
    # Both products sold inside April, so the shared axis is daily even though
    # neither of them has sales on most days.
    assert body["granularity"] == "day"
    series = body["series"]
    labels = [[point["month"] for point in item["monthly"]] for item in series]
    assert labels[0] == labels[1]
    assert labels[0][0] == "2026-04-02"
    assert labels[0][-1] == "2026-04-20"
    assert len(labels[0]) == 19

    by_product = {item["product_id"]: item["monthly"] for item in series}
    cpu_points = {point["month"]: point for point in by_product[cpu.id]}
    gpu_points = {point["month"]: point for point in by_product[gpu.id]}
    assert cpu_points["2026-04-02"]["units_count"] == 2
    assert cpu_points["2026-04-20"]["units_count"] == 0
    assert gpu_points["2026-04-02"]["units_count"] == 0
    assert gpu_points["2026-04-20"]["units_count"] == 1
    assert sum(point["units_count"] for point in by_product[cpu.id]) == 2
    assert sum(point["units_count"] for point in by_product[gpu.id]) == 1


def test_empty_period_reports_zero_filled_buckets(
    api_client: TestClient,
    admin_user: dict,
):
    inside_month = _overview(
        api_client,
        admin_user,
        date_from="2020-05-01",
        date_to="2020-05-04",
    )
    assert inside_month["granularity"] == "day"
    assert [point["month"] for point in inside_month["monthly"]] == [
        "2020-05-01",
        "2020-05-02",
        "2020-05-03",
        "2020-05-04",
    ]
    assert all(point["units_count"] == 0 for point in inside_month["monthly"])
    assert inside_month["completed_orders"] == 0

    across_months = _overview(
        api_client,
        admin_user,
        date_from="2020-05-01",
        date_to="2020-07-31",
    )
    assert across_months["granularity"] == "month"
    assert [point["month"] for point in across_months["monthly"]] == [
        "2020-05-01",
        "2020-06-01",
        "2020-07-01",
    ]
    assert all(point["orders_count"] == 0 for point in across_months["monthly"])


def test_wide_requested_range_keeps_late_sales_on_every_analytics_endpoint(
    api_client: TestClient,
    admin_user: dict,
    sample_products: dict,
    test_db_session: Session,
):
    """A >400-day request must not hide sales sitting at its end (MAX_DAYS cap)."""
    cpu = sample_products["cpu"]
    gpu = sample_products["gpu"]
    test_db_session.add_all(
        [
            _ledger_row(
                cpu, day=date(2026, 11, 20), quantity=2, unit_price="50.00", order_id=51
            ),
            _ledger_row(
                cpu, day=date(2026, 11, 24), quantity=1, unit_price="50.00", order_id=52
            ),
            _ledger_row(
                gpu, day=date(2026, 11, 26), quantity=3, unit_price="70.00", order_id=53
            ),
        ]
    )
    test_db_session.flush()

    # The request spans 2025-01-01 .. 2026-12-31, i.e. 730 days, while every one
    # of the sold rows sits in November 2026: daily granularity, bounded axis.
    params = {"date_from": "2025-01-01", "date_to": "2026-12-31"}
    overview = _overview(api_client, admin_user, **params)
    assert overview["granularity"] == "day"
    assert overview["date_from"] == "2025-01-01"
    assert overview["date_to"] == "2026-12-31"
    labels = [point["month"] for point in overview["monthly"]]
    assert 0 < len(labels) <= 400
    assert labels == sorted(labels)
    assert labels[0] <= "2026-11-20" <= labels[-1]
    assert labels[0] <= "2026-11-26" <= labels[-1]
    # The drawn points and the aggregate totals describe the same rows.
    assert (
        sum(point["units_count"] for point in overview["monthly"])
        == overview["sold_units"]
    )
    assert sum(Decimal(point["amount"]) for point in overview["monthly"]) == Decimal(
        overview["revenue"]
    )
    assert overview["sold_units"] >= 6

    detail = api_client.get(
        f"/api/v1/admin/stats/products/{cpu.id}",
        headers=admin_user["headers"],
        params=params,
    )
    assert detail.status_code == 200, detail.text
    detail_body = detail.json()
    assert detail_body["granularity"] == "day"
    detail_labels = [point["month"] for point in detail_body["monthly"]]
    assert "2026-11-20" in detail_labels
    assert "2026-11-24" in detail_labels
    assert (
        sum(point["units_count"] for point in detail_body["monthly"])
        == detail_body["product"]["sold_units"]
    )
    assert sum(Decimal(point["amount"]) for point in detail_body["monthly"]) == Decimal(
        detail_body["product"]["revenue"]
    )

    timeline = api_client.get(
        "/api/v1/admin/stats/timeline",
        headers=admin_user["headers"],
        params=[
            ("product_ids", cpu.id),
            ("product_ids", gpu.id),
            ("date_from", params["date_from"]),
            ("date_to", params["date_to"]),
        ],
    )
    assert timeline.status_code == 200, timeline.text
    body = timeline.json()
    assert body["granularity"] == "day"
    series_labels = [
        [point["month"] for point in series["monthly"]] for series in body["series"]
    ]
    # One shared axis, covering the late sales of every compared product.
    assert series_labels[0] == series_labels[1] == labels
    by_product = {series["product_id"]: series["monthly"] for series in body["series"]}
    assert sum(point["units_count"] for point in by_product[cpu.id]) == 3
    assert sum(Decimal(point["amount"]) for point in by_product[cpu.id]) == Decimal(
        "150.00"
    )
    assert sum(point["units_count"] for point in by_product[gpu.id]) == 3
    assert sum(Decimal(point["amount"]) for point in by_product[gpu.id]) == Decimal(
        "210.00"
    )


def test_wide_empty_requested_range_stays_bounded(
    api_client: TestClient,
    admin_user: dict,
):
    body = _overview(
        api_client,
        admin_user,
        date_from="1990-01-01",
        date_to="2020-12-31",
    )
    assert body["granularity"] == "month"
    assert 0 < len(body["monthly"]) <= 120
    assert all(
        point["units_count"] == 0 and Decimal(point["amount"]) == Decimal("0.00")
        for point in body["monthly"]
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
