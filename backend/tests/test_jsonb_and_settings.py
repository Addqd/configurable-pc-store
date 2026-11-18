"""Regression checks for settings secrets and JSONB mutation tracking."""

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy import inspect
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm.attributes import set_committed_value

from app.core.config import AppSettings
from app.models import Product


def _product() -> Product:
    return Product(
        product_type_id=1,
        manufacturer_id=1,
        slug="test-product",
        name="Test product",
        price=Decimal("1.00"),
    )


def test_settings_repr_does_not_expose_password() -> None:
    settings = AppSettings(
        postgres_db="test_db",
        postgres_user="test_user",
        postgres_password="example-test-password-not-a-secret",
    )
    assert "example-test-password-not-a-secret" not in repr(settings)


def test_catalog_jsonb_list_detects_in_place_changes() -> None:
    product = _product()
    product.spec_lines = ["AM5"]
    set_committed_value(product, "spec_lines", product.spec_lines)
    product.spec_lines.append("DDR5")
    assert inspect(product).attrs.spec_lines.history.has_changes()


def test_catalog_jsonb_dict_detects_in_place_changes() -> None:
    product = _product()
    product.technical_specs = {"socket": "AM5"}
    set_committed_value(product, "technical_specs", product.technical_specs)
    product.technical_specs["socket"] = "LGA1700"
    assert inspect(product).attrs.technical_specs.history.has_changes()


def test_catalog_display_specs_jsonb_list_detects_in_place_changes() -> None:
    product = _product()
    product.display_specs = [{"label": "Сокет", "value": "AM5"}]
    set_committed_value(product, "display_specs", product.display_specs)
    product.display_specs.append({"label": "Ядра", "value": "6"})
    assert inspect(product).attrs.display_specs.history.has_changes()


def test_catalog_display_specs_column_matches_applied_migration() -> None:
    column = Product.__table__.c.display_specs
    assert isinstance(column.type, JSONB)
    assert column.nullable is False
    assert column.server_default is not None
    assert "'[]'::jsonb" in str(column.server_default.arg)


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
