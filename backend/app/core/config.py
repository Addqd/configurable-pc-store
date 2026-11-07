"""Configuration for the existing local PostgreSQL database."""

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_ROOT_DIR = Path(__file__).resolve().parents[3]


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_db: str
    postgres_user: str
    postgres_password: SecretStr
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 55432

    # JWT settings
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 7

    # CSRF / cookie settings
    csrf_secret: str = "change-me-csrf-too"
    cookie_domain: str | None = None
    cookie_secure: bool = False  # True behind TLS in production
    cookie_samesite: str = "lax"

    @property
    def database_url(self) -> URL:
        """Build a safe SQLAlchemy URL (including passwords with reserved characters)."""
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password.get_secret_value(),
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )
