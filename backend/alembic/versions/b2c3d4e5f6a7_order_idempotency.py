"""Add per-user idempotency keys to demo orders.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "orders", sa.Column("idempotency_key", sa.String(length=36), nullable=True)
    )
    op.create_unique_constraint(
        "uq_orders_user_idempotency_key", "orders", ["user_id", "idempotency_key"]
    )


def downgrade() -> None:
    op.drop_constraint("uq_orders_user_idempotency_key", "orders", type_="unique")
    op.drop_column("orders", "idempotency_key")
