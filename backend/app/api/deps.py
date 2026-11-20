"""Authenticated API dependencies; never trust a caller-controlled user id.

Role authorization is resolved from the database on every request, so a role or
status change made by the owner takes effect immediately for existing tokens.
"""

from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db_session
from app.models import AuthSession, User

bearer_scheme = HTTPBearer(auto_error=False)
DBSessionDep = Annotated[Session, Depends(get_db_session, scope="function")]

ROLE_ADMIN = "admin"
ROLE_OWNER = "owner"
ROLE_USER = "user"
ADMIN_ROLES = frozenset({ROLE_ADMIN, ROLE_OWNER})
ACCOUNT_ACTIVE = "active"


def _deny_blocked(user: User) -> None:
    """A blocked account must not keep using an already issued access token."""
    if user.status != ACCOUNT_ACTIVE:
        raise HTTPException(status_code=403, detail="Account is blocked")


def _get_current_user_from_token(token: str, db: Session) -> User:
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user_id = int(payload["sub"])
        session_id = UUID(payload["sid"])
    except ValueError, TypeError, KeyError:
        raise HTTPException(status_code=401, detail="Invalid token payload") from None
    active_session = db.scalar(
        select(AuthSession.id).where(
            AuthSession.id == session_id,
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    if active_session is None:
        raise HTTPException(status_code=401, detail="Session expired or revoked")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    _deny_blocked(user)
    return user


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DBSessionDep,
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _get_current_user_from_token(credentials.credentials, db)


def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: DBSessionDep,
) -> User | None:
    if credentials is None:
        return None
    return _get_current_user_from_token(credentials.credentials, db)


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Allow `admin` and `owner`; deny every other role with 403."""
    if current_user.role not in ADMIN_ROLES:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return current_user


def get_current_owner(current_user: User = Depends(get_current_user)) -> User:
    """Only the single highest-privilege account passes."""
    if current_user.role != ROLE_OWNER:
        raise HTTPException(status_code=403, detail="Owner access required")
    return current_user


CurrentUserDep = Annotated[User, Depends(get_current_user)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_user)]
AdminUserDep = Annotated[User, Depends(get_current_admin)]
OwnerUserDep = Annotated[User, Depends(get_current_owner)]
