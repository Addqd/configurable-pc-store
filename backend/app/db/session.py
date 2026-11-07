from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import AppSettings

settings = AppSettings()  # type: ignore[call-arg]

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db_session() -> Iterator[Session]:
    """FastAPI dependency that yields a SQLAlchemy session and ensures cleanup."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
