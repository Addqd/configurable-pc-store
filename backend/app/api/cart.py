"""Cart and demo checkout API."""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, get_current_user
from app.db.session import get_db_session
from app.models import Product
from app.schemas.cart import (
    CartAddBuildRequest,
    CartAddProductRequest,
    CartOut,
    CartUpdateQuantityRequest,
    CheckoutRequest,
    CheckoutResponse,
    OrderItemOut,
    OrderOut,
)
from app.services import cart_service as cart_svc

router = APIRouter(prefix="/api/v1/cart", tags=["cart"])


def _cart_to_out(cart, db: Session) -> CartOut:
    """Convert a Cart ORM object to a CartOut schema."""
    items: list[dict] = []
    subtotal = Decimal(0)
    item_count = 0

    for item in cart.items:
        unit_price = Decimal(0)
        product_info = None

        if item.kind == "product" and item.product_id is not None:
            p = db.get(Product, item.product_id)
            if p and p.is_active:
                unit_price = p.price
                product_info = {
                    "id": p.id,
                    "slug": p.slug,
                    "name": p.name,
                    "price": float(p.price),
                }

        if item.kind == "custom_build" and item.build_snapshot:
            snapshot = item.build_snapshot
            if isinstance(snapshot, dict):
                total = snapshot.get("total_price", 0.0)
                unit_price = Decimal(str(total))

        line_total = unit_price * item.quantity
        subtotal += line_total
        if item.kind == "product":
            item_count += item.quantity
        else:
            item_count += 1

        items.append(
            {
                "id": item.id,
                "kind": item.kind,
                "product_id": item.product_id,
                "saved_build_id": item.saved_build_id,
                "product": product_info,
                "build_snapshot": item.build_snapshot,
                "quantity": item.quantity,
                "unit_price": float(unit_price),
                "line_total": float(line_total),
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
        )

    return CartOut(
        id=cart.id,
        items=items,
        subtotal=subtotal,
        item_count=item_count,
        created_at=cart.created_at,
        updated_at=cart.updated_at,
    )


# ── Get Cart ─────────────────────────────────────────────────────────────────


@router.get("", response_model=CartOut, summary="Get cart")
def get_cart(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CartOut:
    """Get the current user's cart with current prices."""
    cart = cart_svc.get_cart_with_prices(db, current_user)
    if cart is None:
        from datetime import datetime

        now = datetime.now()
        return CartOut(
            id=0,
            items=[],
            subtotal=Decimal(0),
            item_count=0,
            created_at=now,
            updated_at=now,
        )
    return _cart_to_out(cart, db)


# ── Add Product ──────────────────────────────────────────────────────────────


@router.post(
    "/products",
    response_model=CartOut,
    summary="Add product to cart",
)
def add_product(
    body: CartAddProductRequest,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CartOut:
    """Add a product to the cart."""
    try:
        cart_svc.add_product_to_cart(db, current_user, body.product_id, body.quantity)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    cart = cart_svc.get_cart_with_prices(db, current_user)
    return _cart_to_out(cart, db)


# ── Add Build ────────────────────────────────────────────────────────────────


@router.post(
    "/builds",
    response_model=CartOut,
    summary="Add saved build to cart",
)
def add_build(
    body: CartAddBuildRequest,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CartOut:
    """Add a saved build as a custom_build to the cart."""
    try:
        cart_svc.add_build_to_cart(db, current_user, body.saved_build_id, body.quantity)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    cart = cart_svc.get_cart_with_prices(db, current_user)
    return _cart_to_out(cart, db)


# ── Update Quantity ──────────────────────────────────────────────────────────


@router.patch(
    "/{item_id}",
    response_model=CartOut,
    summary="Update cart item quantity",
)
def update_quantity(
    item_id: int,
    body: CartUpdateQuantityRequest,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CartOut:
    """Update the quantity of a cart item."""
    try:
        cart_svc.update_cart_quantity(db, item_id, current_user, body.quantity)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    cart = cart_svc.get_cart_with_prices(db, current_user)
    return (
        _cart_to_out(cart, db)
        if cart
        else CartOut(
            id=0,
            items=[],
            subtotal=0.0,
            item_count=0,
            created_at=None,
            updated_at=None,
        )
    )


# ── Remove Item ──────────────────────────────────────────────────────────────


@router.delete(
    "/{item_id}",
    response_model=CartOut,
    summary="Remove cart item",
)
def remove_item(
    item_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CartOut:
    """Remove an item from the cart."""
    try:
        cart_svc.remove_cart_item(db, item_id, current_user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    cart = cart_svc.get_cart_with_prices(db, current_user)
    return (
        _cart_to_out(cart, db)
        if cart
        else CartOut(
            id=0,
            items=[],
            subtotal=0.0,
            item_count=0,
            created_at=None,
            updated_at=None,
        )
    )


# ── Demo Checkout ────────────────────────────────────────────────────────────


@router.post(
    "/checkout",
    response_model=CheckoutResponse,
    summary="Demo checkout",
)
def checkout(
    body: CheckoutRequest = Depends(),
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> CheckoutResponse:
    """Process a demo checkout. Creates an order with snapshot prices."""
    try:
        order = cart_svc.checkout_demo(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    order_items = (
        db.execute(
            __import__("sqlalchemy", fromlist=["select"])
            .select(__import__("app.models", fromlist=["OrderItem"]).OrderItem)
            .where(
                __import__("app.models", fromlist=["OrderItem"]).OrderItem.order_id
                == order.id
            )
        )
        .scalars()
        .all()
    )

    return CheckoutResponse(
        order=OrderOut(
            id=order.id,
            user_id=order.user_id,
            status=order.status,
            total_amount=float(order.total_amount),
            item_count=order.item_count,
            items=[
                OrderItemOut(
                    id=oi.id,
                    kind=oi.kind,
                    product_id=oi.product_id,
                    saved_build_id=oi.saved_build_id,
                    sku_snapshot=oi.sku_snapshot,
                    name_snapshot=oi.name_snapshot,
                    image_url_snapshot=oi.image_url_snapshot,
                    unit_price=float(oi.unit_price),
                    quantity=oi.quantity,
                    line_total=float(oi.line_total) if oi.line_total else None,
                    specs_snapshot=oi.specs_snapshot or [],
                    components_snapshot=oi.components_snapshot,
                )
                for oi in order_items
            ],
            created_at=order.created_at,
        )
    )


# ── Order History ────────────────────────────────────────────────────────────


@router.get(
    "/orders",
    response_model=list[OrderOut],
    summary="Order history",
)
def get_orders(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[OrderOut]:
    """Get the current user's order history."""
    orders = cart_svc.get_user_orders(db, current_user)
    result = []
    for order in orders:
        items = (
            db.execute(
                __import__("sqlalchemy", fromlist=["select"])
                .select(__import__("app.models", fromlist=["OrderItem"]).OrderItem)
                .where(
                    __import__("app.models", fromlist=["OrderItem"]).OrderItem.order_id
                    == order.id
                )
            )
            .scalars()
            .all()
        )
        result.append(
            OrderOut(
                id=order.id,
                user_id=order.user_id,
                status=order.status,
                total_amount=float(order.total_amount),
                item_count=order.item_count,
                items=[
                    OrderItemOut(
                        id=oi.id,
                        kind=oi.kind,
                        product_id=oi.product_id,
                        saved_build_id=oi.saved_build_id,
                        sku_snapshot=oi.sku_snapshot,
                        name_snapshot=oi.name_snapshot,
                        image_url_snapshot=oi.image_url_snapshot,
                        unit_price=float(oi.unit_price),
                        quantity=oi.quantity,
                        line_total=float(oi.line_total) if oi.line_total else None,
                        specs_snapshot=oi.specs_snapshot or [],
                        components_snapshot=oi.components_snapshot,
                    )
                    for oi in items
                ],
                created_at=order.created_at,
            )
        )
    return result
