"""Read-only catalog routes preserving the frontend's query parameter contract."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.catalog import (
    CategoryOut,
    FilterOptionsOut,
    ManufacturerOut,
    PaginatedProductsOut,
    ProductDetailOut,
    ProductTypeOut,
    SearchSuggestionOut,
)
from app.services import catalog as svc

router = APIRouter(prefix="/api/v1", tags=["catalog"])

# Group presets are navigation filters, not synthetic product categories.
CATEGORY_GROUPS = {
    "components": (
        "gpu",
        "cpu",
        "mobo",
        "ram",
        "storage",
        "hdd",
        "case",
        "psu",
        "cooling",
    ),
    "peripheral": ("peripheral", "monitor"),
}
SORT = "^(newest|oldest|rating_high|rating_low|price_asc|price_desc)$"


def _list(value: str | None) -> list[str] | None:
    return (
        list(dict.fromkeys(s.strip() for s in value.split(",") if s.strip()))
        if value
        else None
    )


def _categories(category: str | None, categories: str | None) -> list[str] | None:
    if categories:
        return _list(categories)
    if category:
        return list(CATEGORY_GROUPS.get(category, (category,)))
    return None


@router.get("/products/filters", response_model=FilterOptionsOut)
def get_filter_options(
    category: str | None = None,
    categories: str | None = None,
    types: str | None = None,
    manufacturers: str | None = None,
    colors: str | None = None,
    db: Session = Depends(get_db_session, scope="function"),
) -> FilterOptionsOut:
    return svc.get_filter_options(
        db,
        _categories(category, categories),
        _list(types),
        _list(manufacturers),
        _list(colors),
    )


@router.get("/products/search/suggestions", response_model=list[SearchSuggestionOut])
def search_suggestions(
    q: str = Query(min_length=1, max_length=120),
    limit: int = Query(default=8, ge=1, le=20),
    db: Session = Depends(get_db_session, scope="function"),
) -> list[SearchSuggestionOut]:
    return svc.search_suggestions(db, q, limit)


@router.get("/products", response_model=PaginatedProductsOut)
def list_products(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=49, ge=1, le=49),
    q: str | None = Query(default=None, max_length=120),
    category: str | None = None,
    categories: str | None = None,
    types: str | None = None,
    manufacturers: str | None = None,
    colors: str | None = None,
    sale: bool = False,
    sort: str = Query(default="newest", pattern=SORT),
    db: Session = Depends(get_db_session, scope="function"),
) -> PaginatedProductsOut:
    sale_only = sale or category == "sale"
    cat = (
        None
        if category == "sale" and not categories
        else _categories(category, categories)
    )
    return svc.list_products(
        db,
        page,
        page_size,
        cat,
        _list(types),
        _list(manufacturers),
        _list(colors),
        sale_only,
        sort,
        q,
    )


@router.get("/products/{slug}", response_model=ProductDetailOut)
def get_product(
    slug: str,
    db: Session = Depends(get_db_session, scope="function"),
) -> ProductDetailOut:
    value = svc.get_product_by_slug(db, slug)
    if value is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return value


@router.get("/products/{product_id}/images")
def get_product_images(
    product_id: int,
    db: Session = Depends(get_db_session, scope="function"),
) -> dict:
    from app.models import Product

    product = db.get(Product, product_id)
    if product is None or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")
    images, cover = svc._images(product)
    return {
        "product_id": product_id,
        "cover_image_url": cover,
        "images": [x.model_dump() for x in images],
    }


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(
    db: Session = Depends(get_db_session, scope="function"),
) -> list[CategoryOut]:
    return svc.get_categories(db)


@router.get("/categories/{category_slug}/types", response_model=list[ProductTypeOut])
def list_types(
    category_slug: str,
    db: Session = Depends(get_db_session, scope="function"),
) -> list[ProductTypeOut]:
    return svc.get_types_by_category(db, category_slug)


@router.get("/manufacturers", response_model=list[ManufacturerOut])
def list_manufacturers(
    db: Session = Depends(get_db_session, scope="function"),
) -> list[ManufacturerOut]:
    return svc.get_manufacturers(db)
