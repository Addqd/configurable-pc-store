"""Audit journal with two explicit transaction paths.

`site_events` deliberately has no foreign key to `users`/`orders`, so the journal
survives account deletion. `event_key` de-duplicates retried idempotent
operations.

Success and failure entries have opposite transaction requirements, so they use
separate functions instead of one ambiguous helper:

* `record_event()` describes a committed business operation. The row is written
  through the caller's session and therefore participates in the business
  transaction: a rolled-back mutation never leaves a successful audit entry
  behind. The write happens inside a SAVEPOINT so a failing audit insert can
  never abort the business transaction.
* `record_failure()` describes a rejected attempt. It is written through an
  isolated session on its own connection (never a SAVEPOINT of the caller's
  connection) and committed immediately, because the business transaction rolls
  back right after the rejection and would otherwise erase the audit trail.

Never store credentials, tokens, cookies or unnecessary personal data here.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.engine import Connection, Engine
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


def _event_values(
    *,
    category: str,
    event_type: str,
    outcome: str,
    actor: User | None,
    actor_user_id: int | None,
    actor_role: str | None,
    target_type: str | None,
    target_id: int | None,
    reason: str | None,
    details: dict[str, Any] | None,
    event_key: str | None,
) -> dict[str, Any]:
    if category not in EVENT_CATEGORIES:
        raise ValueError(f"Unknown event category: {category}")
    if outcome not in EVENT_OUTCOMES:
        raise ValueError(f"Unknown event outcome: {outcome}")
    if actor is not None:
        actor_user_id = actor.id
        actor_role = actor.role
    return {
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


def _insert_event(session: Session, values: dict[str, Any]) -> bool:
    statement = insert(SiteEvent).values(**values)
    if values.get("event_key"):
        # A retried idempotent operation keeps a single journal entry.
        statement = statement.on_conflict_do_nothing(index_elements=["event_key"])
    return session.scalar(statement.returning(SiteEvent.id)) is not None


def _isolated_engine(db: Session) -> Engine:
    """Return an Engine that can open a connection of its own.

    When the application session is bound to a `Connection` (the isolated test
    fixtures), reusing that bind would only create a SAVEPOINT that the business
    rollback discards, so the owning Engine is used instead.
    """
    bind = db.get_bind()
    return bind.engine if isinstance(bind, Connection) else bind


def record_event(
    db: Session,
    *,
    category: str,
    event_type: str,
    actor: User | None = None,
    actor_user_id: int | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    reason: str | None = None,
    details: dict[str, Any] | None = None,
    event_key: str | None = None,
) -> bool:
    """Record a successful business operation inside the caller's transaction.

    The caller commits or rolls back as usual: the journal entry follows the
    business data. No commit is issued here.
    """
    values = _event_values(
        category=category,
        event_type=event_type,
        outcome=OUTCOME_SUCCESS,
        actor=actor,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=details,
        event_key=event_key,
    )
    # Pending business changes are flushed first, so an integrity error of the
    # business operation itself is never mistaken for an audit failure.
    db.flush()
    try:
        # SAVEPOINT: an audit failure must never abort the business transaction.
        with db.begin_nested():
            return _insert_event(db, values)
    except SQLAlchemyError:
        log.warning("site event %s was not recorded", event_type, exc_info=True)
        return False


def record_failure(
    db: Session,
    *,
    category: str,
    event_type: str,
    reason: str | None = None,
    actor: User | None = None,
    actor_user_id: int | None = None,
    actor_role: str | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    details: dict[str, Any] | None = None,
    event_key: str | None = None,
) -> bool:
    """Durably record a rejected or failed attempt in its own transaction.

    The business transaction is rolled back right after a rejection, so this
    entry is committed through an independent connection instead of joining it.
    """
    values = _event_values(
        category=category,
        event_type=event_type,
        outcome=OUTCOME_FAILURE,
        actor=actor,
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        details=details,
        event_key=event_key,
    )
    session = Session(bind=_isolated_engine(db), expire_on_commit=False)
    try:
        written = _insert_event(session, values)
        session.commit()
        return written
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
