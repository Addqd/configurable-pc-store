"""Authentication data operations with one-use, revocable refresh sessions."""

from datetime import UTC, datetime

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password, refresh_token_digest, verify_password
from app.models import AuthSession, User


def register_user(
    db: Session, email: str, username: str, password: str, display_name: str
) -> User:
    mail = email.strip().lower()
    login = username.strip()
    existing = db.scalar(
        select(User.id).where(
            or_(
                func.lower(User.email) == mail,
                func.lower(User.username) == login.lower(),
            )
        )
    )
    if existing is not None:
        raise ValueError("Email or username already registered")
    user = User(
        email=mail,
        username=login,
        display_name=display_name.strip(),
        password_hash=hash_password(password),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        raise ValueError("Email or username already registered") from exc
    db.refresh(user)
    return user


def authenticate(db: Session, email_or_username: str, password: str) -> User:
    login = email_or_username.strip().lower()
    user = db.scalar(
        select(User).where(
            or_(func.lower(User.email) == login, func.lower(User.username) == login)
        )
    )
    if user is None or not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")
    return user


def create_auth_session(
    db: Session, user: User, refresh_token: str, expires_at: datetime
) -> AuthSession:
    session = AuthSession(
        user_id=user.id,
        refresh_token_hash=refresh_token_digest(refresh_token),
        expires_at=expires_at,
    )
    db.add(session)
    db.flush()
    return session


def _get_active_session(db: Session, user_id: int, token: str) -> AuthSession | None:
    # Lock prevents two concurrent refresh requests from successfully consuming one token.
    return db.scalar(
        select(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.refresh_token_hash == refresh_token_digest(token),
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > datetime.now(UTC),
        )
        .with_for_update()
    )


def revoke_session(db: Session, user_id: int, refresh_token: str) -> bool:
    session = _get_active_session(db, user_id, refresh_token)
    if session is None:
        return False
    session.revoked_at = datetime.now(UTC)
    db.flush()
    return True


def rotate_refresh_token(
    db: Session,
    user: User,
    old_refresh_token: str,
    new_refresh_token: str,
    new_expires_at: datetime,
) -> AuthSession:
    if not revoke_session(db, user.id, old_refresh_token):
        raise ValueError("Refresh session is invalid, expired or revoked")
    return create_auth_session(db, user, new_refresh_token, new_expires_at)


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def change_password(
    db: Session, user: User, old_password: str, new_password: str
) -> None:
    if not verify_password(old_password, user.password_hash):
        raise ValueError("Current password is incorrect")
    user.password_hash = hash_password(new_password)
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    db.flush()


def delete_user(db: Session, user: User) -> None:
    db.delete(user)
    db.flush()
