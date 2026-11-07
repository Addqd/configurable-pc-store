"""Regression checks for future Alembic revisions and JSONB SQL NULL semantics.

No database connection is needed for these tests.
"""

from pathlib import Path

from mako.template import Template
from sqlalchemy.dialects import postgresql

from app.models.cart_order import CartItem, OrderItem

_MIGRATION_TEMPLATE = Path(__file__).resolve().parents[1] / "alembic" / "script.py.mako"


def _render_migration(upgrades: str, downgrades: str) -> str:
    return Template(filename=str(_MIGRATION_TEMPLATE)).render(
        message="Verify generated migration",
        up_revision="test_revision",
        down_revision="previous_revision",
        create_date="2026-11-07",
        imports="",
        branch_labels=None,
        depends_on=None,
        upgrades=upgrades,
        downgrades=downgrades,
        comma=lambda value: value,
    )


def test_alembic_template_renders_operations() -> None:
    result = _render_migration(
        "op.add_column('products', sa.Column('test_flag', sa.Boolean()))",
        "op.drop_column('products', 'test_flag')",
    )
    assert "def upgrade() -> None:\n    op.add_column(" in result
    assert "def downgrade() -> None:\n    op.drop_column(" in result


def test_alembic_template_renders_pass_when_empty() -> None:
    result = _render_migration("", "")
    assert "def upgrade() -> None:\n    pass" in result
    assert "def downgrade() -> None:\n    pass" in result


def test_optional_jsonb_snapshots_store_python_none_as_sql_null() -> None:
    dialect = postgresql.dialect()
    for column in (
        CartItem.__table__.c.build_snapshot,
        OrderItem.__table__.c.components_snapshot,
    ):
        assert isinstance(column.type, postgresql.JSONB)
        assert column.type.none_as_null is True
        processor = column.type.bind_processor(dialect)
        assert column.type.should_evaluate_none is False
        if processor is not None:
            assert processor(None) is None
