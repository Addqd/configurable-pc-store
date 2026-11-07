"""Pydantic schemas for authentication API."""

from pydantic import BaseModel, EmailStr, Field

# ── Registration ─────────────────────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)


# ── Login ────────────────────────────────────────────────────────────────────


class LoginRequest(BaseModel):
    email_or_username: str = Field(alias="email_or_username", min_length=1)
    password: str = Field(min_length=1, max_length=128)


# ── Refresh ──────────────────────────────────────────────────────────────────


class RefreshRequest(BaseModel):
    refresh_token: str


# ── Responses ────────────────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None


class PasswordChange(BaseModel):
    old_password: str
    new_password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    display_name: str
    avatar_url: str | None = None
    created_at: str | None = None
    updated_at: str | None = None
