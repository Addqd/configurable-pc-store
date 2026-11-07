"""Authentication API: register, login, refresh, logout, profile."""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Body, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_settings,
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


def _cookie_name(token_type: str) -> str:
    return f"{token_type}_token"


def _set_cookie(
    response: Response,
    token: str,
    token_type: str,
) -> None:
    """Set an HttpOnly cookie with the refresh token."""
    settings = get_settings()
    response.set_cookie(
        key=_cookie_name(token_type),
        value=token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite or "lax",
        domain=settings.cookie_domain,
        max_age=settings.refresh_token_days * 86400,
        path="/",
    )


def _clear_cookie(response: Response, token_type: str) -> None:
    """Clear a refresh token cookie."""
    response.delete_cookie(
        key=_cookie_name(token_type),
        path="/",
    )


# ── Register ─────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db_session),
) -> UserOut:
    """Register a new user account."""
    try:
        user = auth_svc.register_user(
            db,
            email=body.email,
            username=body.username,
            password=body.password,
            display_name=body.display_name,
        )
    except ValueError as e:
        detail = str(e)
        if "Email" in detail or "email" in detail:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"field": "email", "message": detail},
            )
        if "Username" in detail or "username" in detail:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"field": "username", "message": detail},
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
    )


# ── Login ────────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and get tokens",
)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    """Authenticate and return JWT tokens."""
    try:
        user = auth_svc.authenticate(db, body.email_or_username, body.password)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    access_token = create_access_token(str(user.id))
    refresh_token = create_refresh_token(str(user.id))

    # Store refresh session
    expires_at = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days)
    auth_svc.create_auth_session(db, user, refresh_token, expires_at)

    _set_cookie(response, refresh_token, "refresh")

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


# ── Refresh ──────────────────────────────────────────────────────────────────


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
)
def refresh(
    response: Response,
    refresh_token: str = Cookie(..., alias="refresh_token"),
    db: Session = Depends(get_db_session),
) -> TokenResponse:
    """Rotate refresh token and return a new access token."""
    payload = decode_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token payload",
        )

    user = db.get(User, int(user_id))
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    new_access = create_access_token(str(user.id))
    new_refresh = create_refresh_token(str(user.id))

    # Rotate: revoke old, store new
    expires_at = datetime.now(UTC) + timedelta(days=get_settings().refresh_token_days)
    auth_svc.rotate_refresh_token(db, user, refresh_token, new_refresh, expires_at)

    _clear_cookie(response, "refresh")
    _set_cookie(response, new_refresh, "refresh")

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


# ── Logout ───────────────────────────────────────────────────────────────────


@router.post(
    "/logout",
    summary="Logout and revoke refresh token",
)
def logout(
    response: Response,
    current_user: CurrentUserDep = Depends(get_current_user),
    refresh_token: str = Cookie(..., alias="refresh_token"),
    db: Session = Depends(get_db_session),
) -> dict:
    """Revoke the current refresh token."""
    auth_svc.revoke_session(db, current_user.id, refresh_token)
    _clear_cookie(response, "refresh")
    return {"detail": "Logged out"}


# ── Current User ─────────────────────────────────────────────────────────────


@router.get(
    "/me",
    response_model=UserOut,
    summary="Current authenticated user",
)
def get_me(
    current_user: CurrentUserDep = Depends(get_current_user),
) -> UserOut:
    """Get the current user's profile."""
    return UserOut(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
        created_at=current_user.created_at.isoformat()
        if current_user.created_at
        else None,
        updated_at=current_user.updated_at.isoformat()
        if current_user.updated_at
        else None,
    )


# ── Update Profile ───────────────────────────────────────────────────────────


@router.patch(
    "/profile",
    response_model=UserOut,
    summary="Update profile",
)
def update_profile(
    body: ProfileUpdate = Body(),
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> UserOut:
    """Update display_name or avatar_url."""
    if body.display_name is not None:
        current_user.display_name = body.display_name.strip()
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url
    db.flush()
    db.refresh(current_user)

    return UserOut(
        id=current_user.id,
        email=current_user.email,
        username=current_user.username,
        display_name=current_user.display_name,
        avatar_url=current_user.avatar_url,
    )


# ── Change Password ──────────────────────────────────────────────────────────


@router.patch(
    "/password",
    summary="Change password",
)
def change_password(
    body: PasswordChange = Body(),
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> dict:
    """Change the current user's password."""
    old_pw = body.old_password
    new_pw = body.new_password
    if not old_pw or not new_pw:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="old_password and new_password are required",
        )
    try:
        auth_svc.change_password(db, current_user, old_pw, new_pw)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return {"detail": "Password changed"}


# ── Delete Account ───────────────────────────────────────────────────────────


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete own account",
)
def delete_account(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    """Delete the current user's account."""
    auth_svc.delete_user(db, current_user)
