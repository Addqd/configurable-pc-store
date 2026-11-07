"""Regression checks for settings secrets and JSONB mutation tracking."""

from decimal import Decimal

from sqlalchemy import inspect
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
