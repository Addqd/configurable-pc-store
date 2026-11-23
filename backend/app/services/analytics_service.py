"""Sales and review analytics over the independent `sales_line_facts` ledger.

Historical revenue always comes from ledger snapshots (`unit_price`, `line_total`,
`ordered_at`), never from current product prices. Deleting a user removes orders
but not ledger rows, so metrics stay stable. One ledger row exists per order item
(`source_order_item_id` is unique), which prevents double counting; orders are
counted with `COUNT(DISTINCT source_order_id)`.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import Numeric, cast, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Manufacturer,
    Product,
    ProductType,
    Review,
    SaleLineFact,
)
from app.schemas.admin_stats import (
    AdminComparisonTimelineOut,
    AdminOverviewOut,
    AdminPaginatedProductStatsOut,
    AdminProductStatOut,
    AdminProductStatsDetailOut,
    AdminProductTimelineOut,
    MonthlyPointOut,
    RatingBucketOut,
    TopReviewedProductOut,
    TopSellingProductOut,
)
from app.services.errors import InvalidInputError, NotFoundError
from app.services.sql_utils import like_pattern, money

MAX_COMPARISON_PRODUCTS = 5
MAX_MONTHS = 120
# Maximum number of buckets a daily series may contain.
MAX_DAYS = 400
# Maximum number of buckets a yearly series may contain. It only applies to the
# requested interval: an axis is narrowed to the recorded years first, and a
# recorded history longer than this is reported instead of being truncated.
MAX_YEARS = 400

Granularity = Literal["day", "month", "year"]


def _sales_bounds(
    date_from: date | None, date_to: date | None
) -> tuple[datetime | None, datetime | None]:
    start = datetime.combine(date_from, time.min, tzinfo=UTC) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        if date_to
        else None
    )
    return start, end


def _range_clauses(
    column: Any, date_from: date | None, date_to: date | None
) -> list[Any]:
    start, end = _sales_bounds(date_from, date_to)
    clauses: list[Any] = []
    if start is not None:
        clauses.append(column >= start)
    if end is not None:
        clauses.append(column < end)
    return clauses


def _sales_filters(date_from: date | None, date_to: date | None) -> list[Any]:
    """Product-line ledger filters for product-level aggregates."""
    return [
        SaleLineFact.kind == "product",
        SaleLineFact.product_id.is_not(None),
        *_range_clauses(SaleLineFact.ordered_at, date_from, date_to),
    ]


def _ledger_filters(date_from: date | None, date_to: date | None) -> list[Any]:
    """All completed demo sales, including custom-build lines."""
    return list(_range_clauses(SaleLineFact.ordered_at, date_from, date_to))


def _review_filters(date_from: date | None, date_to: date | None) -> list[Any]:
    return [
        Review.is_published.is_(True),
        *_range_clauses(Review.displayed_at, date_from, date_to),
    ]


def _month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def _shift_months(value: date, months: int) -> date:
    """First day of the month `months` away from the month of `value`."""
    index = value.year * 12 + (value.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def _month_end(value: date) -> date:
    """Last day of the month `value` belongs to."""
    return _shift_months(_month_start(value), 1) - timedelta(days=1)


def _month_first(month_value: datetime | date) -> date:
    return date(month_value.year, month_value.month, 1)


def _year_first(value: datetime | date) -> date:
    return date(value.year, 1, 1)


def _day_of(value: datetime | date) -> date:
    return date(value.year, value.month, value.day)


def _bucket_first(value: datetime | date, granularity: Granularity) -> date:
    """Start of the bucket a ledger timestamp belongs to."""
    if granularity == "year":
        return _year_first(value)
    return _month_first(value) if granularity == "month" else _day_of(value)


def _bucket_floor(value: date, granularity: Granularity) -> date:
    """Start of the bucket a requested range boundary belongs to."""
    if granularity == "year":
        return _year_first(value)
    return _month_start(value) if granularity == "month" else value


def _year_sequence(start: date, end: date) -> list[date]:
    current = _year_first(start)
    last = max(_year_first(end), current)
    years: list[date] = []
    while current <= last and len(years) < MAX_YEARS:
        years.append(current)
        current = date(current.year + 1, 1, 1)
    return years


def _month_sequence(start: date, end: date) -> list[date]:
    current = _month_start(start)
    last = max(_month_start(end), current)
    months: list[date] = []
    while current <= last and len(months) < MAX_MONTHS:
        months.append(current)
        current = _shift_months(current, 1)
    return months


def _bucket_limit(granularity: Granularity) -> int:
    """Hard ceiling on the number of points one series may return."""
    if granularity == "year":
        return MAX_YEARS
    return MAX_DAYS if granularity == "day" else MAX_MONTHS


def _bucket_span(start: date, end: date, granularity: Granularity) -> int:
    """Number of buckets an inclusive interval covers in `granularity`."""
    if granularity == "year":
        return end.year - start.year + 1
    if granularity == "month":
        return (end.year - start.year) * 12 + (end.month - start.month) + 1
    return (end - start).days + 1


def _tail_window(start: date, end: date, granularity: Granularity) -> tuple[date, date]:
    """The last `_bucket_limit` buckets of an interval that cannot be shown whole."""
    limit = _bucket_limit(granularity)
    if granularity == "year":
        return max(start, date(end.year - (limit - 1), 1, 1)), end
    if granularity == "month":
        return max(start, _shift_months(end, -(limit - 1))), end
    return max(start, end - timedelta(days=limit - 1)), end


def _display_interval(
    start: date,
    end: date,
    buckets: Sequence[date],
    granularity: Granularity,
) -> tuple[date, date]:
    """Bounded interval one shared axis may draw for the requested period.

    The requested filtering interval stays the source of the totals; it can be far
    longer than a readable axis. A bounded axis must never drop a recorded sale, so
    an over-long request is narrowed to the interval that actually holds the
    records. Only a window that still cannot be shown whole is cut from its tail;
    a yearly axis is never cut, because that would hide real recorded sales.
    """
    if _bucket_span(start, end, granularity) <= _bucket_limit(granularity):
        return start, end
    if not buckets:
        # Nothing recorded inside this long interval: stay bounded and empty rather
        # than drawing thousands of zero points.
        return _tail_window(start, end, granularity)
    first_recorded, last_recorded = min(buckets), max(buckets)
    if granularity == "day":
        # Daily points exist only when every record falls inside one calendar month,
        # so that month (clipped to the request) covers each recorded day. The span
        # is widened to the last recorded month, so no bucket can fall outside it.
        window_start = max(start, _month_start(first_recorded))
        window_end = min(end, _month_end(last_recorded))
    elif granularity == "year":
        # A yearly axis never needs a tail window: it is narrowed to the years that
        # actually hold records, so no recorded sale can be cut off.
        window_start = max(start, _year_first(first_recorded))
        window_end = min(end, _year_first(last_recorded))
        if _bucket_span(window_start, window_end, "year") > MAX_YEARS:
            raise InvalidInputError(
                "Recorded sales span more than "
                f"{MAX_YEARS} years and cannot be drawn on one axis"
            )
        return window_start, window_end
    else:
        window_start = max(start, first_recorded)
        window_end = min(end, last_recorded)
    if _bucket_span(window_start, window_end, granularity) <= _bucket_limit(
        granularity
    ):
        return window_start, window_end
    return _tail_window(window_start, window_end, granularity)


def _bucket_sequence(start: date, end: date, granularity: Granularity) -> list[date]:
    """Ordered bucket starts between `start` and `end`, both inclusive."""
    if granularity == "year":
        return _year_sequence(start, end)
    if granularity == "month":
        return _month_sequence(start, end)
    days: list[date] = []
    current = start
    while current <= end and len(days) < MAX_DAYS:
        days.append(current)
        current += timedelta(days=1)
    return days


def _bucket_rows(
    db: Session,
    filters: list[Any],
    granularity: Granularity,
    product_id: int | None = None,
) -> dict[date, tuple[int, int, Decimal]]:
    bucket = func.date_trunc(granularity, SaleLineFact.ordered_at).label("bucket")
    statement = select(
        bucket,
        func.count(distinct(SaleLineFact.source_order_id)),
        func.coalesce(func.sum(SaleLineFact.quantity), 0),
        func.coalesce(func.sum(SaleLineFact.line_total), 0),
    ).where(*filters)
    if product_id is not None:
        statement = statement.where(SaleLineFact.product_id == product_id)
    statement = statement.group_by(bucket).order_by(bucket)
    series: dict[date, tuple[int, int, Decimal]] = {}
    for bucket_value, orders, units, amount in db.execute(statement).all():
        series[_bucket_first(bucket_value, granularity)] = (
            int(orders or 0),
            int(units or 0),
            money(amount),
        )
    return series


def _sales_span(db: Session, filters: list[Any]) -> tuple[date | None, date | None]:
    """First and last calendar day that actually produced a sales row."""
    earliest, latest = db.execute(
        select(
            func.min(SaleLineFact.ordered_at), func.max(SaleLineFact.ordered_at)
        ).where(*filters)
    ).one()
    if earliest is None or latest is None:
        return None, None
    return _day_of(earliest), _day_of(latest)


def _granularity_for(
    span: tuple[date | None, date | None],
    date_from: date | None,
    date_to: date | None,
) -> Granularity:
    """Daily buckets when the sales records cover one calendar month only.

    The rule looks at the records, not at the requested period, so a 30-day,
    three-month or all-time selection over a single month of sales still becomes a
    readable daily line. Several calendar months keep the existing monthly
    aggregation, and a recorded history longer than the monthly bucket cap is
    grouped by calendar year instead of having its oldest months dropped. With no
    sales at all the requested interval decides.
    """
    earliest, latest = span
    if earliest is not None and latest is not None:
        months = (
            (latest.year - earliest.year) * 12 + (latest.month - earliest.month) + 1
        )
        if months > MAX_MONTHS:
            return "year"
        same_month = (earliest.year, earliest.month) == (latest.year, latest.month)
        return "day" if same_month else "month"
    start = date_from or date_to
    end = date_to or date_from
    same_month_range = (
        start is not None
        and end is not None
        and (start.year, start.month) == (end.year, end.month)
    )
    return "day" if same_month_range else "month"


def _bucket_bounds(
    series_group: Sequence[dict[date, tuple[int, int, Decimal]]],
    date_from: date | None,
    date_to: date | None,
    granularity: Granularity,
) -> tuple[date, date]:
    """One bounded interval, in the request's granularity, shared by every series.

    An explicit range wins; otherwise the interval is derived from all supplied
    sales data, so compared products always share the same bucket sequence. The
    result is kept inside the per-granularity bucket cap without dropping recorded
    activity, so a request longer than that cap still draws its sales.
    """
    buckets = [bucket for series in series_group for bucket in series]
    if date_from is not None:
        start = _bucket_floor(date_from, granularity)
    elif buckets:
        start = min(buckets)
    elif date_to is not None:
        start = _bucket_floor(date_to, granularity)
    else:
        start = _bucket_floor(date.today(), granularity)
    if date_to is not None:
        end = _bucket_floor(date_to, granularity)
    elif buckets:
        end = max(buckets)
    else:
        end = start
    return _display_interval(start, max(end, start), buckets, granularity)


def _fill_between(
    series: dict[date, tuple[int, int, Decimal]],
    start: date,
    end: date,
    granularity: Granularity,
) -> list[MonthlyPointOut]:
    """Zero-fill `series` over the given inclusive bucket interval."""
    empty = (0, 0, Decimal("0.00"))
    return [
        MonthlyPointOut(
            month=bucket,
            orders_count=series.get(bucket, empty)[0],
            units_count=series.get(bucket, empty)[1],
            amount=series.get(bucket, empty)[2],
        )
        for bucket in _bucket_sequence(start, end, granularity)
    ]


def _fill_buckets(
    series: dict[date, tuple[int, int, Decimal]],
    date_from: date | None,
    date_to: date | None,
    granularity: Granularity,
) -> list[MonthlyPointOut]:
    start, end = _bucket_bounds([series], date_from, date_to, granularity)
    return _fill_between(series, start, end, granularity)


def _top_selling(
    db: Session, date_from: date | None, date_to: date | None
) -> list[TopSellingProductOut]:
    units = func.sum(SaleLineFact.quantity)
    amount = func.sum(SaleLineFact.line_total)
    statement = (
        select(
            SaleLineFact.product_id,
            func.coalesce(func.max(Product.name), func.max(SaleLineFact.name_snapshot)),
            func.max(Product.sku),
            units,
            amount,
        )
        .outerjoin(Product, Product.id == SaleLineFact.product_id)
        .where(*_sales_filters(date_from, date_to))
        .group_by(SaleLineFact.product_id)
        .order_by(units.desc(), amount.desc(), SaleLineFact.product_id.asc())
        .limit(5)
    )
    return [
        TopSellingProductOut(
            product_id=product_id,
            name=name or "",
            sku=sku,
            units=int(unit_count or 0),
            amount=money(total),
        )
        for product_id, name, sku, unit_count, total in db.execute(statement).all()
    ]


def _top_reviewed(
    db: Session, date_from: date | None, date_to: date | None
) -> list[TopReviewedProductOut]:
    count = func.count(Review.id)
    average = func.avg(Review.rating)
    statement = (
        select(Product.id, Product.name, Product.sku, count, average)
        .join(Review, Review.product_id == Product.id)
        .where(*_review_filters(date_from, date_to))
        .group_by(Product.id, Product.name, Product.sku)
        .order_by(count.desc(), average.desc(), Product.id.asc())
        .limit(5)
    )
    return [
        TopReviewedProductOut(
            product_id=product_id,
            name=name,
            sku=sku,
            review_count=int(review_count or 0),
            average_rating=round(float(rating or 0), 2),
        )
        for product_id, name, sku, review_count, rating in db.execute(statement).all()
    ]


def overview(
    db: Session,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminOverviewOut:
    if date_from and date_to and date_to < date_from:
        raise InvalidInputError("date_to must not be earlier than date_from")
    totals = db.execute(
        select(
            func.count(distinct(SaleLineFact.source_order_id)),
            func.coalesce(func.sum(SaleLineFact.quantity), 0),
            func.coalesce(func.sum(SaleLineFact.line_total), 0),
        ).where(*_ledger_filters(date_from, date_to))
    ).one()
    review_totals = db.execute(
        select(func.count(Review.id), func.avg(Review.rating)).where(
            *_review_filters(date_from, date_to)
        )
    ).one()
    ledger_filters = _ledger_filters(date_from, date_to)
    granularity = _granularity_for(_sales_span(db, ledger_filters), date_from, date_to)
    monthly = _fill_buckets(
        _bucket_rows(db, ledger_filters, granularity),
        date_from,
        date_to,
        granularity,
    )
    return AdminOverviewOut(
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        completed_orders=int(totals[0] or 0),
        sold_units=int(totals[1] or 0),
        revenue=money(totals[2]),
        review_count=int(review_totals[0] or 0),
        average_rating=round(float(review_totals[1] or 0), 2),
        monthly=monthly,
        top_products_by_sales=_top_selling(db, date_from, date_to),
        top_products_by_reviews=_top_reviewed(db, date_from, date_to),
    )


SORT_ORDERS: dict[str, str] = {
    "sold_units_desc": "sold_units",
    "sold_units_asc": "sold_units",
    "revenue_desc": "revenue",
    "revenue_asc": "revenue",
    "rating_desc": "average_rating",
    "rating_asc": "average_rating",
    "review_count_desc": "review_count",
    "review_count_asc": "review_count",
    "name_asc": "name",
    "name_desc": "name",
    "id_asc": "id",
    "id_desc": "id",
}
_ASCENDING = {
    "sold_units_asc",
    "revenue_asc",
    "rating_asc",
    "review_count_asc",
    "name_asc",
    "id_asc",
}


def _product_stats_query(
    *,
    date_from: date | None,
    date_to: date | None,
    q: str | None,
    category: str | None,
    manufacturer: str | None,
):
    sales = (
        select(
            SaleLineFact.product_id.label("product_id"),
            func.sum(SaleLineFact.quantity).label("sold_units"),
            func.sum(SaleLineFact.line_total).label("revenue"),
            func.count(distinct(SaleLineFact.source_order_id)).label("orders_count"),
        )
        .where(*_sales_filters(date_from, date_to))
        .group_by(SaleLineFact.product_id)
        .subquery()
    )
    reviews = (
        select(
            Review.product_id.label("product_id"),
            func.count(Review.id).label("review_count"),
            func.avg(Review.rating).label("average_rating"),
        )
        .where(*_review_filters(date_from, date_to))
        .group_by(Review.product_id)
        .subquery()
    )
    statement = (
        select(
            Product.id.label("id"),
            Product.slug.label("slug"),
            Product.sku.label("sku"),
            Product.name.label("name"),
            Product.is_active.label("is_active"),
            Category.name.label("category"),
            Manufacturer.name.label("manufacturer"),
            func.coalesce(sales.c.sold_units, 0).label("sold_units"),
            cast(func.coalesce(sales.c.revenue, 0), Numeric(18, 2)).label("revenue"),
            func.coalesce(sales.c.orders_count, 0).label("orders_count"),
            func.coalesce(reviews.c.review_count, 0).label("review_count"),
            func.coalesce(reviews.c.average_rating, 0).label("average_rating"),
        )
        .join(ProductType, ProductType.id == Product.product_type_id)
        .join(Category, Category.id == ProductType.category_id)
        .join(Manufacturer, Manufacturer.id == Product.manufacturer_id)
        .outerjoin(sales, sales.c.product_id == Product.id)
        .outerjoin(reviews, reviews.c.product_id == Product.id)
    )
    if q and q.strip():
        pattern = like_pattern(q)
        statement = statement.where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.sku.ilike(pattern, escape="\\"),
            )
        )
    if category:
        statement = statement.where(Category.slug == category)
    if manufacturer:
        statement = statement.where(Manufacturer.slug == manufacturer)
    return statement.subquery()


def _stat_from_row(row: Any) -> AdminProductStatOut:
    return AdminProductStatOut(
        id=int(row.id),
        slug=row.slug,
        sku=row.sku,
        name=row.name,
        category=row.category,
        manufacturer=row.manufacturer,
        is_active=bool(row.is_active),
        sold_units=int(row.sold_units or 0),
        revenue=money(row.revenue),
        orders_count=int(row.orders_count or 0),
        review_count=int(row.review_count or 0),
        average_rating=round(float(row.average_rating or 0), 2),
    )


def product_stats(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    category: str | None = None,
    manufacturer: str | None = None,
    min_rating: float | None = None,
    max_rating: float | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = "sold_units_desc",
    active: str = "all",
) -> AdminPaginatedProductStatsOut:
    if date_from and date_to and date_to < date_from:
        raise InvalidInputError("date_to must not be earlier than date_from")
    subquery = _product_stats_query(
        date_from=date_from,
        date_to=date_to,
        q=q,
        category=category,
        manufacturer=manufacturer,
    )
    statement = select(subquery)
    if min_rating is not None:
        statement = statement.where(subquery.c.average_rating >= min_rating)
    if max_rating is not None:
        statement = statement.where(subquery.c.average_rating <= max_rating)
    if active == "active":
        statement = statement.where(subquery.c.is_active.is_(True))
    elif active == "inactive":
        statement = statement.where(subquery.c.is_active.is_(False))

    total = int(db.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    column = SORT_ORDERS.get(sort, "sold_units")
    column_value = getattr(subquery.c, column)
    order = column_value.asc() if sort in _ASCENDING else column_value.desc()
    rows = db.execute(
        statement.order_by(order, subquery.c.id.asc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return AdminPaginatedProductStatsOut(
        items=[_stat_from_row(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


def _single_product_stat(
    db: Session, product_id: int, date_from: date | None, date_to: date | None
) -> AdminProductStatOut:
    subquery = _product_stats_query(
        date_from=date_from,
        date_to=date_to,
        q=None,
        category=None,
        manufacturer=None,
    )
    row = db.execute(select(subquery).where(subquery.c.id == product_id)).one_or_none()
    if row is None:
        raise NotFoundError("Product not found")
    return _stat_from_row(row)


def _rating_distribution(
    db: Session, product_id: int, date_from: date | None, date_to: date | None
) -> list[RatingBucketOut]:
    rows = db.execute(
        select(Review.rating, func.count(Review.id))
        .where(
            Review.product_id == product_id,
            *_review_filters(date_from, date_to),
        )
        .group_by(Review.rating)
    ).all()
    counts = {int(rating): int(count or 0) for rating, count in rows}
    return [
        RatingBucketOut(rating=rating, count=counts.get(rating, 0))
        for rating in range(1, 6)
    ]


def product_stats_detail(
    db: Session,
    product_id: int,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminProductStatsDetailOut:
    if date_from and date_to and date_to < date_from:
        raise InvalidInputError("date_to must not be earlier than date_from")
    product = _single_product_stat(db, product_id, date_from, date_to)
    sales_filters = [
        *_sales_filters(date_from, date_to),
        SaleLineFact.product_id == product_id,
    ]
    granularity = _granularity_for(_sales_span(db, sales_filters), date_from, date_to)
    return AdminProductStatsDetailOut(
        product=product,
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        monthly=_fill_buckets(
            _bucket_rows(db, sales_filters, granularity, product_id=product_id),
            date_from,
            date_to,
            granularity,
        ),
        rating_distribution=_rating_distribution(db, product_id, date_from, date_to),
    )


def comparison_timeline(
    db: Session,
    product_ids: list[int],
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> AdminComparisonTimelineOut:
    selected = list(dict.fromkeys(product_ids))
    if not selected:
        raise InvalidInputError("At least one product_id is required")
    if len(selected) > MAX_COMPARISON_PRODUCTS:
        raise InvalidInputError(
            f"At most {MAX_COMPARISON_PRODUCTS} products can be compared"
        )
    if date_from and date_to and date_to < date_from:
        raise InvalidInputError("date_to must not be earlier than date_from")
    products = db.scalars(
        select(Product).where(Product.id.in_(selected)).order_by(Product.name)
    ).all()
    found = {product.id: product for product in products}
    missing = [pid for pid in selected if pid not in found]
    if missing:
        raise NotFoundError(f"Unknown product ids: {missing}")

    comparison_filters = [
        SaleLineFact.kind == "product",
        SaleLineFact.product_id.in_(selected),
        *_range_clauses(SaleLineFact.ordered_at, date_from, date_to),
    ]
    # One granularity for the whole request, decided by all compared records, so
    # sparse products are aligned on the same axis as dense ones.
    granularity = _granularity_for(
        _sales_span(db, comparison_filters), date_from, date_to
    )
    bucket = func.date_trunc(granularity, SaleLineFact.ordered_at).label("bucket")
    rows = db.execute(
        select(
            SaleLineFact.product_id,
            bucket,
            func.count(distinct(SaleLineFact.source_order_id)),
            func.coalesce(func.sum(SaleLineFact.quantity), 0),
            func.coalesce(func.sum(SaleLineFact.line_total), 0),
        )
        .where(*comparison_filters)
        .group_by(SaleLineFact.product_id, bucket)
        .order_by(SaleLineFact.product_id, bucket)
    ).all()

    series_by_product: dict[int, dict[date, tuple[int, int, Decimal]]] = {
        product_id: {} for product_id in selected
    }
    for product_id, bucket_value, orders, units, amount in rows:
        series_by_product[int(product_id)][_bucket_first(bucket_value, granularity)] = (
            int(orders or 0),
            int(units or 0),
            money(amount),
        )

    # Every compared series returns exactly the same ordered labels, zero-filled
    # where a product had no sales. `_bucket_bounds` uses the explicit range when
    # it was supplied.
    start, end = _bucket_bounds(
        list(series_by_product.values()), date_from, date_to, granularity
    )
    return AdminComparisonTimelineOut(
        date_from=date_from,
        date_to=date_to,
        granularity=granularity,
        series=[
            AdminProductTimelineOut(
                product_id=product_id,
                name=found[product_id].name,
                sku=found[product_id].sku,
                monthly=_fill_between(
                    series_by_product[product_id], start, end, granularity
                ),
            )
            for product_id in selected
        ],
    )
