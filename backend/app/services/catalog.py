"""Catalog service: product queries, search, filters, and image handling."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import (
    func,
    or_,
    select,
    text,
)
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Category,
    Manufacturer,
    Product,
    ProductImage,
    ProductType,
    Review,
)

# Path to the original placeholder JPEG (copied alongside API).
_PLACEHOLDER_FILENAME = "product-placeholder.jpg"


def _placeholder_url() -> str:
    """Return the API-relative URL for the product placeholder image."""
    return f"/api/v1/assets/{_PLACEHOLDER_FILENAME}"


def _is_valid_image_url(url: str | None) -> bool:
    """Check whether an image_url is non-empty and well-formed."""
    if not url:
        return False
    stripped = url.strip()
    if not stripped:
        return False
    # Accept http/https URLs or relative paths
    return bool(stripped.startswith(("http://", "https://", "/")))


def _apply_filters(
    stmt: Any,
    categories: Sequence[str] | None = None,
    types: Sequence[str] | None = None,
    manufacturers: Sequence[str] | None = None,
    colors: Sequence[str] | None = None,
    sale_only: bool = False,
) -> Any:
    """Apply category / type / manufacturer / color / sale filters."""
    if categories:
        stmt = stmt.where(Category.slug.in_(categories))
    if types:
        stmt = stmt.where(ProductType.slug.in_(types))
    if manufacturers:
        stmt = stmt.where(Manufacturer.slug.in_(manufacturers))
    if colors:
        stmt = stmt.where(Product.color.in_(colors))
    if sale_only:
        stmt = stmt.where(Product.on_sale.is_(True))
    return stmt


def _apply_sort(
    stmt: Any,
    sort: str,
) -> Any:
    """Apply sorting to the product query."""
    sort_map = {
        "newest": Product.listed_at.desc(),
        "oldest": Product.listed_at.asc(),
        "rating_high": (
            func.coalesce(func.avg(Review.rating), 0).desc(),
            func.count(Review.id).desc(),
        ),
        "rating_low": (
            func.coalesce(func.avg(Review.rating), 0).asc(),
            func.count(Review.id).asc(),
        ),
        "price_asc": Product.price.asc(),
        "price_desc": Product.price.desc(),
    }
    if sort == "rating_high" or sort == "rating_low":
        # Need a join + group for rating
        stmt = stmt.join(Review, Review.product_id == Product.id, isouter=True)
        if sort == "rating_high":
            stmt = stmt.order_by(
                func.coalesce(func.avg(Review.rating), 0).desc(),
                func.count(Review.id).desc(),
            )
        else:
            stmt = stmt.order_by(
                func.coalesce(func.avg(Review.rating), 0).asc(),
                func.count(Review.id).asc(),
            )
        stmt = stmt.group_by(Product.id)
    elif sort in sort_map:
        stmt = stmt.order_by(sort_map[sort])
    return stmt


def _enrich_product(
    product: Product, db: Session, placeholder: str
) -> ProductDetailOut:
    """Build a ProductDetailOut for a single product."""
    # Images
    real_images = [pi for pi in product.images if _is_valid_image_url(pi.image_url)]
    real_images.sort(key=lambda pi: (pi.sort_order, pi.id))

    image_list = [
        ProductImageOut(
            url=pi.image_url, alt_text=pi.alt_text, sort_order=pi.sort_order
        )
        for pi in real_images
    ]
    cover = real_images[0].image_url if real_images else placeholder

    # Rating
    rating_row = db.execute(
        select(
            func.coalesce(func.avg(Review.rating), 0).label("avg"),
            func.count(Review.id).label("cnt"),
        ).where(Review.product_id == product.id)
    ).first()
    avg_rating = float(rating_row.avg) if rating_row and rating_row.avg else 0.0
    review_count = rating_row.cnt if rating_row else 0

    return ProductDetailOut(
        id=product.id,
        slug=product.slug,
        name=product.name,
        description=product.description,
        price=product.price,
        stock_quantity=product.stock_quantity,
        color=product.color,
        graphics_chip_brand=product.graphics_chip_brand,
        spec_lines=product.spec_lines or [],
        short_specs=product.short_specs or [],
        technical_specs=product.technical_specs or {},
        on_sale=product.on_sale,
        is_active=product.is_active,
        listed_at=product.listed_at,
        created_at=product.created_at,
        updated_at=product.updated_at,
        category=CategoryOut(
            id=product.product_type.category.id,
            slug=product.product_type.category.slug,
            name=product.product_type.category.name,
            sort_order=product.product_type.category.sort_order,
        ),
        product_type=ProductTypeOut(
            id=product.product_type.id,
            category_id=product.product_type.category_id,
            slug=product.product_type.slug,
            name=product.product_type.name,
        ),
        manufacturer=ManufacturerOut(
            id=product.manufacturer.id,
            slug=product.manufacturer.slug,
            name=product.manufacturer.name,
        ),
        cover_image_url=cover,
        images=image_list,
        average_rating=round(avg_rating, 2),
        review_count=review_count,
    )


def _enrich_summary(product: Product, placeholder: str) -> ProductSummaryOut:
    """Build a ProductSummaryOut for list views."""
    real_images = [pi for pi in product.images if _is_valid_image_url(pi.image_url)]
    real_images.sort(key=lambda pi: (pi.sort_order, pi.id))

    image_list = [
        ProductImageOut(
            url=pi.image_url, alt_text=pi.alt_text, sort_order=pi.sort_order
        )
        for pi in real_images
    ]
    cover = real_images[0].image_url if real_images else placeholder

    return ProductSummaryOut(
        id=product.id,
        slug=product.slug,
        name=product.name,
        price=product.price,
        color=product.color,
        graphics_chip_brand=product.graphics_chip_brand,
        on_sale=product.on_sale,
        is_active=product.is_active,
        cover_image_url=cover,
        images=image_list,
        average_rating=0.0,
        review_count=0,
        category=CategoryOut(
            id=product.product_type.category.id,
            slug=product.product_type.category.slug,
            name=product.product_type.category.name,
            sort_order=product.product_type.category.sort_order,
        ),
        product_type=ProductTypeOut(
            id=product.product_type.id,
            category_id=product.product_type.category_id,
            slug=product.product_type.slug,
            name=product.product_type.name,
        ),
        manufacturer=ManufacturerOut(
            id=product.manufacturer.id,
            slug=product.manufacturer.slug,
            name=product.manufacturer.name,
        ),
    )


def list_products(
    db: Session,
    page: int = 1,
    page_size: int = 49,
    categories: Sequence[str] | None = None,
    types: Sequence[str] | None = None,
    manufacturers: Sequence[str] | None = None,
    colors: Sequence[str] | None = None,
    sale_only: bool = False,
    sort: str = "newest",
) -> PaginatedProductsOut:
    """List products with pagination, filters, and sorting."""
    placeholder = _placeholder_url()

    # Count query
    count_stmt = select(func.count(Product.id))
    count_stmt = _apply_filters(
        count_stmt, categories, types, manufacturers, colors, sale_only
    )

    total = db.execute(count_stmt).scalar() or 0
    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, page)

    # Data query
    data_stmt = (
        select(Product)
        .join(Product.product_type)
        .join(Category, ProductType.category)
        .join(Manufacturer)
        .where(Product.is_active.is_(True))
    )
    data_stmt = _apply_filters(
        data_stmt, categories, types, manufacturers, colors, sale_only
    )
    data_stmt = _apply_sort(data_stmt, sort)
    data_stmt = data_stmt.limit(page_size).offset((page - 1) * page_size)

    products = db.scalars(data_stmt).all()

    items = [_enrich_summary(p, placeholder) for p in products]

    return PaginatedProductsOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def get_product_by_slug(db: Session, slug: str) -> ProductDetailOut | None:
    """Get a single product by slug with full details."""
    placeholder = _placeholder_url()

    product = db.execute(
        select(Product)
        .join(Product.product_type)
        .options(joinedload(Product.product_type).joinedload(ProductType.category))
        .join(Manufacturer)
        .where(Product.slug == slug, Product.is_active.is_(True))
    ).scalar_one_or_none()

    if product is None:
        return None

    return _enrich_product(product, db, placeholder)


def search_products(
    db: Session,
    q: str,
    page: int = 1,
    page_size: int = 49,
    categories: Sequence[str] | None = None,
    types: Sequence[str] | None = None,
    manufacturers: Sequence[str] | None = None,
    colors: Sequence[str] | None = None,
    sale_only: bool = False,
    sort: str = "newest",
) -> PaginatedProductsOut:
    """Search products using PostgreSQL FTS + pg_trgm."""
    placeholder = _placeholder_url()
    if not q.strip():
        return list_products(
            db,
            page,
            page_size,
            categories,
            types,
            manufacturers,
            colors,
            sale_only,
            sort,
        )

    search_term = q.strip()
    # Combine FTS + trgm for relevance
    ts_rank_expr = func.ts_rank(
        func.to_tsvector(text("'simple'::regconfig"), Product.name),
        func.websearch_to_tsquery(text("'simple'::regconfig"), search_term),
        4,
    )
    trgm_rank = func.similarity(Product.name, search_term)

    # Combined relevance: trgm for fuzzy + FTS for word matching
    relevance = (trgm_rank * 2.0) + ts_rank_expr

    count_subquery = select(func.count(Product.id)).where(
        Product.is_active.is_(True),
        or_(
            func.to_tsvector(text("'simple'::regconfig"), Product.name).op("@@")(
                func.websearch_to_tsquery(text("'simple'::regconfig"), search_term)
            ),
            func.similarity(Product.name, search_term) > 0.1,
        ),
    )
    count_subquery = _apply_filters(
        count_subquery, categories, types, manufacturers, colors, sale_only
    )
    total = (
        db.execute(select(func.count()).select_from(count_subquery.subquery())).scalar()
        or 0
    )

    total_pages = max(1, (total + page_size - 1) // page_size)
    page = max(1, page)

    data_stmt = (
        select(Product)
        .join(Product.product_type)
        .join(Category, ProductType.category)
        .join(Manufacturer)
        .where(
            Product.is_active.is_(True),
            or_(
                func.to_tsvector(text("'simple'::regconfig"), Product.name).op("@@")(
                    func.websearch_to_tsquery(text("'simple'::regconfig"), search_term)
                ),
                func.similarity(Product.name, search_term) > 0.1,
            ),
        )
        .order_by(relevance.desc())
        .limit(page_size)
        .offset((page - 1) * page_size)
    )
    data_stmt = _apply_filters(
        data_stmt, categories, types, manufacturers, colors, sale_only
    )
    # Re-add sort after relevance
    data_stmt = data_stmt.order_by(relevance.desc())

    products = db.scalars(data_stmt).all()

    items = [_enrich_summary(p, placeholder) for p in products]

    return PaginatedProductsOut(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


def search_suggestions(
    db: Session,
    q: str,
    limit: int = 8,
) -> list[SearchSuggestionOut]:
    """Get search suggestions (product name autocomplete)."""
    if not q.strip():
        return []

    search_term = q.strip()
    placeholder = _placeholder_url()

    stmt = (
        select(
            Product.id,
            Product.slug,
            Product.name,
            Product.price,
            ProductImage.image_url,
        )
        .outerjoin(ProductImage, ProductImage.product_id == Product.id)
        .where(
            Product.is_active.is_(True),
            or_(
                func.to_tsvector(text("'simple'::regconfig"), Product.name).op("@@")(
                    func.websearch_to_tsquery(text("'simple'::regconfig"), search_term)
                ),
                func.similarity(Product.name, search_term) > 0.15,
            ),
        )
        .order_by(
            func.similarity(Product.name, search_term).desc(),
            Product.id,
        )
        .limit(limit)
    )

    rows = db.execute(stmt).all()
    results: list[SearchSuggestionOut] = []
    seen: set[int] = set()
    for row in rows:
        pid = row.id
        if pid in seen:
            continue
        seen.add(pid)
        img_url = row.image_url if _is_valid_image_url(row.image_url) else None
        results.append(
            SearchSuggestionOut(
                id=pid,
                slug=row.slug,
                name=row.name,
                price=row.price,
                cover_image_url=img_url or placeholder,
            )
        )
    return results


def get_categories(db: Session) -> list[CategoryOut]:
    """Return all categories sorted by sort_order."""
    return [
        CategoryOut(
            id=c.id,
            slug=c.slug,
            name=c.name,
            sort_order=c.sort_order,
        )
        for c in db.execute(select(Category).order_by(Category.sort_order, Category.id))
        .scalars()
        .all()
    ]


def get_types_by_category(
    db: Session, category_slug: str | None = None
) -> list[ProductTypeOut]:
    """Return product types, optionally filtered by category."""
    stmt = (
        select(ProductType)
        .join(ProductType.category)
        .order_by(Category.name, ProductType.name)
    )
    if category_slug:
        stmt = stmt.where(Category.slug == category_slug)
    return [
        ProductTypeOut(
            id=t.id,
            category_id=t.category_id,
            slug=t.slug,
            name=t.name,
        )
        for t in db.scalars(stmt).all()
    ]


def get_manufacturers(db: Session) -> list[ManufacturerOut]:
    """Return all manufacturers."""
    return [
        ManufacturerOut(
            id=m.id,
            slug=m.slug,
            name=m.name,
        )
        for m in db.execute(select(Manufacturer).order_by(Manufacturer.name))
        .scalars()
        .all()
    ]


def get_filter_options(
    db: Session,
    categories: Sequence[str] | None = None,
    types: Sequence[str] | None = None,
    manufacturers: Sequence[str] | None = None,
    colors: Sequence[str] | None = None,
) -> FilterOptionsOut:
    """Get available filter values for the current filtered product set."""
    base_stmt = (
        select(Product)
        .join(Product.product_type)
        .join(Category, ProductType.category)
        .join(Manufacturer)
        .where(Product.is_active.is_(True))
    )

    # Get products after filtering
    filtered = base_stmt
    if categories:
        filtered = filtered.where(Category.slug.in_(categories))
    if types:
        filtered = filtered.where(ProductType.slug.in_(types))
    if manufacturers:
        filtered = filtered.where(Manufacturer.slug.in_(manufacturers))

    product_ids_stmt = select(Product.id).select_from(base_stmt.subquery())
    if categories:
        product_ids_stmt = product_ids_stmt.where(Category.slug.in_(categories))
    if types:
        product_ids_stmt = product_ids_stmt.where(ProductType.slug.in_(types))
    if manufacturers:
        product_ids_stmt = product_ids_stmt.where(Manufacturer.slug.in_(manufacturers))

    product_ids_result = db.execute(product_ids_stmt).scalars().all()

    # Available colors from filtered products
    colors_stmt = (
        select(Product.color)
        .distinct()
        .where(
            Product.id.in_(product_ids_result),
            Product.color.isnot(None),
        )
    )
    available_colors = [c for c in db.scalars(colors_stmt).all() if c]

    # Available categories (all)
    all_categories = [
        CategoryOut(
            id=c.id,
            slug=c.slug,
            name=c.name,
            sort_order=c.sort_order,
        )
        for c in db.execute(select(Category).order_by(Category.sort_order, Category.id))
        .scalars()
        .all()
    ]

    # Available types (filtered)
    types_stmt = (
        select(ProductType)
        .join(ProductType.category)
        .where(
            ProductType.id.in_(
                select(ProductType.id)
                .join(Product)
                .where(Product.id.in_(product_ids_result))
            )
        )
        .order_by(Category.name, ProductType.name)
    )
    available_types = [
        ProductTypeOut(
            id=t.id,
            category_id=t.category_id,
            slug=t.slug,
            name=t.name,
        )
        for t in db.scalars(types_stmt).all()
    ]

    # Available manufacturers (filtered)
    manuf_stmt = (
        select(Manufacturer)
        .join(Manufacturer.products)
        .where(Product.id.in_(product_ids_result))
        .order_by(Manufacturer.name)
    )
    available_manufacturers = [
        ManufacturerOut(
            id=m.id,
            slug=m.slug,
            name=m.name,
        )
        for m in db.scalars(manuf_stmt).all()
    ]

    return FilterOptionsOut(
        categories=all_categories,
        types=available_types,
        colors=sorted(available_colors),
        manufacturers=available_manufacturers,
    )


# Re-export for imports in other modules
from app.schemas.catalog import (
    CategoryOut,
    FilterOptionsOut,
    ManufacturerOut,
    PaginatedProductsOut,
    ProductDetailOut,
    ProductImageOut,
    ProductSummaryOut,
    ProductTypeOut,
    SearchSuggestionOut,
)
