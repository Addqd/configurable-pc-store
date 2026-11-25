"""Normalize characteristic values into a dictionary of options.

Revision ID: 5ca357f0576a
Revises: b83f4e91c2a7
Create Date: 2026-11-25 14:22:21.145918

Structural migration only: it creates `characteristic_options` and reshapes
`product_characteristics` into (product, characteristic, option, quantity).

The existing product/characteristic associations are deliberately deleted here.
Their complete export (51 products, 13 categories, 161 definitions, 722
associations, 803 values) was prepared and verified by the project owner, so no
in-place JSONB -> option conversion is attempted: canonical wording, units and
duplicate folding belong to the separate restoration migration that runs after
this structure is applied. No placeholder options and no invented foreign keys
are created; both tables end up empty.

The migration is transactional (one Alembic transaction) and touches no
products, categories, characteristic definitions, orders, saved builds or users.
"""

import sqlalchemy as sa

from alembic import op

revision = "5ca357f0576a"
down_revision = "b83f4e91c2a7"
branch_labels = None
depends_on = None

ASSOCIATIONS = "product_characteristics"
OPTIONS = "characteristic_options"
ASSOCIATIONS_PK = "product_characteristics_pkey"


def upgrade() -> None:
    # 1. Independent dictionary of display-ready values per definition.
    op.create_table(
        OPTIONS,
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), nullable=False),
        sa.Column("characteristic_name_id", sa.BigInteger(), nullable=False),
        sa.Column("value", sa.String(length=500), nullable=False),
        sa.CheckConstraint(
            "length(btrim(value)) > 0",
            name="ck_characteristic_options_value_nonempty",
        ),
        sa.ForeignKeyConstraint(
            ["characteristic_name_id"],
            ["characteristics.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        # Referenced key of the composite foreign key added below.
        sa.UniqueConstraint(
            "characteristic_name_id", "id", name="uq_characteristic_options_name_id"
        ),
        sa.UniqueConstraint(
            "characteristic_name_id",
            "value",
            name="uq_characteristic_options_name_value",
        ),
    )

    # 2. Drop the old associations: their JSONB payloads are fully exported and
    #    cannot exist in the new shape until the restoration migration runs.
    associations = sa.table(ASSOCIATIONS, sa.column("product_id", sa.BigInteger()))
    op.execute(associations.delete())

    # 3-5. Remove the JSONB value storage and the key that covers it.
    op.drop_constraint(
        "ck_product_characteristics_value_not_null", ASSOCIATIONS, type_="check"
    )
    op.drop_constraint(ASSOCIATIONS_PK, ASSOCIATIONS, type_="primary")
    op.drop_column(ASSOCIATIONS, "value")

    # 6. New association columns; the table is empty, so NOT NULL is safe.
    op.add_column(
        ASSOCIATIONS,
        sa.Column("characteristic_option_id", sa.BigInteger(), nullable=False),
    )
    op.add_column(
        ASSOCIATIONS,
        sa.Column("quantity", sa.Integer(), server_default="1", nullable=False),
    )

    # 7-9. Composite key, cross-characteristic guard, quantity rule, indexes.
    op.create_primary_key(
        ASSOCIATIONS_PK,
        ASSOCIATIONS,
        ["product_id", "characteristic_id", "characteristic_option_id"],
    )
    op.create_foreign_key(
        "fk_product_characteristics_option",
        ASSOCIATIONS,
        OPTIONS,
        ["characteristic_id", "characteristic_option_id"],
        ["characteristic_name_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_product_characteristics_quantity_positive", ASSOCIATIONS, "quantity > 0"
    )
    op.create_index(
        "ix_product_characteristics_characteristic_option_id",
        ASSOCIATIONS,
        ["characteristic_option_id"],
        unique=False,
    )


def downgrade() -> None:
    raise RuntimeError(
        "Irreversible structural migration: the previous product/characteristic "
        "associations were deleted on purpose because their complete export lives "
        "outside the database, and a JSONB column cannot be repopulated from "
        "string options. Recreating `value` would restore an empty column, not the "
        "former contents. Restore the verified pre-migration backup (or replay the "
        "export) instead of downgrading."
    )
