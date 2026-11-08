"""Authentication API with short-lived Bearer access and one-use HttpOnly refresh."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_settings,
    make_csrf_token,
    validate_csrf,
)
from app.db.session import get_db_session
from app.models import User
from app.schemas.auth import (
    LoginRequest,
    PasswordChange,
    ProfileUpdate,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services import auth_service as auth_svc

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


def _set_cookies(response: Response, refresh_token: str) -> None:
    settings = get_settings()
    common = {
        "secure": settings.cookie_secure,
        "samesite": settings.cookie_samesite,
        "domain": settings.cookie_domain,
        "path": "/",
        "max_age": settings.refresh_token_days * 86400,
    }
    response.set_cookie("refresh_token", refresh_token, httponly=True, **common)
    response.set_cookie(
        "csrf_token", make_csrf_token(refresh_token), httponly=False, **common
    )


def _clear_cookies(response: Response) -> None:
    settings = get_settings()
    for name in ("refresh_token", "csrf_token"):
        response.delete_cookie(
            name,
            path="/",
            domain=settings.cookie_domain,
            secure=settings.cookie_secure,
            samesite=settings.cookie_samesite,
        )


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        created_at=user.created_at.isoformat() if user.created_at else None,
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
    )


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db_session, scope="function"),
) -> UserOut:
    try:
        user = auth_svc.register_user(
            db, body.email, body.username, body.password, body.display_name
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _user_out(user)


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db_session, scope="function"),
) -> TokenResponse:
    try:
        user = auth_svc.authenticate(db, body.email_or_username, body.password)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid credentials") from None
    refresh = create_refresh_token(str(user.id))
    expires = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days)
    session = auth_svc.create_auth_session(db, user, refresh, expires)
    _set_cookies(response, refresh)
    return TokenResponse(
        access_token=create_access_token(str(user.id), str(session.id))
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(None),
    csrf_cookie: str | None = Cookie(None, alias="csrf_token"),
    x_csrf_token: str | None = Header(None, alias="X-CSRF-Token"),
    db: Session = Depends(get_db_session, scope="function"),
) -> TokenResponse:
    if not refresh_token or not validate_csrf(refresh_token, csrf_cookie, x_csrf_token):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    payload = decode_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    try:
        uid = int(payload["sub"])
    except KeyError, ValueError, TypeError:
        raise HTTPException(status_code=401, detail="Invalid refresh token") from None
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    new_refresh = create_refresh_token(str(uid))
    expires = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days)
    try:
        session = auth_svc.rotate_refresh_token(
            db, user, refresh_token, new_refresh, expires
        )
    except ValueError:
        raise HTTPException(
            status_code=401, detail="Refresh session expired or revoked"
        ) from None
    _set_cookies(response, new_refresh)
    return TokenResponse(access_token=create_access_token(str(uid), str(session.id)))


@router.post("/logout")
def logout(
    response: Response,
    current_user: User = Depends(get_current_user),
    refresh_token: str | None = Cookie(None),
    csrf_cookie: str | None = Cookie(None, alias="csrf_token"),
    x_csrf_token: str | None = Header(None, alias="X-CSRF-Token"),
    db: Session = Depends(get_db_session, scope="function"),
) -> dict[str, str]:
    if not refresh_token or not validate_csrf(refresh_token, csrf_cookie, x_csrf_token):
        raise HTTPException(status_code=403, detail="CSRF validation failed")
    # A mismatched identity cannot revoke someone else's session.
    payload = decode_token(refresh_token)
    if (
        not payload
        or payload.get("type") != "refresh"
        or payload.get("sub") != str(current_user.id)
    ):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    auth_svc.revoke_session(db, current_user.id, refresh_token)
    _clear_cookies(response)
    return {"detail": "Logged out"}


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(current_user)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    body: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> UserOut:
    fields = body.model_fields_set
    if "display_name" in fields:
        if not body.display_name or not body.display_name.strip():
            raise HTTPException(status_code=422, detail="Display name cannot be empty")
        current_user.display_name = body.display_name.strip()
    if "avatar_url" in fields:
        current_user.avatar_url = body.avatar_url
    if "email" in fields and body.email:
        mail = body.email.strip().lower()
        if db.scalar(
            select(User.id).where(
                func.lower(User.email) == mail, User.id != current_user.id
            )
        ):
            raise HTTPException(status_code=409, detail="Email already in use")
        current_user.email = mail
    if "username" in fields and body.username:
        username = body.username.strip()
        if db.scalar(
            select(User.id).where(
                func.lower(User.username) == username.lower(),
                User.id != current_user.id,
            )
        ):
            raise HTTPException(status_code=409, detail="Username already in use")
        current_user.username = username
    try:
        db.flush()
    except IntegrityError:
        raise HTTPException(
            status_code=409, detail="Email or username already in use"
        ) from None
    db.refresh(current_user)
    return _user_out(current_user)


@router.patch("/password")
def change_password(
    body: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> dict[str, str]:
    try:
        auth_svc.change_password(db, current_user, body.old_password, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"detail": "Password changed; refresh sessions revoked"}


@router.delete("", status_code=204)
def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> None:
    auth_svc.delete_user(db, current_user)
