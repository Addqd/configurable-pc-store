"""PostgreSQL catalog queries, independent per-product images and review counts."""

from __future__ import annotations

from collections.abc import Sequence
from urllib.parse import urlsplit

from sqlalchemy import func, literal, or_, select, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Category, Manufacturer, Product, ProductType, Review
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

PLACEHOLDER_URL = "/api/v1/assets/product-placeholder.jpg"


def _is_valid_image_url(url: str | None) -> bool:
    if not isinstance(url, str) or not url or url != url.strip():
        return False
    if any(ord(char) < 33 for char in url):
        return False
    if url.startswith("/") and not url.startswith("//"):
        return True
    try:
        parsed = urlsplit(url)
        return (
            parsed.scheme in ("http", "https")
            and bool(parsed.netloc)
            and bool(parsed.hostname)
        )
    except ValueError:
        return False


def _images(product: Product) -> tuple[list[ProductImageOut], str]:
    rows = sorted(
        (x for x in product.images if _is_valid_image_url(x.image_url)),
        key=lambda x: (x.sort_order, x.id),
    )
    values = [
        ProductImageOut(url=x.image_url, alt_text=x.alt_text, sort_order=x.sort_order)
        for x in rows
    ]
    return values, rows[0].image_url if rows else PLACEHOLDER_URL


def _base_stmt():
    return (
        select(Product)
        .join(Product.product_type)
        .join(Category, ProductType.category_id == Category.id)
        .join(Manufacturer, Product.manufacturer_id == Manufacturer.id)
        .where(Product.is_active.is_(True))
    )


def _apply_filters(
    stmt, categories=None, types=None, manufacturers=None, colors=None, sale_only=False
):
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


def _search_expressions(q: str):
    # This text-vector expression matches the initial migration's GIN index.
    document = func.to_tsvector(
        text("'simple'::regconfig"), Product.name + literal(" ") + Product.description
    )
    query = func.websearch_to_tsquery(text("'simple'::regconfig"), q)
    relevance = func.ts_rank(document, query) + 2 * func.similarity(Product.name, q)
    predicate = or_(document.op("@@")(query), func.similarity(Product.name, q) > 0.1)
    return predicate, relevance


def _ratings(db: Session, ids: list[int]) -> dict[int, tuple[float, int]]:
    if not ids:
        return {}
    rows = db.execute(
        select(Review.product_id, func.avg(Review.rating), func.count(Review.id))
        .where(Review.product_id.in_(ids))
        .group_by(Review.product_id)
    ).all()
    return {pid: (round(float(avg), 2), count) for pid, avg, count in rows}


def _serialize_category(category: Category) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        slug=category.slug,
        name=category.name,
        sort_order=category.sort_order,
    )


def _serialize_type(ptype: ProductType) -> ProductTypeOut:
    return ProductTypeOut(
        id=ptype.id, category_id=ptype.category_id, slug=ptype.slug, name=ptype.name
    )


def _serialize_manufacturer(m: Manufacturer) -> ManufacturerOut:
    return ManufacturerOut(id=m.id, slug=m.slug, name=m.name)


def _summary(product: Product, rating: tuple[float, int]) -> ProductSummaryOut:
    images, cover = _images(product)
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
        images=images,
        average_rating=rating[0],
        review_count=rating[1],
        category=_serialize_category(product.product_type.category),
        product_type=_serialize_type(product.product_type),
        manufacturer=_serialize_manufacturer(product.manufacturer),
    )


def _detail(product: Product, rating: tuple[float, int]) -> ProductDetailOut:
    images, cover = _images(product)
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
        category=_serialize_category(product.product_type.category),
        product_type=_serialize_type(product.product_type),
        manufacturer=_serialize_manufacturer(product.manufacturer),
        cover_image_url=cover,
        images=images,
        average_rating=rating[0],
        review_count=rating[1],
    )


