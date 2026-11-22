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
    _bucket_bounds,
    _bucket_first,
    _bucket_sequence,
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
