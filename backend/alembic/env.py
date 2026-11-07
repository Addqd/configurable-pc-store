"""Alembic environment for the existing PostgreSQL schema.

The first migration is already applied. ORM metadata is provided only to allow
carefully reviewed *future* autogenerate revisions; importing it does not apply
or modify any migration.
"""

from sqlalchemy import create_engine, pool

from alembic import context
from app.core.config import AppSettings
from app.models import Base

# Importing app.models registers every declarative table with Base.metadata.
target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    # The initial migration created this PostgreSQL full-text expression index
    # with raw SQL. Alembic reflects its expression differently from SQLAlchemy,
    # reporting a spurious drop/create pair on every autogenerate check.
    # Preserve the real index; manage any future changes to it in explicit SQL
    # migrations, verifying the definition separately in PostgreSQL.
    return not (type_ == "index" and name == "ix_products_fts")


def run_migrations_offline() -> None:
    context.configure(
        dialect_name="postgresql",
        target_metadata=target_metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(AppSettings().database_url, poolclass=pool.NullPool)
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                include_object=include_object,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
