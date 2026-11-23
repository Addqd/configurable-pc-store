"""Read-only analytics and journal queries against the application database.

Mirrors `tests/test_orm.py`: SELECT statements only, no writes, no schema change.
This proves the aggregate SQL runs on the real PostgreSQL schema (views, ledger,
JSONB journal) even when the isolated write-test database is not configured.
"""

from __future__ import annotations

from datetime import date, timedelta

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
from app.services.analytics_service import MAX_DAYS, MAX_MONTHS


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


def test_wide_requested_range_cannot_hide_recorded_sales_read_only():
    """A request longer than the bucket cap still draws every recorded sale.

    Regression guard for the daily limit: the requested range starts far before the
    ledger, yet overview, product card and comparison must all keep the recorded
    buckets and report the same quantities as their own aggregates.
    """
    with SessionLocal() as db:
        earliest, latest = db.execute(
            select(
                func.min(SaleLineFact.ordered_at),
                func.max(SaleLineFact.ordered_at),
            )
        ).one()
        if earliest is None or latest is None:
            pytest.skip("the ledger has no sales rows")
        first_day, last_day = earliest.date(), latest.date()
        if (last_day - first_day).days + 1 > MAX_DAYS:
            pytest.skip("the ledger spans more than one bounded daily axis")

        date_from = first_day - timedelta(days=MAX_DAYS + 30)
        overview = analytics_service.overview(db, date_from=date_from, date_to=last_day)
        assert overview.completed_orders >= 1
        labels = [point.month for point in overview.monthly]
        cap = MAX_DAYS if overview.granularity == "day" else MAX_MONTHS
        assert 0 < len(labels) <= cap
        assert labels == sorted(labels)
        expected_first = (
            first_day if overview.granularity == "day" else first_day.replace(day=1)
        )
        expected_last = (
            last_day if overview.granularity == "day" else last_day.replace(day=1)
        )
        assert labels[0] <= expected_first
        assert expected_last <= labels[-1]
        # The drawn points and the aggregate totals describe the same rows.
        assert (
            sum(point.units_count for point in overview.monthly) == overview.sold_units
        )
        assert sum(point.amount for point in overview.monthly) == overview.revenue

        sold_ids = list(
            db.scalars(
                select(SaleLineFact.product_id)
                .where(SaleLineFact.product_id.is_not(None))
                .distinct()
                .order_by(SaleLineFact.product_id)
                .limit(2)
            ).all()
        )
        assert sold_ids

        for product_id in sold_ids:
            detail = analytics_service.product_stats_detail(
                db, product_id, date_from=date_from, date_to=last_day
            )
            assert (
                sum(point.units_count for point in detail.monthly)
                == detail.product.sold_units
            )
            assert (
                sum(point.amount for point in detail.monthly) == detail.product.revenue
            )

        comparison = analytics_service.comparison_timeline(
            db, sold_ids, date_from=date_from, date_to=last_day
        )
        assert len({len(series.monthly) for series in comparison.series}) == 1
        shared_labels = [
            [point.month for point in item.monthly] for item in comparison.series
        ]
        assert all(labels_ == shared_labels[0] for labels_ in shared_labels)
        for series in comparison.series:
            detail = analytics_service.product_stats_detail(
                db, series.product_id, date_from=date_from, date_to=last_day
            )
            assert (
                sum(point.units_count for point in series.monthly)
                == detail.product.sold_units
            )
            assert (
                sum(point.amount for point in series.monthly) == detail.product.revenue
            )


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


def test_yearly_buckets_aggregate_every_recorded_sale_read_only():
    """The coarse axis runs on the real ledger and keeps every recorded row.

    Yearly grouping is what a history wider than the monthly cap falls back to, so
    the Postgres `date_trunc('year', ...)` aggregation and the resulting axis are
    verified here even though the seeded history is short.
    """
    with SessionLocal() as db:
        filters = analytics_service._ledger_filters(None, None)
        yearly = analytics_service._bucket_rows(db, filters, "year")
        if not yearly:
            pytest.skip("the ledger has no sales rows")

        # Year buckets are calendar-year starts, grouped by year on PostgreSQL.
        assert all(bucket.month == 1 and bucket.day == 1 for bucket in yearly)
        assert len(yearly) == len({bucket.year for bucket in yearly})

        start, end = analytics_service._bucket_bounds([yearly], None, None, "year")
        points = analytics_service._fill_between(yearly, start, end, "year")
        assert [point.month for point in points] == sorted(
            point.month for point in points
        )
        assert all(point.month.month == 1 and point.month.day == 1 for point in points)
        assert start <= min(yearly) and max(yearly) <= end

        units, amount = db.execute(
            select(
                func.coalesce(func.sum(SaleLineFact.quantity), 0),
                func.coalesce(func.sum(SaleLineFact.line_total), 0),
            ).where(*filters)
        ).one()
        # The yearly chart and the aggregates describe exactly the same rows.
        assert sum(point.units_count for point in points) == int(units)
        assert sum(point.amount for point in points) == amount
