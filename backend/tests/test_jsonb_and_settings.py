"""Regression checks for settings secrets and JSONB columns."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects.postgresql import JSONB

from app.core.config import AppSettings
from app.models import CartItem, OrderItem, Product, ProductCharacteristic


def _cart_item(snapshot: dict | None) -> CartItem:
    timestamp = datetime(2026, 1, 1, tzinfo=UTC)
    return CartItem(
        id=1,
        cart_id=1,
        kind="custom_build" if snapshot else "product",
        product_id=None if snapshot else 1,
        build_snapshot=snapshot,
        quantity=1,
        created_at=timestamp,
        updated_at=timestamp,
    )


def test_settings_repr_does_not_expose_password() -> None:
    settings = AppSettings(
        postgres_db="test_db",
        postgres_user="test_user",
        postgres_password="example-test-password-not-a-secret",
    )
    assert "example-test-password-not-a-secret" not in repr(settings)


def test_product_has_no_legacy_specification_columns() -> None:
    # The legacy display/specification architecture is gone from the ORM and must
    # never come back: only real product attributes remain.
    columns = set(Product.__table__.c.keys())
    assert columns == {
        "id",
        "product_type_id",
        "manufacturer_id",
        "slug",
        "sku",
        "name",
        "description",
        "price",
        "stock_quantity",
        "color",
        "graphics_chip_brand",
        "on_sale",
        "is_active",
        "listed_at",
        "created_at",
        "updated_at",
    }
    assert not any(isinstance(column.type, JSONB) for column in Product.__table__.c)


def test_product_characteristics_store_dictionary_associations() -> None:
    # The characteristic value is no longer a JSON document: a product links one
    # dictionary option of its own definition with a positive quantity.
    columns = set(ProductCharacteristic.__table__.c.keys())
    assert columns == {
        "product_id",
        "characteristic_id",
        "characteristic_option_id",
        "quantity",
    }
    assert not any(
        isinstance(column.type, JSONB) for column in ProductCharacteristic.__table__.c
    )
    assert ProductCharacteristic.__table__.c.quantity.nullable is False


def test_cart_snapshot_uses_sql_null_for_regular_products() -> None:
    # A Python None must become SQL NULL, as required by ck_cart_items_kind_payload.
    column = CartItem.__table__.c.build_snapshot
    assert isinstance(column.type, JSONB)
    assert column.type.none_as_null is True
    assert _cart_item(None).build_snapshot is None


def test_order_specs_snapshot_stays_a_non_null_jsonb_array() -> None:
    column = OrderItem.__table__.c.specs_snapshot
    assert isinstance(column.type, JSONB)
    assert column.nullable is False
    assert column.server_default is not None
    assert "'[]'::jsonb" in str(column.server_default.arg)


def test_order_components_snapshot_is_nullable_jsonb() -> None:
    column = OrderItem.__table__.c.components_snapshot
    assert isinstance(column.type, JSONB)
    assert column.type.none_as_null is True
    assert column.nullable is True


def _settings(**overrides):
    return AppSettings(
        postgres_db="test_db",
        postgres_user="test_user",
        postgres_password="example-test-password-not-a-secret",
        **overrides,
    )


def test_production_configuration_requires_secure_cookies() -> None:
    # HTTPS deployments must not issue session cookies without the Secure flag.
    with pytest.raises(ValidationError):
        _settings(app_env="production")


def test_production_configuration_accepts_secure_cookies() -> None:
    settings = _settings(app_env="production", cookie_secure=True)
    assert settings.cookie_secure is True
    assert settings.cookie_samesite == "lax"


def test_development_configuration_keeps_http_cookies_usable() -> None:
    settings = _settings(app_env="development", cookie_secure=False)
    assert settings.cookie_secure is False


def test_same_site_none_requires_secure_cookies() -> None:
    with pytest.raises(ValidationError):
        _settings(cookie_samesite="none", cookie_secure=False)
