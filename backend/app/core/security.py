"""Password hashing and strongly validated, uniquely identified JWTs."""

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from hashlib import sha256
from hmac import compare_digest
from hmac import new as hmac_new
from secrets import token_hex

import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

from app.core.config import AppSettings


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return AppSettings()  # type: ignore[call-arg]


@lru_cache(maxsize=1)
def get_password_hash() -> PasswordHash:
    return PasswordHash((Argon2Hasher(),))


def hash_password(plain: str) -> str:
    return get_password_hash().hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return get_password_hash().verify(plain, hashed)
    except ValueError, TypeError:
        return False


def _signing_key() -> str:
    configured = get_settings().jwt_secret_key
    if configured is None:
        raise RuntimeError("JWT_SECRET_KEY is required for authentication")
    key = configured.get_secret_value()
    if len(key) < 32 or key in ("change-me-in-production", "change-me-csrf-too"):
        raise RuntimeError("JWT_SECRET_KEY must contain at least 32 private characters")
    return key


def _create_token(
    subject: str, token_type: str, lifetime: timedelta, session_id: str | None = None
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": subject,
            "iat": now,
            "exp": now + lifetime,
            "type": token_type,
            "jti": token_hex(24),
            **({"sid": session_id} if session_id else {}),
        },
        _signing_key(),
        algorithm="HS256",
    )


def create_access_token(subject: str, session_id: str) -> str:
    return _create_token(
        subject,
        "access",
        timedelta(minutes=get_settings().access_token_minutes),
        session_id=session_id,
    )


def create_refresh_token(subject: str) -> str:
    return _create_token(
        subject, "refresh", timedelta(days=get_settings().refresh_token_days)
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            _signing_key(),
            algorithms=["HS256"],
            options={"require": ["sub", "iat", "exp", "type", "jti"]},
        )
    except jwt.InvalidTokenError:
        return None


def refresh_token_digest(token: str) -> str:
    # Unique 64-character deterministic digest fits AuthSession.refresh_token_hash(128).
    return sha256(token.encode("utf-8")).hexdigest()


def make_csrf_token(refresh_token: str) -> str:
    return hmac_new(
        _signing_key().encode(), b"csrf:" + refresh_token.encode(), "sha256"
    ).hexdigest()


def validate_csrf(refresh_token: str, cookie: str | None, header: str | None) -> bool:
    if not cookie or not header or not compare_digest(cookie, header):
        return False
    return compare_digest(cookie, make_csrf_token(refresh_token))
