"""Product administration: validated CRUD, automatic SKU/slug, spec templates."""

from __future__ import annotations

import re
import secrets
from datetime import date
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import Category, Manufacturer, Product, ProductType, Review, User
from app.schemas.admin_products import (
    AdminPaginatedProductsOut,
    AdminProductCreate,
    AdminProductDetailOut,
    AdminProductImageOut,
    AdminProductSummaryOut,
    AdminProductUpdate,
    ProductFormOptionsOut,
    ProductSpecFieldOut,
    ProductSpecOptionOut,
    ProductTypeWithCategoryOut,
    SpecificationTemplateOut,
)
from app.schemas.catalog import (
    CategoryOut,
    ManufacturerOut,
    ProductTypeOut,
)
from app.services import catalog as catalog_service
from app.services import event_service, spec_service
from app.services.errors import ConflictError, InvalidInputError, NotFoundError
from app.services.sql_utils import like_pattern

_NON_ALNUM = re.compile(r"[^A-Za-z0-9]+")

_TRANSLIT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
}

ORDER_BY: dict[str, tuple[Any, ...]] = {
    "created_desc": (Product.created_at.desc(), Product.id.desc()),
    "created_asc": (Product.created_at.asc(), Product.id.asc()),
    "updated_desc": (Product.updated_at.desc(), Product.id.desc()),
    "updated_asc": (Product.updated_at.asc(), Product.id.asc()),
    "name_asc": (func.lower(Product.name).asc(), Product.id.asc()),
    "name_desc": (func.lower(Product.name).desc(), Product.id.desc()),
    "price_asc": (Product.price.asc(), Product.id.asc()),
    "price_desc": (Product.price.desc(), Product.id.desc()),
    "stock_asc": (Product.stock_quantity.asc(), Product.id.asc()),
    "stock_desc": (Product.stock_quantity.desc(), Product.id.desc()),
    "id_asc": (Product.id.asc(),),
    "id_desc": (Product.id.desc(),),
}
DEFAULT_SORT = "created_desc"


def _category_out(category: Category) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        slug=category.slug,
        name=category.name,
        sort_order=category.sort_order,
    )


def _type_out(product_type: ProductType) -> ProductTypeOut:
    return ProductTypeOut(
        id=product_type.id,
        category_id=product_type.category_id,
        slug=product_type.slug,
        name=product_type.name,
    )


def _manufacturer_out(manufacturer: Manufacturer) -> ManufacturerOut:
    return ManufacturerOut(
        id=manufacturer.id, slug=manufacturer.slug, name=manufacturer.name
    )


def _sorted_images(product: Product) -> list[AdminProductImageOut]:
    rows = sorted(product.images, key=lambda image: (image.sort_order, image.id))
    return [
        AdminProductImageOut(
            id=row.id,
            url=row.image_url,
            alt_text=row.alt_text,
            sort_order=row.sort_order,
            is_cover=index == 0,
        )
        for index, row in enumerate(rows)
    ]


def _cover_url(product: Product) -> str:
    return catalog_service._images(product)[1]


