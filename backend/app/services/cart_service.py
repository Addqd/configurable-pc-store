"""Transactional, user-scoped cart and demonstration purchases."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

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
from app.services.catalog import _images
from app.services.compatibility import check_selections


def get_or_create_cart(db: Session, user: User) -> Cart:
    # On-conflict prevents two concurrent requests from creating duplicate carts.
    db.execute(
        insert(Cart)
        .values(user_id=user.id)
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    cart = db.scalar(select(Cart).where(Cart.user_id == user.id).with_for_update())
    if cart is None:
        raise RuntimeError("Unable to create cart")
    return cart


def get_cart(db: Session, user: User) -> Cart | None:
    return db.scalar(
        select(Cart).where(Cart.user_id == user.id).options(selectinload(Cart.items))
    )


def _product(db: Session, product_id: int, quantity: int = 1) -> Product:
    p = db.get(Product, product_id)
    if p is None or not p.is_active:
        raise ValueError("Product is unavailable")
    if p.stock_quantity < quantity:
        raise ValueError("Insufficient product stock")
    return p


def _build_snapshot(db: Session, selections: dict[str, int], quantity: int) -> dict:
    compatibility = check_selections(db, selections)
    if not compatibility.is_compatible:
        raise ValueError(
            "Build is incomplete, incompatible or not technically verified"
        )
    components = []
    total = Decimal("0.00")
    for slot, product_id in sorted(selections.items()):
        p = _product(db, product_id, quantity)
        components.append(
            {
                "slot": slot,
                "product_id": p.id,
                "product_name": p.name,
                "price": str(p.price),
            }
        )
        total += p.price
    return {"components": components, "total_price": str(total)}


def add_product_to_cart(
    db: Session, user: User, product_id: int, quantity: int = 1
) -> CartItem:
    cart = get_or_create_cart(db, user)
    existing = db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.kind == "product",
            CartItem.product_id == product_id,
        )
    )
    new_qty = quantity + (existing.quantity if existing else 0)
    _product(db, product_id, new_qty)
    if existing:
        existing.quantity = new_qty
        item = existing
    else:
        item = CartItem(
            cart_id=cart.id,
            kind="product",
            product_id=product_id,
            quantity=quantity,
            build_snapshot=None,
        )
        db.add(item)
    item.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(item)
    return item


def add_build_to_cart(
    db: Session, user: User, saved_build_id: int, quantity: int = 1
) -> CartItem:
    build = db.scalar(
        select(SavedBuild).where(
            SavedBuild.id == saved_build_id, SavedBuild.user_id == user.id
        )
    )
    if build is None:
        raise ValueError("Build not found")
    cart = get_or_create_cart(db, user)
    existing = db.scalar(
        select(CartItem).where(
            CartItem.cart_id == cart.id,
            CartItem.kind == "custom_build",
            CartItem.saved_build_id == saved_build_id,
        )
    )
    new_qty = quantity + (existing.quantity if existing else 0)
    selections = {
        x.slot: x.product_id
        for x in db.scalars(
            select(SavedBuildItem).where(SavedBuildItem.build_id == build.id)
        ).all()
    }
    snapshot = _build_snapshot(db, selections, new_qty)
    if existing:
        existing.quantity = new_qty
        existing.build_snapshot = snapshot
        item = existing
    else:
        item = CartItem(
            cart_id=cart.id,
            kind="custom_build",
            saved_build_id=build.id,
            build_snapshot=snapshot,
            quantity=quantity,
        )
        db.add(item)
    item.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(item)
    return item


def _owned_item(db: Session, cart_item_id: int, user: User) -> CartItem:
    # Lock the containing cart before mutation, serializing checkout/add/delete.
    cart_id = db.scalar(
        select(CartItem.cart_id)
        .join(Cart, Cart.id == CartItem.cart_id)
        .where(CartItem.id == cart_item_id, Cart.user_id == user.id)
    )
    if cart_id is None:
        raise ValueError("Cart item not found")
    locked = db.scalar(
        select(Cart.id)
        .where(Cart.id == cart_id, Cart.user_id == user.id)
        .with_for_update()
    )
    if locked is None:
        raise ValueError("Cart item not found")
    item = db.scalar(
        select(CartItem)
        .where(CartItem.id == cart_item_id, CartItem.cart_id == locked)
        .with_for_update()
    )
    if item is None:
        raise ValueError("Cart item not found")
    return item


def update_cart_quantity(
    db: Session, cart_item_id: int, user: User, quantity: int
) -> CartItem:
    item = _owned_item(db, cart_item_id, user)
    if item.kind == "product" and item.product_id is not None:
        _product(db, item.product_id, quantity)
    elif item.kind == "custom_build":
        selections = _selections(item.build_snapshot)
        item.build_snapshot = _build_snapshot(db, selections, quantity)
    else:
        raise ValueError("Invalid cart item")
    item.quantity = quantity
    item.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(item)
    return item


def remove_cart_item(db: Session, cart_item_id: int, user: User) -> None:
    db.delete(_owned_item(db, cart_item_id, user))
    db.flush()


def get_cart_with_prices(db: Session, user: User) -> Cart | None:
    return get_cart(db, user)


def _selections(snapshot: dict | None) -> dict[str, int]:
    if not isinstance(snapshot, dict) or not isinstance(
        snapshot.get("components"), list
    ):
        raise TypeError("Invalid build snapshot")
    components = snapshot["components"]
    if any(
        not isinstance(row, dict) or "slot" not in row or "product_id" not in row
        for row in components
    ):
        raise ValueError("Invalid build snapshot")
    result = {str(row["slot"]): int(row["product_id"]) for row in components}
    if len(result) != len(components):
        raise ValueError("Duplicate build slots")
    return result


def checkout_demo(db: Session, user: User) -> Order:
    # Lock the cart row for the entire transaction. A second request will see
    # an emptied cart after this transaction commits, not create another order.
    cart = db.scalar(select(Cart).where(Cart.user_id == user.id).with_for_update())
    if cart is None:
        raise ValueError("No cart found")
    items = db.scalars(
        select(CartItem)
        .where(CartItem.cart_id == cart.id)
        .order_by(CartItem.id)
        .with_for_update()
    ).all()
    if not items:
        raise ValueError("Cart is empty")

    snapshots: list[dict] = []
    total = Decimal("0.00")
    item_count = 0
    for item in items:
        if item.kind == "product" and item.product_id is not None:
            product = _product(db, item.product_id, item.quantity)
            _list, cover = _images(product)
            snapshots.append(
                {
                    "kind": "product",
                    "product_id": product.id,
                    "saved_build_id": None,
                    "sku_snapshot": product.sku,
                    "name_snapshot": product.name,
                    "image_url_snapshot": cover,
                    "unit_price": product.price,
                    "quantity": item.quantity,
                    "specs_snapshot": list(product.spec_lines or []),
                    "components_snapshot": None,
                }
            )
            total += product.price * item.quantity
        elif item.kind == "custom_build":
            selections = _selections(item.build_snapshot)
            refreshed = _build_snapshot(db, selections, item.quantity)
            price = Decimal(refreshed["total_price"])
            # Cart belongs to this user. Snapshot is immutable even when the
            # saved build was later edited or removed.
            build = (
                db.get(SavedBuild, item.saved_build_id) if item.saved_build_id else None
            )
            if build is not None and build.user_id != user.id:
                raise ValueError("Build does not belong to this user")
            snapshots.append(
                {
                    "kind": "custom_build",
                    "product_id": None,
                    "saved_build_id": build.id if build else None,
                    "sku_snapshot": None,
                    "name_snapshot": f"Сборка: {build.name}" if build else "Сборка ПК",
                    "image_url_snapshot": None,
                    "unit_price": price,
                    "quantity": item.quantity,
                    "specs_snapshot": [],
                    "components_snapshot": refreshed["components"],
                }
            )
            total += price * item.quantity
        else:
            # Fail the entire transaction instead of silently removing bad items.
            raise ValueError("Cart contains an invalid or unavailable item")
        item_count += item.quantity

    order = Order(
        user_id=user.id,
        status="completed_demo",
        total_amount=total,
        item_count=item_count,
    )
    db.add(order)
    db.flush()
    for snapshot in snapshots:
        db.add(OrderItem(order_id=order.id, **snapshot))
    db.flush()
    db.execute(delete(CartItem).where(CartItem.cart_id == cart.id))
    db.flush()
    db.refresh(order)
    return order


def get_user_orders(db: Session, user: User) -> list[Order]:
    return list(
        db.scalars(
            select(Order)
            .where(Order.user_id == user.id)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc(), Order.id.desc())
        ).all()
    )
