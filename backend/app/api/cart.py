"""Private cart, atomic demo checkout, and immutable order history."""

from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models import Cart, Order, Product, SavedBuild, User
from app.schemas.cart import (
    BuyNowRequest,
    CartAddBuildRequest,
    CartAddProductRequest,
    CartOut,
    CartUpdateQuantityRequest,
    CheckoutResponse,
    OrderItemOut,
    OrderOut,
)
from app.services import cart_service as svc
from app.services.catalog import _images

router = APIRouter(prefix="/api/v1/cart", tags=["cart"])


def _cart_to_out(cart: Cart | None, db: Session) -> CartOut:
    if cart is None:
        now = datetime.now(UTC)
        return CartOut(
            id=0,
            items=[],
            subtotal=Decimal("0.00"),
            item_count=0,
            created_at=now,
            updated_at=now,
        )
    items: list[dict] = []
    subtotal = Decimal("0.00")
    count = 0
    for item in cart.items:
        price = Decimal("0.00")
        info = None
        if item.kind == "product" and item.product_id:
            product = db.get(Product, item.product_id)
            if product and product.is_active:
                price = product.price
                info = {
                    "id": product.id,
                    "slug": product.slug,
                    "name": product.name,
                    "category": product.product_type.category.name,
                    "specs": product.spec_lines or [],
                    "price": str(product.price),
                    "cover_image_url": _images(product)[1],
                }
        elif item.kind == "custom_build" and isinstance(item.build_snapshot, dict):
            price = Decimal(str(item.build_snapshot.get("total_price", "0")))
        subtotal += price * item.quantity
        count += item.quantity
        snapshot = item.build_snapshot
        if (
            item.kind == "custom_build"
            and isinstance(snapshot, dict)
            and not snapshot.get("name")
        ):
            build = (
                db.get(SavedBuild, item.saved_build_id) if item.saved_build_id else None
            )
            if build is not None and build.user_id == cart.user_id:
                snapshot = {**snapshot, "name": build.name}
        items.append(
            {
                "id": item.id,
                "kind": item.kind,
                "product_id": item.product_id,
                "saved_build_id": item.saved_build_id,
                "product": info,
                "build_snapshot": snapshot,
                "quantity": item.quantity,
                "unit_price": price,
                "line_total": price * item.quantity,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
        )
    return CartOut(
        id=cart.id,
        items=items,
        subtotal=subtotal,
        item_count=count,
        created_at=cart.created_at,
        updated_at=cart.updated_at,
    )


def _order_to_out(order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        user_id=order.user_id,
        status=order.status,
        total_amount=order.total_amount,
        item_count=order.item_count,
        created_at=order.created_at,
        items=[
            OrderItemOut(
                id=item.id,
                kind=item.kind,
                product_id=item.product_id,
                saved_build_id=item.saved_build_id,
                sku_snapshot=item.sku_snapshot,
                name_snapshot=item.name_snapshot,
                image_url_snapshot=item.image_url_snapshot,
                unit_price=item.unit_price,
                quantity=item.quantity,
                line_total=item.line_total,
                specs_snapshot=item.specs_snapshot or [],
                components_snapshot=item.components_snapshot,
            )
            for item in order.items
        ],
    )


@router.get("", response_model=CartOut)
def get_cart(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CartOut:
    return _cart_to_out(svc.get_cart(db, current_user), db)


@router.post("/products", response_model=CartOut)
def add_product(
    body: CartAddProductRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CartOut:
    try:
        svc.add_product_to_cart(db, current_user, body.product_id, body.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.expire_all()
    return _cart_to_out(svc.get_cart(db, current_user), db)


@router.post("/builds", response_model=CartOut)
def add_build(
    body: CartAddBuildRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CartOut:
    try:
        svc.add_build_to_cart(db, current_user, body.saved_build_id, body.quantity)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.expire_all()
    return _cart_to_out(svc.get_cart(db, current_user), db)


@router.patch("/{item_id}", response_model=CartOut)
def update_quantity(
    item_id: int,
    body: CartUpdateQuantityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CartOut:
    try:
        svc.update_cart_quantity(db, item_id, current_user, body.quantity)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=404 if "not found" in str(exc).lower() else 422, detail=str(exc)
        ) from exc
    db.expire_all()
    return _cart_to_out(svc.get_cart(db, current_user), db)


@router.delete("/{item_id}", response_model=CartOut)
def remove_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CartOut:
    try:
        svc.remove_cart_item(db, item_id, current_user)
    except ValueError:
        raise HTTPException(status_code=404, detail="Cart item not found") from None
    db.expire_all()
    return _cart_to_out(svc.get_cart(db, current_user), db)


@router.post("/buy-now", response_model=CheckoutResponse)
def buy_now(
    body: BuyNowRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CheckoutResponse:
    try:
        order = svc.buy_product_demo(
            db, current_user, body.product_id, body.quantity, str(body.idempotency_key)
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return CheckoutResponse(order=_order_to_out(order))


@router.post("/checkout", response_model=CheckoutResponse)
def checkout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> CheckoutResponse:
    try:
        order = svc.checkout_demo(db, current_user)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.refresh(order, ["items"])
    return CheckoutResponse(order=_order_to_out(order))


@router.get("/orders", response_model=list[OrderOut])
def get_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> list[OrderOut]:
    return [_order_to_out(order) for order in svc.get_user_orders(db, current_user)]
