"""Catalog API: products, categories, types, manufacturers, search, images."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.catalog import (
    FilterOptionsOut,
    PaginatedProductsOut,
    ProductDetailOut,
    SearchSuggestionOut,
)
from app.services import catalog as catalog_svc

router = APIRouter(prefix="/api/v1", tags=["catalog"])


# ── Filter Options (must be before /products/{slug} routes) ──────────────────


@router.get(
    "/products/filters",
    response_model=FilterOptionsOut,
    summary="Available filter options",
)
def get_filter_options(
    categories: str | None = Query(None),
    types: str | None = Query(None),
    manufacturers: str | None = Query(None),
    db: Session = Depends(get_db_session),
) -> FilterOptionsOut:
    """Get available filter values (colors, types, manufacturers) based on current filters."""
    cat_list = (
        [c.strip() for c in categories.split(",") if c.strip()] if categories else None
    )
    type_list = [t.strip() for t in types.split(",") if t.strip()] if types else None
    manuf_list = (
        [m.strip() for m in manufacturers.split(",") if m.strip()]
        if manufacturers
        else None
    )

    return catalog_svc.get_filter_options(db, cat_list, type_list, manuf_list)


# ── Search Suggestions (must be before /products/{slug}) ─────────────────────


@router.get(
    "/products/search/suggestions",
    response_model=list[SearchSuggestionOut],
    summary="Search suggestions",
)
def search_suggestions(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(8, ge=1, le=20, description="Max suggestions"),
    db: Session = Depends(get_db_session),
) -> list[SearchSuggestionOut]:
    """Get autocomplete suggestions for product search."""
    return catalog_svc.search_suggestions(db, q, limit)


# ── Product List ─────────────────────────────────────────────────────────────


@router.get(
    "/products",
    response_model=PaginatedProductsOut,
    summary="List products",
)
def list_products(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(49, ge=1, le=100, description="Items per page"),
    q: str | None = Query(None, description="Search query"),
    categories: str | None = Query(None, description="Comma-separated category slugs"),
    types: str | None = Query(None, description="Comma-separated type slugs"),
    manufacturers: str | None = Query(
        None, description="Comma-separated manufacturer slugs"
    ),
    colors: str | None = Query(None, description="Comma-separated colors"),
    sale: bool = Query(False, description="Show only sale items"),
    sort: str = Query(
        "newest",
        pattern="^(newest|oldest|rating_high|rating_low|price_asc|price_desc)$",
        description="Sort order",
    ),
    db: Session = Depends(get_db_session),
) -> PaginatedProductsOut:
    """List products with pagination, filters, and sorting."""
    cat_list = (
        [c.strip() for c in categories.split(",") if c.strip()] if categories else None
    )
    type_list = [t.strip() for t in types.split(",") if t.strip()] if types else None
    manuf_list = (
        [m.strip() for m in manufacturers.split(",") if m.strip()]
        if manufacturers
        else None
    )
    color_list = [c.strip() for c in colors.split(",") if c.strip()] if colors else None

    if q:
        return catalog_svc.search_products(
            db,
            q,
            page,
            page_size,
            cat_list,
            type_list,
            manuf_list,
            color_list,
            sale,
            sort,
        )
    return catalog_svc.list_products(
        db,
        page,
        page_size,
        cat_list,
        type_list,
        manuf_list,
        color_list,
        sale,
        sort,
    )


# ── Product Detail ───────────────────────────────────────────────────────────


@router.get(
    "/products/{slug}",
    response_model=ProductDetailOut,
    summary="Get product by slug",
)
def get_product(
    slug: str,
    db: Session = Depends(get_db_session),
) -> ProductDetailOut:
    """Get detailed product information by slug."""
    product = catalog_svc.get_product_by_slug(db, slug)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )
    return product


@router.get(
    "/products/{product_id}/images",
    summary="Get product images",
)
def get_product_images(
    product_id: int,
    db: Session = Depends(get_db_session),
):
    """Return image list for a product (raw for frontend flexibility)."""

    from app.models import Product

    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Product not found"
        )

    images = [
        pi.image_url
        for pi in product.images
        if catalog_svc._is_valid_image_url(pi.image_url)
    ]
    images.sort(
        key=lambda url: (
            next((pi.sort_order for pi in product.images if pi.image_url == url), 0),
            next((pi.id for pi in product.images if pi.image_url == url), 0),
        )
    )

    return {"product_id": product_id, "images": images}


# ── Categories / Types / Manufacturers ───────────────────────────────────────


@router.get(
    "/categories",
    response_model=list[dict],
    summary="List categories",
)
def list_categories(
    db: Session = Depends(get_db_session),
) -> list[dict]:
    """Return all product categories."""
    return [
        {
            "id": c.id,
            "slug": c.slug,
            "name": c.name,
            "sort_order": c.sort_order,
        }
        for c in catalog_svc.get_categories(db)
    ]


@router.get(
    "/categories/{category_slug}/types",
    summary="List product types for a category",
)
def list_types(
    category_slug: str,
    db: Session = Depends(get_db_session),
):
    """Return product types for a specific category."""
    types = catalog_svc.get_types_by_category(db, category_slug)
    return [
        {
            "id": t.id,
            "slug": t.slug,
            "name": t.name,
            "category_id": t.category_id,
        }
        for t in types
    ]


@router.get(
    "/manufacturers",
    summary="List manufacturers",
)
def list_manufacturers(
    db: Session = Depends(get_db_session),
):
    """Return all manufacturers."""
    return [
        {
            "id": m.id,
            "slug": m.slug,
            "name": m.name,
        }
        for m in catalog_svc.get_manufacturers(db)
    ]
