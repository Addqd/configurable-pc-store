"""Shared FastAPI dependencies: DB session, current user, auth helpers."""

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db_session
from app.models import User

bearer_scheme = HTTPBearer()


# ── Database ─────────────────────────────────────────────────────────────────

DBSessionDep = Iterator[Session]


# ── Authentication / Authorization ───────────────────────────────────────────


def _get_current_user_from_token(
    token: str,
    db,
) -> User:
    """Decode a JWT and return the matching user; raise 401 on failure."""
    payload = decode_token(token)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )
    user = db.get(User, int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: DBSessionDep = Depends(get_db_session),
) -> User:
    """FastAPI dependency that yields the authenticated user."""
    return _get_current_user_from_token(credentials.credentials, db)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(
        HTTPBearer(auto_error=False)
    ),
    db: DBSessionDep = Depends(get_db_session),
) -> User | None:
    """Return the current user if authenticated, or None."""
    if credentials is None:
        return None
    return _get_current_user_from_token(credentials.credentials, db)


# ── CSRF helper ──────────────────────────────────────────────────────────────


def get_csrf_token(request: Request) -> str:
    """Extract the CSRF token from the request cookie."""
    return request.cookies.get("csrf_token", "")


# ── Type aliases ─────────────────────────────────────────────────────────────

CurrentUserDep = User
OptionalUserDep = User | None
