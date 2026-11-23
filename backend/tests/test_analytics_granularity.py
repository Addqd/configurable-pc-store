"""Time-axis granularity of the admin analytics: day buckets vs month buckets.

The rule "one calendar month of actual sales -> daily points" is decided by pure
helpers, so it is verified here without a database. Totals themselves are
computed by the existing aggregate queries and are not re-implemented.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest

from app.services.analytics_service import (
    MAX_DAYS,
    MAX_MONTHS,
    _bucket_bounds,
    _bucket_first,
    _bucket_sequence,
    _bucket_span,
    _fill_between,
    _granularity_for,
)


def test_records_inside_one_calendar_month_use_daily_buckets() -> None:
    span = (date(2026, 11, 3), date(2026, 11, 9))
    assert _granularity_for(span, None, None) == "day"
    # The same dataset keeps daily buckets for every selected period, including
    # a 30-day and a three-month window around the records.
    assert _granularity_for(span, date(2026, 9, 1), date(2026, 11, 30)) == "day"
    assert _granularity_for(span, date(2026, 1, 1), date(2026, 12, 31)) == "day"


def test_records_across_two_calendar_months_keep_monthly_buckets() -> None:
    span = (date(2026, 10, 31), date(2026, 11, 1))
    assert _granularity_for(span, None, None) == "month"
    assert _granularity_for(span, date(2026, 1, 1), date(2026, 12, 31)) == "month"


def test_a_single_transaction_day_stays_a_single_day() -> None:
    span = (date(2026, 11, 12), date(2026, 11, 12))
    assert _granularity_for(span, None, None) == "day"
    series = {date(2026, 11, 12): (1, 1, Decimal("10.00"))}
    assert _bucket_bounds([series], None, None, "day") == (
        date(2026, 11, 12),
        date(2026, 11, 12),
    )
    points = _fill_between(series, date(2026, 11, 12), date(2026, 11, 12), "day")
    # One real day stays one point: no extra days are invented around it.
    assert len(points) == 1
    assert points[0].units_count == 1


@pytest.mark.parametrize(
    ("date_from", "date_to", "expected"),
    [
        (date(2026, 11, 1), date(2026, 11, 30), "day"),
        (date(2026, 11, 7), date(2026, 11, 7), "day"),
        (date(2026, 10, 1), date(2026, 11, 30), "month"),
        (None, None, "month"),
        (date(2026, 11, 1), None, "day"),
        (None, date(2026, 11, 30), "day"),
    ],
)
def test_empty_period_follows_the_requested_range(
    date_from: date | None, date_to: date | None, expected: str
) -> None:
    assert _granularity_for((None, None), date_from, date_to) == expected


def test_bucket_start_of_a_timestamp() -> None:
    timestamp = datetime(2026, 11, 12, 23, 45)
    assert _bucket_first(timestamp, "day") == date(2026, 11, 12)
    assert _bucket_first(timestamp, "month") == date(2026, 11, 1)


def test_daily_sequence_is_inclusive_and_crosses_months() -> None:
    days = _bucket_sequence(date(2026, 10, 30), date(2026, 11, 2), "day")
    assert days == [
        date(2026, 10, 30),
        date(2026, 10, 31),
        date(2026, 11, 1),
        date(2026, 11, 2),
    ]


def test_daily_sequence_is_bounded() -> None:
    days = _bucket_sequence(date(2026, 1, 1), date(2027, 12, 31), "day")
    assert len(days) == MAX_DAYS


def test_monthly_sequence_still_returns_month_starts() -> None:
    months = _bucket_sequence(date(2026, 10, 15), date(2026, 12, 3), "month")
    assert months == [date(2026, 10, 1), date(2026, 11, 1), date(2026, 12, 1)]


def test_explicit_range_wins_and_keeps_its_resolution() -> None:
    day_bounds = _bucket_bounds(
        [{date(2026, 11, 5): (1, 2, Decimal("10.00"))}],
        date(2026, 11, 1),
        date(2026, 11, 20),
        "day",
    )
    assert day_bounds == (date(2026, 11, 1), date(2026, 11, 20))

    month_bounds = _bucket_bounds(
        [{date(2026, 11, 1): (1, 2, Decimal("10.00"))}],
        date(2026, 11, 5),
        date(2027, 1, 9),
        "month",
    )
    assert month_bounds == (date(2026, 11, 1), date(2027, 1, 1))


def test_data_bounds_are_used_without_an_explicit_range() -> None:
    series = {date(2026, 11, 4): (1, 1, Decimal("5.00"))}
    assert _bucket_bounds([series], None, None, "day") == (
        date(2026, 11, 4),
        date(2026, 11, 4),
    )
    month_series = {date(2026, 11, 1): (1, 1, Decimal("5.00"))}
    assert _bucket_bounds([month_series], None, None, "month") == (
        date(2026, 11, 1),
        date(2026, 11, 1),
    )


def test_wide_requested_range_keeps_the_only_sales_month() -> None:
    """A request far longer than MAX_DAYS must not hide the recorded sales.

    The granularity rule already chose daily points, so the axis has to move to the
    month that actually holds the records instead of starting at the request and
    stopping after MAX_DAYS days (November 2026 used to be cut off completely).
    """
    span = (date(2026, 11, 20), date(2026, 11, 21))
    date_from, date_to = date(2025, 1, 1), date(2026, 12, 31)
    assert _granularity_for(span, date_from, date_to) == "day"

    series = {
        date(2026, 11, 20): (2, 5, Decimal("500.00")),
        date(2026, 11, 21): (1, 1, Decimal("90.00")),
    }
    start, end = _bucket_bounds([series], date_from, date_to, "day")

    assert _bucket_span(start, end, "day") <= MAX_DAYS
    assert start <= span[0] and span[1] <= end
    assert start >= date_from and end <= date_to

    points = _fill_between(series, start, end, "day")
    labels = [point.month for point in points]
    assert date(2026, 11, 20) in labels
    assert date(2026, 11, 21) in labels
    # Zero filling stays inside the drawn window only: no invented activity.
    assert all(
        point.units_count == 0 and point.amount == Decimal("0.00")
        for point in points
        if point.month not in series
    )
    # The chart and the aggregate totals describe the same sales.
    assert sum(point.units_count for point in points) == 6
    assert sum(point.amount for point in points) == Decimal("590.00")


def test_wide_requested_range_covers_every_recorded_day_of_the_month() -> None:
    series = {
        date(2026, 11, 3): (1, 2, Decimal("200.00")),
        date(2026, 11, 9): (1, 1, Decimal("40.00")),
        date(2026, 11, 27): (3, 4, Decimal("800.00")),
    }
    start, end = _bucket_bounds([series], date(2025, 3, 1), date(2026, 12, 31), "day")
    points = _fill_between(series, start, end, "day")
    labels = [point.month for point in points]
    assert labels == sorted(labels)
    assert set(series).issubset(labels)
    assert (end - start).days + 1 == len(points) <= MAX_DAYS
    assert sum(point.units_count for point in points) == 7
    assert sum(point.amount for point in points) == Decimal("1040.00")


def test_wide_requested_range_keeps_product_and_comparison_axes() -> None:
    """Product cards and comparisons share the corrected interval."""
    cpu = {date(2026, 11, 4): (1, 2, Decimal("100.00"))}
    gpu = {date(2026, 11, 18): (1, 1, Decimal("700.00"))}
    date_from, date_to = date(2024, 1, 1), date(2026, 12, 31)

    single_start, single_end = _bucket_bounds([cpu], date_from, date_to, "day")
    shared_start, shared_end = _bucket_bounds([cpu, gpu], date_from, date_to, "day")
    assert (single_start, single_end) == (shared_start, shared_end)

    cpu_points = _fill_between(cpu, shared_start, shared_end, "day")
    gpu_points = _fill_between(gpu, shared_start, shared_end, "day")
    assert [point.month for point in cpu_points] == [
        point.month for point in gpu_points
    ]
    assert sum(point.units_count for point in cpu_points) == 2
    assert sum(point.units_count for point in gpu_points) == 1
    assert sum(point.amount for point in cpu_points) == Decimal("100.00")
    assert sum(point.amount for point in gpu_points) == Decimal("700.00")


def test_empty_wide_range_stays_bounded_without_inventing_activity() -> None:
    start, end = _bucket_bounds([{}], date(2015, 1, 1), date(2026, 12, 31), "month")
    assert _bucket_span(start, end, "month") == MAX_MONTHS
    assert end == date(2026, 12, 1)
    points = _fill_between({}, start, end, "month")
    assert len(points) == MAX_MONTHS
    assert all(
        point.orders_count == 0
        and point.units_count == 0
        and point.amount == Decimal("0.00")
        for point in points
    )


def test_normal_periods_keep_the_requested_interval() -> None:
    series = {date(2026, 11, 12): (1, 1, Decimal("10.00"))}
    thirty_days = _bucket_bounds(
        [series], date(2026, 10, 20), date(2026, 11, 18), "day"
    )
    assert thirty_days == (date(2026, 10, 20), date(2026, 11, 18))
    assert len(_fill_between(series, *thirty_days, "day")) == 30

    three_months = _bucket_bounds([series], date(2026, 9, 1), date(2026, 11, 30), "day")
    assert three_months == (date(2026, 9, 1), date(2026, 11, 30))
    assert len(_fill_between(series, *three_months, "day")) == 91


def test_wide_range_with_several_sales_months_stays_monthly() -> None:
    span = (date(2025, 2, 10), date(2025, 4, 3))
    # Over the monthly cap as well: 264 requested months for 3 recorded months.
    date_from, date_to = date(2005, 1, 1), date(2026, 12, 31)
    assert _granularity_for(span, date_from, date_to) == "month"
    series = {
        date(2025, 2, 1): (1, 1, Decimal("10.00")),
        date(2025, 4, 1): (1, 2, Decimal("80.00")),
    }
    start, end = _bucket_bounds([series], date_from, date_to, "month")
    assert _bucket_span(start, end, "month") <= MAX_MONTHS
    points = _fill_between(series, start, end, "month")
    assert all(point.month.day == 1 for point in points)
    assert [point.month for point in points] == [
        date(2025, 2, 1),
        date(2025, 3, 1),
        date(2025, 4, 1),
    ]
    assert sum(point.units_count for point in points) == 3
    assert sum(point.amount for point in points) == Decimal("90.00")


def test_normal_year_of_sales_keeps_monthly_zero_fill() -> None:
    """A request inside the caps keeps every empty month, as before."""
    series = {date(2025, 2, 1): (1, 1, Decimal("10.00"))}
    start, end = _bucket_bounds([series], date(2025, 1, 1), date(2026, 12, 31), "month")
    assert (start, end) == (date(2025, 1, 1), date(2026, 12, 1))
    points = _fill_between(series, start, end, "month")
    assert len(points) == 24
    assert sum(point.units_count for point in points) == 1


def test_daily_fill_zero_fills_only_missing_days() -> None:
    series = {
        date(2026, 11, 4): (2, 3, Decimal("120.00")),
        date(2026, 11, 6): (1, 1, Decimal("70.00")),
    }
    points = _fill_between(series, date(2026, 11, 4), date(2026, 11, 6), "day")
    assert [point.month for point in points] == [
        date(2026, 11, 4),
        date(2026, 11, 5),
        date(2026, 11, 6),
    ]
    assert [point.orders_count for point in points] == [2, 0, 1]
    assert [point.units_count for point in points] == [3, 0, 1]
    assert [point.amount for point in points] == [
        Decimal("120.00"),
        Decimal("0.00"),
        Decimal("70.00"),
    ]
    # Zero filling never inflates the recorded totals.
    assert sum(point.orders_count for point in points) == 3
    assert sum(point.units_count for point in points) == 4
    assert sum(point.amount for point in points) == Decimal("190.00")
