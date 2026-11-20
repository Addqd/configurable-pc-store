"""`/api/v1/admin/products` — catalog administration, specs and images."""

from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.api.deps import AdminUserDep, DBSessionDep
from app.schemas.admin_products import (
    AdminImageOrderRequest,
    AdminPaginatedProductsOut,
    AdminProductCreate,
    AdminProductDetailOut,
    AdminProductImageOut,
    AdminProductUpdate,
    ProductFormOptionsOut,
    ProductSort,
    ProductStatusFilter,
    SpecificationTemplateOut,
)
from app.services import product_admin_service as products_svc
from app.services import product_image_service as images_svc

router = APIRouter(tags=["admin: products"])


@router.get("/products", response_model=AdminPaginatedProductsOut)
def list_products(
    db: DBSessionDep,
    admin: AdminUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: Annotated[str | None, Query(max_length=64)] = None,
    product_type: Annotated[str | None, Query(max_length=80)] = None,
    manufacturer: Annotated[str | None, Query(max_length=120)] = None,
    status_filter: Annotated[ProductStatusFilter, Query(alias="status")] = "all",
    sort: ProductSort = "created_desc",
) -> AdminPaginatedProductsOut:
    return products_svc.list_products(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category=category,
        product_type=product_type,
        manufacturer=manufacturer,
        status=status_filter,
        sort=sort,
    )


@router.post(
    "/products",
    response_model=AdminProductDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    body: AdminProductCreate, db: DBSessionDep, admin: AdminUserDep
) -> AdminProductDetailOut:
    return products_svc.create_product(db, admin, body)


@router.get("/product-options", response_model=ProductFormOptionsOut)
def get_product_options(db: DBSessionDep, admin: AdminUserDep) -> ProductFormOptionsOut:
    return products_svc.form_options(db)


@router.get(
    "/product-types/{product_type_id}/spec-fields",
    response_model=SpecificationTemplateOut,
)
def get_spec_template(
    product_type_id: int, db: DBSessionDep, admin: AdminUserDep
) -> SpecificationTemplateOut:
    return products_svc.spec_template(db, product_type_id)


@router.get("/products/{product_id}", response_model=AdminProductDetailOut)
def get_product(
    product_id: int, db: DBSessionDep, admin: AdminUserDep
) -> AdminProductDetailOut:
    return products_svc.get_product_detail(db, product_id)


@router.patch("/products/{product_id}", response_model=AdminProductDetailOut)
def update_product(
    product_id: int,
    body: AdminProductUpdate,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> AdminProductDetailOut:
    return products_svc.update_product(db, admin, product_id, body)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_product(product_id: int, db: DBSessionDep, admin: AdminUserDep) -> None:
    """Soft delete: the product becomes inactive, history is preserved."""
    products_svc.deactivate_product(db, admin, product_id)


@router.get("/products/{product_id}/images", response_model=list[AdminProductImageOut])
def list_images(
    product_id: int, db: DBSessionDep, admin: AdminUserDep
) -> list[AdminProductImageOut]:
    product = products_svc.load_product(db, product_id)
    return images_svc.list_images(product)


@router.post(
    "/products/{product_id}/images",
    response_model=AdminProductImageOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_image(
    product_id: int,
    db: DBSessionDep,
    admin: AdminUserDep,
    file: Annotated[UploadFile, File()],
    alt_text: Annotated[str | None, Form(max_length=255)] = None,
) -> AdminProductImageOut:
    product = products_svc.load_product(db, product_id)
    return images_svc.save_upload(db, admin, product, file, alt_text)


@router.delete(
    "/products/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_image(
    product_id: int,
    image_id: int,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> None:
    product = products_svc.load_product(db, product_id)
    images_svc.delete_image(db, admin, product, image_id)


@router.put(
    "/products/{product_id}/images/order",
    response_model=list[AdminProductImageOut],
)
def reorder_images(
    product_id: int,
    body: AdminImageOrderRequest,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> list[AdminProductImageOut]:
    product = products_svc.load_product(db, product_id)
    return images_svc.reorder_images(db, admin, product, body.image_ids)
