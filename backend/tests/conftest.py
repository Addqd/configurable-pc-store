"""Shared test fixtures for the backend test suite."""

from collections.abc import Iterator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import AppSettings
from app.db.base import Base


@pytest.fixture()
def settings() -> AppSettings:
    """Return application settings for testing."""
    return AppSettings()  # type: ignore[call-arg]


@pytest.fixture()
def engine(settings: AppSettings):
    """Create an in-memory SQLite engine for testing."""
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # Create all tables
    Base.metadata.create_all(test_engine)
    yield test_engine


@pytest.fixture()
def db_session(engine) -> Iterator[Session]:
    """Provide a transactional database session for tests."""
    # Start a transaction
    connection = engine.connect()
    transaction = connection.begin()

    session = sessionmaker(bind=connection, expire_on_commit=False)()

    yield session

    # Rollback the transaction
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def seeded_db_session(engine, settings) -> Iterator[Session]:
    """Provide a DB session with categories, manufacturers, and seed products."""
    # Seed the data via the seed script's logic (direct SQL for speed)
    session = Session(engine)

    from scripts.seed import parse_catalog

    try:
        from sqlalchemy import inspect as sa_inspect

        # Check if already seeded
        inspector = sa_inspect(engine)
        if "categories" not in inspector.get_table_names():
            Base.metadata.create_all(engine)

        # Check if data exists
        existing = session.execute(text("SELECT COUNT(*) FROM categories")).scalar()

        if existing == 0 or existing is None:
            # Run seed

            # Override settings to use current connection
            parse_catalog()

            # Insert categories
            for order, (slug, name) in enumerate(
                settings.__dict__.get(
                    "_categories",
                    [
                        ("prebuilt", "Готовые сборки"),
                        ("peripheral", "Периферия"),
                        ("accessories", "Аксессуары"),
                        ("cooling", "Охлаждение"),
                        ("network", "Сетевое оборудование"),
                        ("software", "Софт и сервисы"),
                        ("gpu", "Видеокарты"),
                        ("cpu", "Процессоры"),
                        ("mobo", "Материнские платы"),
                        ("ram", "Оперативная память"),
                        ("storage", "Накопители"),
                        ("hdd", "Жёсткие диски"),
                        ("case", "Корпуса"),
                        ("psu", "Блоки питания"),
                        ("monitor", "Мониторы"),
                    ],
                )
            ):
                session.execute(
                    text(
                        "INSERT INTO categories (slug, name, sort_order) VALUES (:slug, :name, :sort_order) "
                        "ON CONFLICT (slug) DO NOTHING"
                    ),
                    {"slug": slug, "name": name, "sort_order": order},
                )

            session.commit()

        yield session
    finally:
        session.close()
