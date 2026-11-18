"""`/api/v1/admin/events` — read-only audit journal queries."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminUserDep, DBSessionDep
from app.models import SiteEvent
from app.schemas.admin_events import (
    AdminEventCategory,
    AdminEventFilterOptionsOut,
    AdminEventOut,
    AdminEventOutcome,
    AdminEventSort,
    AdminPaginatedEventsOut,
)
from app.services import event_service as svc

router = APIRouter(prefix="/events", tags=["admin: events"])


def _event_out(event: SiteEvent) -> AdminEventOut:
    return AdminEventOut(
        id=event.id,
        event_key=event.event_key,
        occurred_at=event.occurred_at,
        actor_user_id=event.actor_user_id,
        actor_role=event.actor_role,
        category=event.category,
        event_type=event.event_type,
        outcome=event.outcome,
        target_type=event.target_type,
        target_id=event.target_id,
        reason=event.reason,
        details=event.details or {},
    )


@router.get("/filters", response_model=AdminEventFilterOptionsOut)
def get_filter_options(
    db: DBSessionDep, admin: AdminUserDep
) -> AdminEventFilterOptionsOut:
    categories, event_types, outcomes = svc.filter_options(db)
    return AdminEventFilterOptionsOut(
        categories=categories, event_types=event_types, outcomes=outcomes
    )


@router.get("", response_model=AdminPaginatedEventsOut)
def list_events(
    db: DBSessionDep,
    admin: AdminUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=200)] = 50,
    q: Annotated[str | None, Query(max_length=120)] = None,
    category: AdminEventCategory | None = None,
    outcome: AdminEventOutcome | None = None,
    event_type: Annotated[str | None, Query(max_length=80)] = None,
    actor_user_id: Annotated[int | None, Query(gt=0)] = None,
    target_type: Annotated[str | None, Query(max_length=32)] = None,
    target_id: Annotated[int | None, Query(gt=0)] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    sort: AdminEventSort = "occurred_desc",
) -> AdminPaginatedEventsOut:
    events, total = svc.list_events(
        db,
        page=page,
        page_size=page_size,
        q=q,
        category=category,
        outcome=outcome,
        event_type=event_type,
        actor_user_id=actor_user_id,
        target_type=target_type,
        target_id=target_id,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
    )
    return AdminPaginatedEventsOut(
        items=[_event_out(event) for event in events],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=max(1, (total + page_size - 1) // page_size),
    )
