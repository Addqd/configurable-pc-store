"""Cart and demo checkout service."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Cart,
    CartItem,
    Order,
    OrderItem,
    Product,
    SavedBuild,
    SavedBuildItem,
    User,
)


def get_or_create_cart(db: Session, user: User) -> Cart:
    """Get or create a cart for the user."""
    cart = db.execute(select(Cart).where(Cart.user_id == user.id)).scalar_one_or_none()

    if cart is None:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.flush()
        db.refresh(cart)

    return cart


def get_cart(db: Session, user: User) -> Cart | None:
    """Get the user's cart."""
    return db.execute(select(Cart).where(Cart.user_id == user.id)).scalar_one_or_none()


def _product_price(db: Session, product_id: int) -> Decimal | None:
    """Get current price for a product."""
    row = db.execute(
        select(Product.price).where(
            Product.id == product_id, Product.is_active.is_(True)
        )
    ).scalar_one_or_none()
    return row


def _is_product_active(db: Session, product_id: int) -> bool:
    """Check if a product exists and is active."""
    return (
        db.execute(
            select(Product.id).where(
                Product.id == product_id, Product.is_active.is_(True)
            )
        ).scalar_one_or_none()
        is not None
    )


def _is_build_active(db: Session, build_id: int) -> bool:
    """Check if a build exists."""
    return (
        db.execute(
            select(SavedBuild.id).where(SavedBuild.id == build_id)
        ).scalar_one_or_none()
        is not None
    )


def add_product_to_cart(
    db: Session,
    user: User,
    product_id: int,
    quantity: int = 1,
) -> CartItem:
    """Add a product to the cart."""
    cart = get_or_create_cart(db, user)

    # Check product is active
    if not _is_product_active(db, product_id):
        raise ValueError(f"Product {product_id} is not available")

    # Check if product already in cart
    existing = db.execute(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.kind == "product",
            CartItem.product_id == product_id,
        )
    ).scalar_one_or_none()

    if existing:
        existing.quantity += quantity
        existing.updated_at = datetime.now(UTC)
        db.flush()
        db.refresh(existing)
        return existing

    price = _product_price(db, product_id)
    if price is None:
        raise ValueError(f"Product {product_id} price not found")

    item = CartItem(
        cart_id=cart.id,
        kind="product",
        product_id=product_id,
        quantity=quantity,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def add_build_to_cart(
    db: Session,
    user: User,
    saved_build_id: int,
    quantity: int = 1,
) -> CartItem:
    """Add a saved build to the cart as a custom_build item."""
    cart = get_or_create_cart(db, user)

    # Verify build ownership
    build = db.execute(
        select(SavedBuild).where(
            SavedBuild.id == saved_build_id, SavedBuild.user_id == user.id
        )
    ).scalar_one_or_none()

    if not build:
        raise ValueError(f"Build {saved_build_id} not found or not owned by user")

    # Build snapshot
    items = db.execute(
        select(SavedBuildItem, Product.name, Product.price)
        .join(Product, SavedBuildItem.product_id == Product.id)
        .where(SavedBuildItem.build_id == saved_build_id)
    ).all()

    snapshot: list[dict] = []
    total_price = Decimal(0)
    for build_item, product_name, product_price in items:
        snapshot.append(
            {
                "slot": build_item.slot,
                "product_id": build_item.product_id,
                "product_name": product_name,
                "price": float(product_price),
            }
        )
        total_price += product_price

    # Check if this build already in cart
    existing = db.execute(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.kind == "custom_build",
            CartItem.saved_build_id == saved_build_id,
        )
    ).scalar_one_or_none()

    if existing:
        existing.quantity += quantity
        existing.updated_at = datetime.now(UTC)
        db.flush()
        db.refresh(existing)
        return existing

    item = CartItem(
        cart_id=cart.id,
        kind="custom_build",
        saved_build_id=saved_build_id,
        build_snapshot={"components": snapshot, "total_price": float(total_price)},
        quantity=quantity,
    )
    db.add(item)
    db.flush()
    db.refresh(item)
    return item


