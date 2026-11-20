"""Administration API package.

The parent router requires the `admin` role; owner-only operations enforce the
`owner` role again inside their handlers, so a missing dependency can never grant
privileges. Role and account status are resolved from the database per request.
"""

from fastapi import APIRouter, Depends

from app.api.admin import events, products, reviews, stats, users
from app.api.deps import get_current_admin

router = APIRouter(
    prefix="/api/v1/admin",
    tags=["admin"],
    dependencies=[Depends(get_current_admin)],
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Administrator access required"},
    },
)
router.include_router(users.router)
router.include_router(products.router)
router.include_router(reviews.router)
router.include_router(events.router)
router.include_router(stats.router)