def _summary(product: Product) -> AdminProductSummaryOut:
    return AdminProductSummaryOut(
        id=product.id,
        slug=product.slug,
        sku=product.sku,
        name=product.name,
        price=product.price,
        stock_quantity=product.stock_quantity,
        is_active=product.is_active,
        on_sale=product.on_sale,
        category=_category_out(product.product_type.category),
        product_type=_type_out(product.product_type),
        manufacturer=_manufacturer_out(product.manufacturer),
        cover_image_url=_cover_url(product),
        image_count=len(product.images),
        listed_at=product.listed_at,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def _detail(db: Session, product: Product) -> AdminProductDetailOut:
    average, count = db.execute(
        select(func.avg(Review.rating), func.count(Review.id)).where(
            Review.product_id == product.id, Review.is_published.is_(True)
        )
    ).one()
    fields, _ = spec_service.template_fields(db, product.product_type_id)
    return AdminProductDetailOut(
        id=product.id,
        slug=product.slug,
        sku=product.sku,
        name=product.name,
        description=product.description,
        price=product.price,
        stock_quantity=product.stock_quantity,
        color=product.color,
        graphics_chip_brand=product.graphics_chip_brand,
        spec_lines=product.spec_lines or [],
        short_specs=product.short_specs or [],
        technical_specs=product.technical_specs or {},
        display_specs=catalog_service.serialize_display_specs(product.display_specs),
        specifications=spec_service.specifications_view(
            product.technical_specs, fields
        ),
        on_sale=product.on_sale,
        is_active=product.is_active,
        listed_at=product.listed_at,
        created_at=product.created_at,
        updated_at=product.updated_at,
        category=_category_out(product.product_type.category),
        product_type=_type_out(product.product_type),
        manufacturer=_manufacturer_out(product.manufacturer),
        images=_sorted_images(product),
        cover_image_url=_cover_url(product),
        average_rating=round(float(average), 2) if average is not None else 0.0,
        review_count=int(count or 0),
    )


def load_product(db: Session, product_id: int) -> Product:
    product = db.scalar(
        select(Product)
        .where(Product.id == product_id)
        .options(
            selectinload(Product.images),
            selectinload(Product.product_type).selectinload(ProductType.category),
            selectinload(Product.manufacturer),
        )
    )
    if product is None:
        raise NotFoundError("Product not found")
    return product


def _resolve_type(db: Session, product_type_id: int) -> ProductType:
    product_type = db.get(ProductType, product_type_id)
    if product_type is None:
        raise InvalidInputError("Unknown product type")
    return product_type


def _resolve_manufacturer(db: Session, manufacturer_id: int) -> Manufacturer:
    manufacturer = db.get(Manufacturer, manufacturer_id)
    if manufacturer is None:
        raise InvalidInputError("Unknown manufacturer")
    return manufacturer


def slugify(value: str) -> str:
    """Transliterate a display name into a stable, URL-safe slug."""
    lowered = value.strip().lower()
    transliterated = "".join(_TRANSLIT.get(char, char) for char in lowered)
    slug = _NON_ALNUM.sub("-", transliterated).strip("-")
    return slug[:170].strip("-") or "product"


def unique_slug(db: Session, base: str, exclude_id: int | None = None) -> str:
    root = slugify(base)[:160]
    candidate = root
    counter = 2
    while True:
        statement = select(Product.id).where(Product.slug == candidate)
        if exclude_id is not None:
            statement = statement.where(Product.id != exclude_id)
        if db.scalar(statement) is None:
            return candidate
        candidate = f"{root}-{counter}"
        counter += 1


def _type_prefix(value: str, length: int) -> str:
    cleaned = _NON_ALNUM.sub("", value.upper())
    return cleaned[:length] or "PC"


def generate_sku(db: Session, product_type_slug: str, manufacturer_slug: str) -> str:
    base = f"{_type_prefix(product_type_slug, 4)}-{_type_prefix(manufacturer_slug, 3)}"
    for _ in range(12):
        candidate = f"{base}-{secrets.token_hex(3).upper()}"
        if db.scalar(select(Product.id).where(Product.sku == candidate)) is None:
            return candidate
    raise ConflictError("Could not generate a unique SKU")


def _assert_sku_free(db: Session, sku: str, exclude_id: int | None = None) -> None:
    statement = select(Product.id).where(Product.sku == sku)
    if exclude_id is not None:
        statement = statement.where(Product.id != exclude_id)
    if db.scalar(statement) is not None:
        raise ConflictError("SKU already exists")


def _assert_slug_free(db: Session, slug: str, exclude_id: int | None = None) -> None:
    statement = select(Product.id).where(Product.slug == slug)
    if exclude_id is not None:
        statement = statement.where(Product.id != exclude_id)
    if db.scalar(statement) is not None:
        raise ConflictError("Slug already exists")


def _display_specs_payload(
    data: AdminProductCreate | AdminProductUpdate,
) -> list[dict[str, str]] | None:
    specs = getattr(data, "display_specs", None)
    if specs is None:
        return None
    return [{"label": spec.label, "value": spec.value} for spec in specs]


def list_products(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    category: str | None = None,
    product_type: str | None = None,
    manufacturer: str | None = None,
    status: str = "all",
    sort: str = DEFAULT_SORT,
) -> AdminPaginatedProductsOut:
    statement = select(Product.id)
    if q and q.strip():
        pattern = like_pattern(q)
        statement = statement.where(
            or_(
                Product.name.ilike(pattern, escape="\\"),
                Product.sku.ilike(pattern, escape="\\"),
                Product.slug.ilike(pattern, escape="\\"),
            )
        )
    if category or product_type or manufacturer:
        statement = statement.join(Product.product_type).join(ProductType.category)
        if category:
            statement = statement.where(Category.slug == category)
        if product_type:
            statement = statement.where(ProductType.slug == product_type)
        if manufacturer:
            statement = statement.join(Product.manufacturer)
            statement = statement.where(Manufacturer.slug == manufacturer)
    if status == "active":
        statement = statement.where(Product.is_active.is_(True))
    elif status == "inactive":
        statement = statement.where(Product.is_active.is_(False))

    total = int(db.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    order_by = ORDER_BY.get(sort, ORDER_BY[DEFAULT_SORT])
    ids = list(
        db.scalars(
            statement.order_by(*order_by)
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    products: dict[int, Product] = {}
    if ids:
        rows = db.scalars(
            select(Product)
            .where(Product.id.in_(ids))
            .options(
                selectinload(Product.images),
                selectinload(Product.product_type).selectinload(ProductType.category),
                selectinload(Product.manufacturer),
            )
        ).all()
        products = {product.id: product for product in rows}
    return AdminPaginatedProductsOut(
        items=[_summary(products[pid]) for pid in ids if pid in products],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


def get_product_detail(db: Session, product_id: int) -> AdminProductDetailOut:
    return _detail(db, load_product(db, product_id))


def create_product(
    db: Session, actor: User, data: AdminProductCreate
) -> AdminProductDetailOut:
    product_type = _resolve_type(db, data.product_type_id)
    manufacturer = _resolve_manufacturer(db, data.manufacturer_id)
    technical = spec_service.validate_specifications(
        db,
        product_type.id,
        submitted=data.specifications,
        technical_specs=data.technical_specs,
        base=data.technical_specs,
    )
    sku = data.sku or generate_sku(db, product_type.slug, manufacturer.slug)
    if data.sku:
        _assert_sku_free(db, sku)
    slug = data.slug or unique_slug(db, data.name)
    if data.slug:
        _assert_slug_free(db, slug)

    product = Product(
        product_type_id=product_type.id,
        manufacturer_id=manufacturer.id,
        slug=slug,
        sku=sku,
        name=data.name,
        description=data.description,
        price=data.price,
        stock_quantity=data.stock_quantity,
        color=data.color,
        graphics_chip_brand=data.graphics_chip_brand,
        spec_lines=data.spec_lines,
        short_specs=data.short_specs,
        technical_specs=technical,
        display_specs=_display_specs_payload(data) or [],
        on_sale=data.on_sale,
        is_active=data.is_active,
        listed_at=data.listed_at or date.today(),
    )
    db.add(product)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        event_service.record_failure(
            db,
            category=event_service.CATEGORY_CATALOG,
            event_type="catalog.product_created",
            actor=actor,
            reason="SKU or slug conflict",
            details={"name": data.name},
        )
        raise ConflictError("SKU or slug already exists") from None
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_created",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"name": product.name, "sku": product.sku, "slug": product.slug},
    )
    db.refresh(product)
    return _detail(db, load_product(db, product.id))


def update_product(
    db: Session, actor: User, product_id: int, data: AdminProductUpdate
) -> AdminProductDetailOut:
    product = load_product(db, product_id)
    provided = data.model_fields_set
    changed: list[str] = []

    if "product_type_id" in provided and data.product_type_id is not None:
        product_type = _resolve_type(db, data.product_type_id)
        if product_type.id != product.product_type_id:
            product.product_type_id = product_type.id
            changed.append("product_type_id")
    if "manufacturer_id" in provided and data.manufacturer_id is not None:
        manufacturer = _resolve_manufacturer(db, data.manufacturer_id)
        if manufacturer.id != product.manufacturer_id:
            product.manufacturer_id = manufacturer.id
            changed.append("manufacturer_id")
    if "name" in provided and data.name is not None and data.name != product.name:
        product.name = data.name
        changed.append("name")
    if (
        "description" in provided
        and data.description is not None
        and data.description != product.description
    ):
        product.description = data.description
        changed.append("description")
    if "price" in provided and data.price is not None and data.price != product.price:
        product.price = data.price
        changed.append("price")
    if (
        "stock_quantity" in provided
        and data.stock_quantity is not None
        and data.stock_quantity != product.stock_quantity
    ):
        product.stock_quantity = data.stock_quantity
        changed.append("stock_quantity")
    for field in ("color", "graphics_chip_brand"):
        if field in provided and getattr(data, field) != getattr(product, field):
            setattr(product, field, getattr(data, field))
            changed.append(field)
    for field in ("spec_lines", "short_specs", "on_sale", "is_active", "listed_at"):
        if field not in provided:
            continue
        value = getattr(data, field)
        if value is None:
            continue
        if value != getattr(product, field):
            setattr(product, field, value)
            changed.append(field)
    if "sku" in provided:
        sku = data.sku
        if sku != product.sku:
            if sku is not None:
                _assert_sku_free(db, sku, exclude_id=product.id)
            product.sku = sku
            changed.append("sku")
    if "slug" in provided and data.slug is not None and data.slug != product.slug:
        _assert_slug_free(db, data.slug, exclude_id=product.id)
        product.slug = data.slug
        changed.append("slug")
    if "display_specs" in provided and data.display_specs is not None:
        payload = _display_specs_payload(data) or []
        if payload != (product.display_specs or []):
            product.display_specs = payload
            changed.append("display_specs")

    specs_touched = any(
        field in provided
        for field in ("specifications", "technical_specs", "product_type_id")
    )
    if specs_touched:
        # A supplied `technical_specs` replaces the stored value, so it becomes the
        # merge base as well; template codes inside it are validated regardless.
        replacement = data.technical_specs if "technical_specs" in provided else None
        merged = spec_service.validate_specifications(
            db,
            product.product_type_id,
            submitted=data.specifications if "specifications" in provided else None,
            technical_specs=replacement,
            base=(
                replacement
                if replacement is not None
                else (product.technical_specs or {})
            ),
        )
        if merged != (product.technical_specs or {}):
            product.technical_specs = merged
            changed.append("specifications")

    if not changed:
        return _detail(db, product)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        event_service.record_failure(
            db,
            category=event_service.CATEGORY_CATALOG,
            event_type="catalog.product_updated",
            actor=actor,
            target_type="product",
            target_id=product_id,
            reason="SKU or slug conflict",
        )
        raise ConflictError("SKU or slug already exists") from None
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_updated",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"name": product.name, "changed_fields": changed},
    )
    db.refresh(product)
    return _detail(db, load_product(db, product.id))


def deactivate_product(db: Session, actor: User, product_id: int) -> None:
    product = load_product(db, product_id)
    if not product.is_active:
        # Idempotent soft delete: no business change, therefore no duplicate event.
        return
    product.is_active = False
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_deactivated",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"name": product.name, "sku": product.sku},
    )


def form_options(db: Session) -> ProductFormOptionsOut:
    categories = db.scalars(
        select(Category)
        .options(selectinload(Category.product_types))
        .order_by(Category.sort_order, Category.id)
    ).all()
    manufacturers = db.scalars(
        select(Manufacturer).order_by(Manufacturer.name, Manufacturer.id)
    ).all()
    return ProductFormOptionsOut(
        categories=[
            ProductTypeWithCategoryOut(
                category=_category_out(category),
                product_types=[
                    _type_out(product_type)
                    for product_type in sorted(
                        category.product_types, key=lambda item: item.name
                    )
                ],
            )
            for category in categories
        ],
        manufacturers=[_manufacturer_out(item) for item in manufacturers],
    )


def spec_template(db: Session, product_type_id: int) -> SpecificationTemplateOut:
    product_type = _resolve_type(db, product_type_id)
    fields, options = spec_service.template_fields(db, product_type.id)
    return SpecificationTemplateOut(
        product_type_id=product_type.id,
        product_type_name=product_type.name,
        fields=[
            ProductSpecFieldOut(
                id=field.id,
                code=field.code,
                label=field.label,
                sort_order=field.sort_order,
                is_required=field.is_required,
                options=[
                    ProductSpecOptionOut(
                        id=option.id,
                        value=option.value,
                        sort_order=option.sort_order,
                    )
                    for option in options.get(field.id, [])
                ],
            )
            for field in fields
        ],
    )
