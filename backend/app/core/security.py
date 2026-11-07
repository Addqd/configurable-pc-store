"""JWT token creation, validation, and password hashing helpers."""

from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import AppSettings

_settings: AppSettings | None = None


def get_settings() -> AppSettings:
    global _settings
    if _settings is None:
        _settings = AppSettings()  # type: ignore[call-arg]
    return _settings


# Password hashers: Argon2 preferred, bcrypt fallback
_password_hash: PasswordHash | None = None


def get_password_hash() -> PasswordHash:
    global _password_hash
    if _password_hash is None:
        _password_hash = PasswordHash((Argon2Hasher(),))
    return _password_hash


def hash_password(plain: str) -> str:
    return get_password_hash().hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return get_password_hash().verify(plain, hashed)


def create_access_token(subject: str, extra: dict | None = None) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.access_token_minutes)
    payload: dict = {"sub": subject, "exp": expire, "type": "access"}
    if extra:
        payload.update(extra)
    return jwt.encode(
        payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm
    )


def create_refresh_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(days=settings.refresh_token_days)
    return jwt.encode(
        {"sub": subject, "exp": expire, "type": "refresh"},
        settings.jwt_secret_key,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        return jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
