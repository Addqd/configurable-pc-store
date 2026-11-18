"""Audit journal with an independent transaction.

`site_events` deliberately has no foreign key to `users`/`orders`, so the journal
survives account deletion. Events are written through a short-lived session of
their own: a rejected business operation (which rolls the request session back)
must still leave an audit trail, while a failing audit write must never break a
business operation. `event_key` de-duplicates retried idempotent operations.

Never store credentials, tokens, cookies or unnecessary personal data here.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models import SiteEvent, User
from app.services.sql_utils import like_pattern

log = logging.getLogger(__name__)

CATEGORY_AUTH = "auth"
CATEGORY_ACCOUNT = "account"
CATEGORY_ORDER = "order"
CATEGORY_BUILD = "build"
CATEGORY_REVIEW = "review"
CATEGORY_ADMIN = "admin"
CATEGORY_CATALOG = "catalog"
CATEGORY_SYSTEM = "system"

EVENT_CATEGORIES = (
    CATEGORY_AUTH,
    CATEGORY_ACCOUNT,
    CATEGORY_ORDER,
    CATEGORY_BUILD,
    CATEGORY_REVIEW,
    CATEGORY_ADMIN,
    CATEGORY_CATALOG,
    CATEGORY_SYSTEM,
)
OUTCOME_SUCCESS = "success"
OUTCOME_FAILURE = "failure"
EVENT_OUTCOMES = (OUTCOME_SUCCESS, OUTCOME_FAILURE)

# Keys that would turn the journal into a secret store are dropped entirely.
_SENSITIVE_KEY_PARTS = (
    "password",
    "passwd",
    "secret",
    "token",
    "cookie",
    "authorization",
    "credential",
    "hash",
    "api_key",
    "apikey",
    "session_id",
)
_MAX_KEY_LENGTH = 64
_MAX_STRING_LENGTH = 300
_MAX_ITEMS = 20
_MAX_DEPTH = 2


def _sanitize_value(value: object, depth: int) -> object:
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        cleaned = " ".join(value.split())
        return cleaned[:_MAX_STRING_LENGTH]
    if isinstance(value, int | float):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict) and depth < _MAX_DEPTH:
        return _sanitize_mapping(value, depth + 1)
    if isinstance(value, list | tuple) and depth < _MAX_DEPTH:
        return [_sanitize_value(item, depth + 1) for item in value[:_MAX_ITEMS]]
    # Unknown objects are never serialized into the journal.
    return None


def _sanitize_mapping(mapping: dict[Any, Any], depth: int) -> dict[str, object]:
    cleaned: dict[str, object] = {}
    for raw_key, value in mapping.items():
        key = str(raw_key)[:_MAX_KEY_LENGTH]
        lowered = key.lower()
        if any(part in lowered for part in _SENSITIVE_KEY_PARTS):
            continue
        cleaned[key] = _sanitize_value(value, depth)
    return cleaned


def sanitize_details(details: dict[str, Any] | None) -> dict[str, object]:
    """Return a JSON-object-safe copy with secrets and oversized values removed."""
    if not details:
        return {}
    return _sanitize_mapping(details, 0)


def _event_session(db: Session) -> Session:
    # Bound to the request session's bind: a separate connection (and therefore
    # a separate transaction) against an Engine, a separate SAVEPOINT when the
    # application is bound to an existing test connection.
    return Session(
        bind=db.get_bind(),
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )


def record_event(
    db: Session,
    *,
    category: str,
    event_type: str,
    outcome: str = OUTCOME_SUCCESS,
    actor: User | None = None,
    actor_user_id: int | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    reason: str | None = None,
    details: dict[str, Any] | None = None,
    event_key: str | None = None,
) -> bool:
    """Persist one journal entry; returns False if the audit write failed."""
    if category not in EVENT_CATEGORIES:
        raise ValueError(f"Unknown event category: {category}")
    if outcome not in EVENT_OUTCOMES:
        raise ValueError(f"Unknown event outcome: {outcome}")
    if actor is not None:
        actor_user_id = actor.id
        actor_role = actor.role
    values: dict[str, Any] = {
        "event_key": event_key,
        "actor_user_id": actor_user_id,
        "actor_role": actor_role,
        "category": category,
        "event_type": event_type[:80],
        "outcome": outcome,
        "target_type": target_type[:32] if target_type else None,
        "target_id": target_id,
        "reason": " ".join(reason.split())[:_MAX_STRING_LENGTH] if reason else None,
        "details": sanitize_details(details),
    }
    session = _event_session(db)
    try:
        statement = insert(SiteEvent).values(**values)
        if event_key:
            statement = statement.on_conflict_do_nothing(index_elements=["event_key"])
        written = session.scalar(statement.returning(SiteEvent.id))
        session.commit()
        return written is not None
    except SQLAlchemyError:
        session.rollback()
        # Audit problems are logged, never surfaced as business failures.
        log.warning("site event %s was not recorded", event_type, exc_info=True)
        return False
    finally:
        session.close()


EVENT_SORT_ORDERS: dict[str, tuple[Any, ...]] = {
    "occurred_desc": (SiteEvent.occurred_at.desc(), SiteEvent.id.desc()),
    "occurred_asc": (SiteEvent.occurred_at.asc(), SiteEvent.id.asc()),
}
DEFAULT_EVENT_SORT = "occurred_desc"


def _event_date_clauses(date_from: date | None, date_to: date | None) -> list[Any]:
    clauses: list[Any] = []
    if date_from is not None:
        clauses.append(
            SiteEvent.occurred_at >= datetime.combine(date_from, time.min, tzinfo=UTC)
        )
    if date_to is not None:
        clauses.append(
            SiteEvent.occurred_at
            < datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        )
    return clauses


def list_events(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 50,
    q: str | None = None,
    category: str | None = None,
    outcome: str | None = None,
    event_type: str | None = None,
    actor_user_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: str = DEFAULT_EVENT_SORT,
) -> tuple[list[SiteEvent], int]:
    """Read-only journal query with deterministic ordering and pagination."""
    statement = select(SiteEvent.id)
    if category:
        statement = statement.where(SiteEvent.category == category)
    if outcome:
        statement = statement.where(SiteEvent.outcome == outcome)
    if event_type:
        statement = statement.where(SiteEvent.event_type == event_type)
    if actor_user_id is not None:
        statement = statement.where(SiteEvent.actor_user_id == actor_user_id)
    if target_type:
        statement = statement.where(SiteEvent.target_type == target_type)
    if target_id is not None:
        statement = statement.where(SiteEvent.target_id == target_id)
    if q and q.strip():
        pattern = like_pattern(q)
        statement = statement.where(
            or_(
                SiteEvent.event_type.ilike(pattern, escape="\\"),
                SiteEvent.reason.ilike(pattern, escape="\\"),
                SiteEvent.target_type.ilike(pattern, escape="\\"),
            )
        )
    statement = statement.where(*_event_date_clauses(date_from, date_to))
    total = int(db.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    order_by = EVENT_SORT_ORDERS.get(sort, EVENT_SORT_ORDERS[DEFAULT_EVENT_SORT])
    ids = list(
        db.scalars(
            statement.order_by(*order_by)
            .limit(page_size)
            .offset((page - 1) * page_size)
        ).all()
    )
    events: list[SiteEvent] = []
    if ids:
        loaded = db.scalars(select(SiteEvent).where(SiteEvent.id.in_(ids))).all()
        by_id = {event.id: event for event in loaded}
        events = [by_id[event_id] for event_id in ids if event_id in by_id]
    return events, total


def filter_options(db: Session) -> tuple[list[str], list[str], list[str]]:
    categories = list(
        db.scalars(
            select(SiteEvent.category).distinct().order_by(SiteEvent.category)
        ).all()
    )
    event_types = list(
        db.scalars(
            select(SiteEvent.event_type).distinct().order_by(SiteEvent.event_type)
        ).all()
    )
    outcomes = list(
        db.scalars(
            select(SiteEvent.outcome).distinct().order_by(SiteEvent.outcome)
        ).all()
    )
    return categories, event_types, outcomes
