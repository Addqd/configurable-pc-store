"""Read-only analytics and journal queries against the application database.

Mirrors `tests/test_orm.py`: SELECT statements only, no writes, no schema change.
This proves the aggregate SQL runs on the real PostgreSQL schema (views, ledger,
JSONB journal) even when the isolated write-test database is not configured.
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import func, select

from app.db.session import SessionLocal
from app.models import Product, SaleLineFact
from app.services import (
    analytics_service,
    event_service,
    product_admin_service,
    review_admin_service,
    spec_service,
    user_admin_service,
)


def test_analytics_queries_execute_read_only():
    with SessionLocal() as db:
        product_ids = list(
            db.scalars(select(Product.id).order_by(Product.id).limit(2)).all()
        )

        overview = analytics_service.overview(db)
        assert overview.completed_orders >= 0
        assert overview.sold_units >= 0
        assert overview.revenue >= 0
        months = [point.month for point in overview.monthly]
        assert months == sorted(months)
        assert all(point.units_count >= 0 for point in overview.monthly)
        assert len(overview.top_products_by_sales) <= 5
        assert len(overview.top_products_by_reviews) <= 5

        today = date.today()
        today_overview = analytics_service.overview(db, date_from=today, date_to=today)
        assert len(today_overview.monthly) == 1
        # A single requested day is one daily bucket, never a month start.
        assert today_overview.granularity == "day"
        assert today_overview.monthly[0].month == today

        table = analytics_service.product_stats(db, page=1, page_size=5)
        assert table.total >= len(table.items)
        assert all(item.revenue >= 0 for item in table.items)
        assert all(item.sold_units >= 0 for item in table.items)
        assert all(0 <= item.average_rating <= 5 for item in table.items)

        if product_ids:
            detail = analytics_service.product_stats_detail(db, product_ids[0])
            assert [bucket.rating for bucket in detail.rating_distribution] == [
                1,
                2,
                3,
                4,
                5,
            ]
            assert all(bucket.count >= 0 for bucket in detail.rating_distribution)
            assert detail.product.id == product_ids[0]

        if len(product_ids) == 2:
            comparison = analytics_service.comparison_timeline(db, product_ids)
            assert len(comparison.series) == 2
            assert len({len(series.monthly) for series in comparison.series}) == 1

        events, total = event_service.list_events(db, page_size=5)
        assert total >= len(events)
        assert all(event.category in event_service.EVENT_CATEGORIES for event in events)
        categories, event_types, outcomes = event_service.filter_options(db)
        assert all(
            category in event_service.EVENT_CATEGORIES for category in categories
        )
        assert set(outcomes) <= set(event_service.EVENT_OUTCOMES)
        assert all(isinstance(name, str) for name in event_types)


def test_daily_buckets_match_the_recorded_sales_read_only():
    """The day bucket runs on the real ledger: one row set, one honest point."""
    with SessionLocal() as db:
        first_timestamp = db.scalar(select(func.min(SaleLineFact.ordered_at)))
        if first_timestamp is None:
            pytest.skip("the ledger has no sales rows")
        day = first_timestamp.date()

        overview = analytics_service.overview(db, date_from=day, date_to=day)
        assert overview.granularity == "day"
        assert [point.month for point in overview.monthly] == [day]
        point = overview.monthly[0]
        # A single requested day carries exactly the totals of that day.
        assert point.units_count == overview.sold_units
        assert point.orders_count == overview.completed_orders
        assert point.amount == overview.revenue
        assert point.units_count >= 1


def test_time_buckets_never_lose_sales_read_only():
    """Every ledger row lands in exactly one bucket of the reported axis."""
    with SessionLocal() as db:
        overview = analytics_service.overview(db)
        if not overview.monthly:
            pytest.skip("the ledger has no sales rows")

        labels = [point.month for point in overview.monthly]
        assert labels == sorted(labels)
        assert len(set(labels)) == len(labels)
        if overview.granularity == "day":
            # Daily points exist only inside a single calendar month.
            assert len({(label.year, label.month) for label in labels}) == 1
        else:
            assert all(label.day == 1 for label in labels)

        assert (
            sum(point.units_count for point in overview.monthly) == overview.sold_units
        )
        assert sum(point.amount for point in overview.monthly) == overview.revenue


def test_admin_query_services_execute_read_only():
    with SessionLocal() as db:
        users, total = user_admin_service.list_users(db, page=1, page_size=3)
        assert total >= len(users)
        if users:
            counters = user_admin_service.user_counters(db, users[0].id)
            assert set(counters) == {"orders", "reviews", "favorites", "saved_builds"}
            assert all(value >= 0 for value in counters.values())

        products = product_admin_service.list_products(db, page=1, page_size=3)
        assert products.total >= len(products.items)
        assert products.items
        first = products.items[0]
        assert first.cover_image_url
        assert first.image_count >= 0
        assert first.product_type.id > 0

        detail = product_admin_service.get_product_detail(db, first.id)
        assert detail.id == first.id
        assert isinstance(detail.specifications, dict)
        assert isinstance(detail.technical_specs, dict)

        options = product_admin_service.form_options(db)
        assert options.categories
        assert options.manufacturers
        type_id = options.categories[0].product_types[0].id
        template = product_admin_service.spec_template(db, type_id)
        assert template.product_type_id == type_id
        fields, field_options = spec_service.template_fields(db, type_id)
        assert len(fields) == len(template.fields)
        assert all(
            option.field_id in {field.id for field in fields}
            for rows in field_options.values()
            for option in rows
        )

        reviews = review_admin_service.list_reviews(db, page=1, page_size=3)
        assert reviews.total >= len(reviews.items)
        for review in reviews.items:
            assert review.product_id > 0
            assert review.reviewer_name
            assert 1 <= review.rating <= 5