def _sorted(stmt, sort: str, relevance=None):
    if sort.startswith("rating_"):
        average = (
            select(func.avg(Review.rating))
            .where(Review.product_id == Product.id)
            .correlate(Product)
            .scalar_subquery()
        )
        stmt = stmt.order_by(
            func.coalesce(average, 0).desc()
            if sort == "rating_high"
            else func.coalesce(average, 0).asc()
        )
    elif sort == "price_asc":
        stmt = stmt.order_by(Product.price.asc())
    elif sort == "price_desc":
        stmt = stmt.order_by(Product.price.desc())
    elif sort == "oldest":
        stmt = stmt.order_by(Product.listed_at.asc())
    else:
        if relevance is not None:
            stmt = stmt.order_by(relevance.desc())
        stmt = stmt.order_by(Product.listed_at.desc())
    # Stable order prevents duplicates and lost products across page boundaries.
    return stmt.order_by(Product.id.desc())


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
    q: str | None = None,
) -> PaginatedProductsOut:
    stmt = _apply_filters(
        _base_stmt(), categories, types, manufacturers, colors, sale_only
    )
    relevance = None
    if q and q.strip():
        predicate, relevance = _search_expressions(q.strip())
        stmt = stmt.where(predicate)
    # Count from the filtered product-id query, NOT a count over an aggregate count.
    total = (
        db.scalar(
            select(func.count()).select_from(
                stmt.with_only_columns(Product.id).order_by(None).subquery()
            )
        )
        or 0
    )
    stmt = _sorted(stmt, sort, relevance)
    products = list(
        db.scalars(
            stmt.options(
                joinedload(Product.product_type).joinedload(ProductType.category),
                joinedload(Product.manufacturer),
                selectinload(Product.images),
            )
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    ratings = _ratings(db, [p.id for p in products])
    return PaginatedProductsOut(
        items=[_summary(p, ratings.get(p.id, (0.0, 0))) for p in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


def get_product_by_slug(db: Session, slug: str) -> ProductDetailOut | None:
    product = db.scalar(
        _base_stmt()
        .options(
            joinedload(Product.product_type).joinedload(ProductType.category),
            joinedload(Product.manufacturer),
            selectinload(Product.images),
        )
        .where(Product.slug == slug)
    )
    if product is None:
        return None
    return _detail(product, _ratings(db, [product.id]).get(product.id, (0.0, 0)))


def search_products(
    db: Session,
    q: str,
    page: int = 1,
    page_size: int = 49,
    categories=None,
    types=None,
    manufacturers=None,
    colors=None,
    sale_only=False,
    sort="newest",
) -> PaginatedProductsOut:
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
        q,
    )


def search_suggestions(
    db: Session, q: str, limit: int = 8
) -> list[SearchSuggestionOut]:
    if not q.strip():
        return []
    predicate, relevance = _search_expressions(q.strip())
    products = list(
        db.scalars(
            _base_stmt()
            .where(predicate)
            .options(
                selectinload(Product.images),
            )
            .order_by(relevance.desc(), Product.id.desc())
            .limit(limit)
        ).all()
    )
    return [
        SearchSuggestionOut(
            id=p.id,
            slug=p.slug,
            name=p.name,
            price=p.price,
            cover_image_url=_images(p)[1],
        )
        for p in products
    ]


def get_categories(db: Session) -> list[CategoryOut]:
    return [
        _serialize_category(c)
        for c in db.scalars(
            select(Category).order_by(Category.sort_order, Category.id)
        ).all()
    ]


def get_types_by_category(
    db: Session, category_slug: str | None = None
) -> list[ProductTypeOut]:
    stmt = (
        select(ProductType)
        .join(ProductType.category)
        .order_by(Category.name, ProductType.name)
    )
    if category_slug:
        stmt = stmt.where(Category.slug == category_slug)
    return [_serialize_type(ptype) for ptype in db.scalars(stmt).all()]


def get_manufacturers(db: Session) -> list[ManufacturerOut]:
    return [
        _serialize_manufacturer(m)
        for m in db.scalars(select(Manufacturer).order_by(Manufacturer.name)).all()
    ]


def get_filter_options(
    db: Session, categories=None, types=None, manufacturers=None, colors=None
) -> FilterOptionsOut:
    filtered = _apply_filters(_base_stmt(), categories, types, manufacturers, colors)
    ids = filtered.with_only_columns(Product.id).order_by(None).subquery()
    available_colors = list(
        db.scalars(
            select(Product.color)
            .where(Product.id.in_(select(ids.c.id)), Product.color.is_not(None))
            .distinct()
            .order_by(Product.color)
        ).all()
    )
    available_types = list(
        db.scalars(
            select(ProductType)
            .where(
                ProductType.id.in_(
                    select(Product.product_type_id).where(
                        Product.id.in_(select(ids.c.id))
                    )
                )
            )
            .order_by(ProductType.name)
        ).all()
    )
    available_manufacturers = list(
        db.scalars(
            select(Manufacturer)
            .where(
                Manufacturer.id.in_(
                    select(Product.manufacturer_id).where(
                        Product.id.in_(select(ids.c.id))
                    )
                )
            )
            .order_by(Manufacturer.name)
        ).all()
    )
    return FilterOptionsOut(
        categories=get_categories(db),
        types=[_serialize_type(t) for t in available_types],
        colors=[c for c in available_colors if c],
        manufacturers=[_serialize_manufacturer(m) for m in available_manufacturers],
    )
