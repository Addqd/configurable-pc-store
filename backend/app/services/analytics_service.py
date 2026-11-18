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
from typing import Any

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


def _month_first(month_value: datetime | date) -> date:
    return date(month_value.year, month_value.month, 1)


def _month_sequence(start: date, end: date) -> list[date]:
    current = _month_start(start)
    last = _month_start(end)
    last = max(last, current)
    months: list[date] = []
    while current <= last and len(months) < MAX_MONTHS:
        months.append(current)
        year = current.year + (current.month // 12)
        month = current.month % 12 + 1
        current = date(year, month, 1)
    return months


def _monthly_rows(
    db: Session,
    filters: list[Any],
    product_id: int | None = None,
) -> dict[date, tuple[int, int, Decimal]]:
    month = func.date_trunc("month", SaleLineFact.ordered_at).label("month")
    statement = select(
        month,
        func.count(distinct(SaleLineFact.source_order_id)),
        func.coalesce(func.sum(SaleLineFact.quantity), 0),
        func.coalesce(func.sum(SaleLineFact.line_total), 0),
    ).where(*filters)
    if product_id is not None:
        statement = statement.where(SaleLineFact.product_id == product_id)
    statement = statement.group_by(month).order_by(month)
    series: dict[date, tuple[int, int, Decimal]] = {}
    for month_value, orders, units, amount in db.execute(statement).all():
        series[_month_first(month_value)] = (
            int(orders or 0),
            int(units or 0),
            money(amount),
        )
    return series


def _month_bounds(
    series_group: Sequence[dict[date, tuple[int, int, Decimal]]],
    date_from: date | None,
    date_to: date | None,
) -> tuple[date, date]:
    """One calendar-month interval shared by every series of a request.

    An explicit range wins; otherwise the interval is derived from all supplied
    sales data, so compared products always share the same month sequence.
    """
    months = [month for series in series_group for month in series]
    if date_from is not None:
        start = _month_start(date_from)
    elif months:
        start = min(months)
    elif date_to is not None:
        start = _month_start(date_to)
    else:
        start = _month_start(date.today())
    if date_to is not None:
        end = _month_start(date_to)
    elif months:
        end = max(months)
    else:
        end = start
    return start, max(end, start)


def _fill_between(
    series: dict[date, tuple[int, int, Decimal]], start: date, end: date
) -> list[MonthlyPointOut]:
    """Zero-fill `series` over the given inclusive month interval."""
    empty = (0, 0, Decimal("0.00"))
    return [
        MonthlyPointOut(
            month=month,
            orders_count=series.get(month, empty)[0],
            units_count=series.get(month, empty)[1],
            amount=series.get(month, empty)[2],
        )
        for month in _month_sequence(start, end)
    ]


def _fill_months(
    series: dict[date, tuple[int, int, Decimal]],
    date_from: date | None,
    date_to: date | None,
) -> list[MonthlyPointOut]:
    start, end = _month_bounds([series], date_from, date_to)
    return _fill_between(series, start, end)


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
    monthly = _fill_months(
        _monthly_rows(db, [*_ledger_filters(date_from, date_to)]),
        date_from,
        date_to,
    )
    return AdminOverviewOut(
        date_from=date_from,
        date_to=date_to,
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
    return AdminProductStatsDetailOut(
        product=product,
        date_from=date_from,
        date_to=date_to,
        monthly=_fill_months(
            _monthly_rows(
                db,
                [*_sales_filters(date_from, date_to)],
                product_id=product_id,
            ),
            date_from,
            date_to,
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

    month = func.date_trunc("month", SaleLineFact.ordered_at).label("month")
    rows = db.execute(
        select(
            SaleLineFact.product_id,
            month,
            func.count(distinct(SaleLineFact.source_order_id)),
            func.coalesce(func.sum(SaleLineFact.quantity), 0),
            func.coalesce(func.sum(SaleLineFact.line_total), 0),
        )
        .where(
            SaleLineFact.kind == "product",
            SaleLineFact.product_id.in_(selected),
            *_range_clauses(SaleLineFact.ordered_at, date_from, date_to),
        )
        .group_by(SaleLineFact.product_id, month)
        .order_by(SaleLineFact.product_id, month)
    ).all()

    series_by_product: dict[int, dict[date, tuple[int, int, Decimal]]] = {
        product_id: {} for product_id in selected
    }
    for product_id, month_value, orders, units, amount in rows:
        series_by_product[int(product_id)][_month_first(month_value)] = (
            int(orders or 0),
            int(units or 0),
            money(amount),
        )

    # One shared interval for the whole request: every compared series returns
    # exactly the same ordered month labels, zero-filled where a product had no
    # sales. `_month_bounds` uses the explicit range when it was supplied.
    start, end = _month_bounds(list(series_by_product.values()), date_from, date_to)
    return AdminComparisonTimelineOut(
        date_from=date_from,
        date_to=date_to,
        series=[
            AdminProductTimelineOut(
                product_id=product_id,
                name=found[product_id].name,
                sku=found[product_id].sku,
                monthly=_fill_between(series_by_product[product_id], start, end),
            )
            for product_id in selected
        ],
    )
