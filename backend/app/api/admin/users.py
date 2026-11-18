"""`/api/v1/admin/users` — paginated account administration."""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session

from app.api.deps import AdminUserDep, DBSessionDep
from app.models import User
from app.schemas.admin_users import (
    AdminPaginatedUsersOut,
    AdminRoleFilter,
    AdminStatusFilter,
    AdminUserCountersOut,
    AdminUserDeleteRequest,
    AdminUserDetailOut,
    AdminUserOut,
    AdminUserSort,
    AdminUserUpdate,
)
from app.services import user_admin_service as svc

router = APIRouter(prefix="/users", tags=["admin: users"])


def _user_out(user: User) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        role=user.role,
        status=user.status,
        blocked_at=user.blocked_at,
        blocked_reason=user.blocked_reason,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _detail_out(db: Session, user: User) -> AdminUserDetailOut:
    base = _user_out(user)
    return AdminUserDetailOut(
        **base.model_dump(),
        counters=AdminUserCountersOut(**svc.user_counters(db, user.id)),
    )


@router.get("", response_model=AdminPaginatedUsersOut)
def list_users(
    db: DBSessionDep,
    admin: AdminUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    q: Annotated[str | None, Query(max_length=120)] = None,
    role: AdminRoleFilter | None = None,
    status: AdminStatusFilter | None = None,
    sort: AdminUserSort = "created_desc",
) -> AdminPaginatedUsersOut:
    users, total = svc.list_users(
        db,
        page=page,
        page_size=page_size,
        q=q,
        role=role,
        status=status,
        sort=sort,
    )
    return AdminPaginatedUsersOut(
        items=[_user_out(user) for user in users],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )


@router.get("/{user_id}", response_model=AdminUserDetailOut)
def get_user(user_id: int, db: DBSessionDep, admin: AdminUserDep) -> AdminUserDetailOut:
    return _detail_out(db, svc.get_user(db, user_id))


@router.patch("/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> AdminUserOut:
    target = svc.get_user(db, user_id)
    updated = svc.update_user(
        db,
        admin,
        target,
        role=body.role,
        status=body.status,
        blocked_reason=body.blocked_reason,
    )
    return _user_out(updated)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    body: AdminUserDeleteRequest,
    db: DBSessionDep,
    admin: AdminUserDep,
) -> None:
    target = svc.get_user(db, user_id)
    svc.delete_user(db, admin, target, reason=body.reason)
