"""Permanently remove legacy product specification storage.

Revision ID: 5d91c7e2a604
Revises: 204d6e8d676c
"""

from collections.abc import Sequence

from alembic import op

revision: str = "5d91c7e2a604"
down_revision: str | Sequence[str] | None = "204d6e8d676c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Delete legacy specification templates and their contents.
    # Child table must be dropped before its parent.
    op.drop_table("product_spec_options")
    op.drop_table("product_spec_fields")

    # Remove constraints associated with old JSONB columns.
    for constraint in (
        "ck_products_spec_lines_array",
        "ck_products_short_specs_array",
        "ck_products_technical_specs_object",
        "ck_products_display_specs_array",
    ):
        op.drop_constraint(constraint, "products", type_="check")

    # Permanently remove old product specification data.
    for column in (
        "spec_lines",
        "short_specs",
        "technical_specs",
        "display_specs",
    ):
        op.drop_column("products", column)


def downgrade() -> None:
    raise RuntimeError("Irreversible migration: legacy specification data was deleted.")