def update_cart_quantity(
    db: Session,
    cart_item_id: int,
    user: User,
    quantity: int,
) -> CartItem:
    """Update quantity of a cart item."""
    item = db.execute(
        select(CartItem).where(CartItem.id == cart_item_id)
    ).scalar_one_or_none()

    if not item:
        raise ValueError(f"Cart item {cart_item_id} not found")

    cart = db.execute(select(Cart).where(Cart.id == item.cart_id)).scalar_one_or_none()

    if cart and cart.user_id != user.id:
        raise ValueError("Cart item does not belong to this user")

    item.quantity = quantity
    item.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(item)
    return item


def remove_cart_item(db: Session, cart_item_id: int, user: User) -> None:
    """Remove a cart item."""
    item = db.execute(
        select(CartItem).where(CartItem.id == cart_item_id)
    ).scalar_one_or_none()

    if not item:
        raise ValueError(f"Cart item {cart_item_id} not found")

    cart = db.execute(select(Cart).where(Cart.id == item.cart_id)).scalar_one_or_none()

    if cart and cart.user_id != user.id:
        raise ValueError("Cart item does not belong to this user")

    db.delete(item)
    db.flush()


def get_cart_with_prices(db: Session, user: User) -> Cart | None:
    """Get cart with current prices."""
    cart = get_cart(db, user)
    if cart is None:
        return None
    return cart


def checkout_demo(db: Session, user: User) -> Order:
    """Process a demo checkout. Creates an Order with snapshots."""
    cart = get_cart(db, user)
    if cart is None:
        raise ValueError("No cart found")

    items = (
        db.execute(select(CartItem).where(CartItem.cart_id == cart.id)).scalars().all()
    )

    if not items:
        raise ValueError("Cart is empty")

    # Calculate total from current prices
    total = Decimal(0)
    item_count = 0
    order_items: list[OrderItem] = []

    for item in items:
        if item.kind == "product" and item.product_id is not None:
            # Fetch current price and product info for snapshot
            product = db.get(Product, item.product_id)
            if product is None or not product.is_active:
                continue

            unit_price = product.price
            snapshot = OrderItem(
                order_id=0,  # Will be set after insert
                kind="product",
                product_id=item.product_id,
                sku_snapshot=product.sku,
                name_snapshot=product.name,
                image_url_snapshot=None,
                unit_price=unit_price,
                quantity=item.quantity,
                specs_snapshot=product.spec_lines or [],
                components_snapshot=None,
            )
            order_items.append(snapshot)
            total += unit_price * item.quantity
            item_count += item.quantity

        elif item.kind == "custom_build" and item.saved_build_id is not None:
            build = db.execute(
                select(SavedBuild).where(SavedBuild.id == item.saved_build_id)
            ).scalar_one_or_none()

            if build:
                build_items = db.execute(
                    select(SavedBuildItem, Product.name, Product.price)
                    .join(Product, SavedBuildItem.product_id == Product.id)
                    .where(SavedBuildItem.build_id == build.id)
                ).all()

                components = []
                build_total = Decimal(0)
                for bi, pname, pprice in build_items:
                    components.append(
                        {
                            "slot": bi.slot,
                            "product_id": bi.product_id,
                            "product_name": pname,
                            "price": float(pprice),
                        }
                    )
                    build_total += pprice

                # Use a representative name for the build
                build_name = f"Сборка: {build.name}"
                snapshot = OrderItem(
                    order_id=0,
                    kind="custom_build",
                    saved_build_id=item.saved_build_id,
                    name_snapshot=build_name,
                    unit_price=build_total,
                    quantity=item.quantity,
                    specs_snapshot=[],
                    components_snapshot=components,
                )
                order_items.append(snapshot)
                total += build_total * item.quantity
                item_count += 1

    # Create order
    order = Order(
        user_id=user.id,
        status="completed_demo",
        total_amount=total,
        item_count=item_count,
    )
    db.add(order)
    db.flush()

    # Update order_id in items and insert
    for oi in order_items:
        oi.order_id = order.id
        db.add(oi)

    # Clear cart items
    db.execute(CartItem.__table__.delete().where(CartItem.cart_id == cart.id))

    db.flush()
    db.refresh(order)

    return order


def get_user_orders(db: Session, user: User) -> list[Order]:
    """Get all orders for a user."""
    return db.scalars(
        select(Order).where(Order.user_id == user.id).order_by(Order.created_at.desc())
    ).all()
