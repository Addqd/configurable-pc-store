"""Add display_specs for catalog presentation; keep compatibility specs separate.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "display_specs",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.create_check_constraint(
        "ck_products_display_specs_array",
        "products",
        "jsonb_typeof(display_specs) = 'array'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_products_display_specs_array", "products", type_="check")
    op.drop_column("products", "display_specs")
