# Re-export all ORM models for clean imports
from app.db.base import Base
from app.models.build import SavedBuild, SavedBuildItem
from app.models.cart_order import Cart, CartItem, Order, OrderItem
from app.models.catalog import (
    Category,
    Manufacturer,
    Product,
    ProductImage,
    ProductType,
)
from app.models.characteristics import Characteristic, ProductCharacteristic
from app.models.platform import SaleLineFact, SiteEvent
from app.models.social import Favorite, Review
from app.models.user import AuthSession, User

__all__ = [
    # User
    "AuthSession",
    "Base",
    # Cart / Orders
    "Cart",
    "CartItem",
    # Catalog
    "Category",
    "Characteristic",
    # Social
    "Favorite",
    "Manufacturer",
    "Order",
    "OrderItem",
    "Product",
    "ProductCharacteristic",
    "ProductImage",
    "ProductType",
    "Review",
    "SaleLineFact",
    # Builder
    "SavedBuild",
    "SavedBuildItem",
    # Platform
    "SiteEvent",
    "User",
]
