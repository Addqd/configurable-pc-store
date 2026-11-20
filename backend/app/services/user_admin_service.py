"""Administrative user management with server-side privilege boundaries.

Rules enforced here (never in the client):
- only the owner may assign roles, and the owner role is never assignable;
- an owner account can never be modified, blocked or deleted;
- an administrator may only manage ordinary `user` accounts;
- nobody can change their own administrative role/status;
- only ordinary accounts are deletable through this operation.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Favorite, Order, Review, SavedBuild, User
from app.services import auth_service, event_service
from app.services.errors import ForbiddenError, InvalidInputError, NotFoundError
from app.services.sql_utils import like_pattern

ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_OWNER = "owner"
STATUS_ACTIVE = "active"
STATUS_BLOCKED = "blocked"

SORT_ORDERS: dict[str, tuple[Any, ...]] = {
    "created_desc": (User.created_at.desc(), User.id.desc()),
    "created_asc": (User.created_at.asc(), User.id.asc()),
    "updated_desc": (User.updated_at.desc(), User.id.desc()),
    "updated_asc": (User.updated_at.asc(), User.id.asc()),
    "username_asc": (func.lower(User.username).asc(), User.id.asc()),
    "username_desc": (func.lower(User.username).desc(), User.id.desc()),
    "display_name_asc": (func.lower(User.display_name).asc(), User.id.asc()),
    "display_name_desc": (func.lower(User.display_name).desc(), User.id.desc()),
    "id_asc": (User.id.asc(),),
    "id_desc": (User.id.desc(),),
}
DEFAULT_SORT = "created_desc"


def _search_clause(term: str):
    pattern = like_pattern(term)
    clauses: list[Any] = [
        User.username.ilike(pattern, escape="\\"),
        User.display_name.ilike(pattern, escape="\\"),
        User.email.ilike(pattern, escape="\\"),
    ]
    if term.isdigit() and len(term) <= 18:
        clauses.append(User.id == int(term))
    return or_(*clauses)


def list_users(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    q: str | None = None,
    role: str | None = None,
    status: str | None = None,
    sort: str = DEFAULT_SORT,
) -> tuple[list[User], int]:
    statement = select(User)
    if q and q.strip():
        statement = statement.where(_search_clause(q.strip()))
    if role:
        statement = statement.where(User.role == role)
    if status:
        statement = statement.where(User.status == status)
    total = int(
        db.scalar(
            select(func.count()).select_from(
                statement.with_only_columns(User.id).order_by(None).subquery()
            )
        )
        or 0
    )
    order_by = SORT_ORDERS.get(sort, SORT_ORDERS[DEFAULT_SORT])
    users = list(
        db.scalars(
            statement.order_by(*order_by)
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    return users, total


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found")
    return user


def user_counters(db: Session, user_id: int) -> dict[str, int]:
    """Aggregate counters for the admin detail view (read-only)."""
    return {
        "orders": int(
            db.scalar(select(func.count(Order.id)).where(Order.user_id == user_id)) or 0
        ),
        "reviews": int(
            db.scalar(select(func.count(Review.id)).where(Review.user_id == user_id))
            or 0
        ),
        "favorites": int(
            db.scalar(
                select(func.count())
                .select_from(Favorite)
                .where(Favorite.user_id == user_id)
            )
            or 0
        ),
        "saved_builds": int(
            db.scalar(
                select(func.count(SavedBuild.id)).where(SavedBuild.user_id == user_id)
            )
            or 0
        ),
    }


def _forbidden(
    db: Session, actor: User, target: User, message: str, action: str
) -> None:
    """Journal a rejected privilege-boundary attempt, then deny it."""
    event_service.record_failure(
        db,
        category=event_service.CATEGORY_ADMIN,
        event_type="admin.action_forbidden",
        actor=actor,
        target_type="user",
        target_id=target.id,
        reason=message,
        details={"action": action},
    )
    raise ForbiddenError(message)


def _assert_can_modify(db: Session, actor: User, target: User) -> None:
    if target.role == ROLE_OWNER:
        _forbidden(db, actor, target, "The owner account cannot be modified", "modify")
    if actor.role != ROLE_OWNER and target.role != ROLE_USER:
        _forbidden(
            db,
            actor,
            target,
            "Administrators can only manage ordinary users",
            "modify",
        )


def _assert_not_self(db: Session, actor: User, target: User) -> None:
    if actor.id == target.id:
        _forbidden(
            db,
            actor,
            target,
            "You cannot change your own administrative state",
            "self_modify",
        )


def _validate_role_assignment(
    db: Session, actor: User, target: User, role: str
) -> None:
    if actor.role != ROLE_OWNER:
        _forbidden(db, actor, target, "Only the owner can change user roles", "role")
    if role == ROLE_OWNER:
        event_service.record_failure(
            db,
            category=event_service.CATEGORY_ADMIN,
            event_type="admin.action_forbidden",
            actor=actor,
            target_type="user",
            target_id=target.id,
            reason="The owner role cannot be granted through the API",
            details={"action": "role"},
        )
        raise InvalidInputError("The owner role cannot be granted through the API")
    if target.id == actor.id:
        _forbidden(
            db,
            actor,
            target,
            "The owner cannot change their own role",
            "self_demote",
        )


def update_user(
    db: Session,
    actor: User,
    target: User,
    *,
    role: str | None = None,
    status: str | None = None,
    blocked_reason: str | None = None,
) -> User:
    _assert_can_modify(db, actor, target)
    _assert_not_self(db, actor, target)
    reason = (blocked_reason or "").strip()
    if status == STATUS_BLOCKED and not reason:
        raise InvalidInputError("A blocking reason is required")
    if status is None and reason and target.status != STATUS_BLOCKED:
        raise InvalidInputError("blocked_reason is only allowed when blocking")

    role_change: tuple[str, str] | None = None
    if role is not None and role != target.role:
        _validate_role_assignment(db, actor, target, role)
        role_change = (target.role, role)
        target.role = role

    status_change: tuple[str, str] | None = None
    reason_changed = False
    revoked = 0
    if status is not None and status != target.status:
        status_change = (target.status, status)
        target.status = status
        if status == STATUS_BLOCKED:
            target.blocked_at = datetime.now(UTC)
            target.blocked_reason = reason
            revoked = auth_service.revoke_all_sessions(db, target.id)
        else:
            target.blocked_at = None
            target.blocked_reason = None
    elif target.status == STATUS_BLOCKED and reason and reason != target.blocked_reason:
        # Adjusting the published reason without re-blocking the account.
        target.blocked_reason = reason
        reason_changed = True

    # Journal only changes that were actually persisted.
    db.flush()
    target_id = target.id
    username = target.username
    if role_change is not None:
        event_service.record_event(
            db,
            category=event_service.CATEGORY_ADMIN,
            event_type="admin.user_role_changed",
            actor=actor,
            target_type="user",
            target_id=target_id,
            details={
                "from": role_change[0],
                "to": role_change[1],
                "username": username,
            },
        )
    if status_change is not None:
        event_service.record_event(
            db,
            category=event_service.CATEGORY_ADMIN,
            event_type="admin.user_status_changed",
            actor=actor,
            target_type="user",
            target_id=target_id,
            reason=reason or None,
            details={
                "from": status_change[0],
                "to": status_change[1],
                "username": username,
                "revoked_sessions": revoked,
            },
        )
    elif reason_changed:
        event_service.record_event(
            db,
            category=event_service.CATEGORY_ADMIN,
            event_type="admin.user_block_reason_updated",
            actor=actor,
            target_type="user",
            target_id=target_id,
            details={"username": username},
        )

    db.refresh(target)
    return target


def delete_user(
    db: Session, actor: User, target: User, *, reason: str | None = None
) -> None:
    if target.id == actor.id:
        _forbidden(
            db,
            actor,
            target,
            "You cannot delete your own account here",
            "delete",
        )
    if target.role != ROLE_USER:
        _forbidden(
            db,
            actor,
            target,
            "Only ordinary user accounts can be deleted",
            "delete",
        )
    target_id = target.id
    snapshot = {"username": target.username, "role": target.role}
    # Database cascades remove sessions, cart, orders, builds, reviews and
    # favorites. `site_events` and `sales_line_facts` have no FK on purpose and
    # therefore keep the audit trail and the historical sales facts.
    db.delete(target)
    db.flush()
    event_service.record_event(
        db,
        category=event_service.CATEGORY_ADMIN,
        event_type="admin.user_deleted",
        actor=actor,
        target_type="user",
        target_id=target_id,
        reason=reason,
        details=snapshot,
    )
