"""Authentication service: registration, login, token management, profile."""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import (
    hash_password,
    verify_password,
)
from app.models import AuthSession, User


def register_user(
    db: Session,
    email: str,
    username: str,
    password: str,
    display_name: str,
) -> User:
    """Register a new user. Raises ValueError on duplicates."""
    # Check uniqueness (case-insensitive)
    existing = (
        db.execute(
            select(User).where(
                User.email.ilike(email),
            )
        )
        .scalars()
        .first()
    )
    if existing:
        raise ValueError(f"Email already registered: {email}")

    existing_user = (
        db.execute(select(User).where(User.username.ilike(username))).scalars().first()
    )
    if existing_user:
        raise ValueError(f"Username already taken: {username}")

    user = User(
        email=email.lower().strip(),
        username=username.strip(),
        display_name=display_name.strip(),
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()
    db.refresh(user)
    return user


def authenticate(
    db: Session,
    email_or_username: str,
    password: str,
) -> User:
    """Authenticate by email or username. Raises ValueError on failure."""
    # Try by email (case-insensitive)
    user = (
        db.execute(select(User).where(User.email.ilike(email_or_username)))
        .scalars()
        .first()
    )

    if not user:
        # Try by username (case-insensitive)
        user = (
            db.execute(select(User).where(User.username.ilike(email_or_username)))
            .scalars()
            .first()
        )

    if not user or not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")

    return user


def create_auth_session(
    db: Session,
    user: User,
    refresh_token: str,
    expires_at: datetime,
) -> AuthSession:
    """Store a refresh token hash for rotation and revocation."""
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher

    ph = PasswordHash((Argon2Hasher(),))
    token_hash = ph.hash(refresh_token)

    session = AuthSession(
        user_id=user.id,
        refresh_token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(session)
    db.flush()
    return session


def revoke_session(db: Session, user_id: int, refresh_token: str) -> bool:
    """Revoke a specific refresh session. Returns True if found and revoked."""
    from pwdlib import PasswordHash
    from pwdlib.hashers.argon2 import Argon2Hasher

    ph = PasswordHash((Argon2Hasher(),))
    token_hash = ph.hash(refresh_token)

    result = db.execute(
        select(AuthSession).where(
            AuthSession.user_id == user_id,
            AuthSession.refresh_token_hash == token_hash,
            AuthSession.revoked_at.is_(None),
        )
    ).scalar_one_or_none()

    if result:
        result.revoked_at = datetime.now(UTC)
        db.flush()
        return True
    return False


def rotate_refresh_token(
    db: Session,
    user: User,
    old_refresh_token: str,
    new_refresh_token: str,
    new_expires_at: datetime,
) -> AuthSession:
    """Rotate refresh token: revoke old, create new."""
    # Revoke old session
    revoke_session(db, user.id, old_refresh_token)

    # Create new session
    return create_auth_session(db, user, new_refresh_token, new_expires_at)


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Get user by ID."""
    return db.get(User, user_id)


def change_password(
    db: Session,
    user: User,
    old_password: str,
    new_password: str,
) -> None:
    """Change user password after verifying old one."""
    if not verify_password(old_password, user.password_hash):
        raise ValueError("Current password is incorrect")
    user.password_hash = hash_password(new_password)
    db.flush()


def delete_user(db: Session, user: User) -> None:
    """Delete a user and cascade all related data."""
    db.delete(user)
    db.flush()
