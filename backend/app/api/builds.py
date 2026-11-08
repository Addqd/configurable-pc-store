"""Owner-scoped saved PC builds endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.session import get_db_session
from app.models import SavedBuild, User
from app.schemas.build import (
    BuildCompatibilityOut,
    BuildItemOut,
    BuildTotalOut,
    BuildUpdateItemsRequest,
    CompatibilityStatus,
    SavedBuildCreate,
    SavedBuildOut,
    SavedBuildUpdate,
)
from app.services import build_service as svc
from app.services import compatibility as compatibility_svc

router = APIRouter(prefix="/api/v1/builds", tags=["builds"])


def _serialize(build: SavedBuild) -> SavedBuildOut:
    return SavedBuildOut(
        id=build.id,
        user_id=build.user_id,
        name=build.name,
        description=build.description,
        image_url=build.image_url,
        version=build.version,
        created_at=build.created_at,
        updated_at=build.updated_at,
        items=[
            BuildItemOut(
                slot=item.slot,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "",
                product_slug=item.product.slug if item.product else "",
                price=item.product.price if item.product else 0,
            )
            for item in build.items
        ],
    )


def _owned(db: Session, user: User, build_id: int) -> SavedBuild:
    found = svc.get_build(db, build_id, user.id)
    if found is None:
        raise HTTPException(status_code=404, detail="Build not found")
    return found


@router.get("", response_model=list[SavedBuildOut])
def list_builds(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> list[SavedBuildOut]:
    return [_serialize(build) for build in svc.list_builds(db, current_user.id)]


@router.post("", response_model=SavedBuildOut, status_code=201)
def create_build(
    body: SavedBuildCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> SavedBuildOut:
    try:
        build = svc.create_build(
            db,
            current_user,
            body.name,
            body.description,
            [i.model_dump() for i in body.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _serialize(build)


@router.post("/compatibility", response_model=BuildCompatibilityOut)
def check_current_compatibility(
    body: BuildUpdateItemsRequest,
    db: Session = Depends(get_db_session, scope="function"),
) -> BuildCompatibilityOut:
    selections = {item.slot: item.product_id for item in body.items}
    if len(selections) != len(body.items):
        raise HTTPException(status_code=422, detail="Duplicate component slot")
    result = compatibility_svc.check_selections(db, selections)
    return BuildCompatibilityOut(
        build_id=0,
        overall_status=result.status,
        items=[
            CompatibilityStatus(
                product_id=item.product_id,
                product_name=item.product_name,
                slot=item.slot,
                status=item.status,
                message=item.message,
            )
            for item in result.items or []
        ],
    )


@router.get("/{build_id}", response_model=SavedBuildOut)
def get_build(
    build_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> SavedBuildOut:
    return _serialize(_owned(db, current_user, build_id))


@router.put("/{build_id}", response_model=SavedBuildOut)
def update_build(
    build_id: int,
    body: SavedBuildUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> SavedBuildOut:
    try:
        build = svc.update_build(
            db,
            _owned(db, current_user, build_id),
            name=body.name,
            description=body.description,
            items=[item.model_dump() for item in body.items]
            if body.items is not None
            else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _serialize(build)


@router.post("/{build_id}/items", response_model=SavedBuildOut)
def update_build_items(
    build_id: int,
    body: BuildUpdateItemsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> SavedBuildOut:
    try:
        build = svc.update_build(
            db,
            _owned(db, current_user, build_id),
            items=[i.model_dump() for i in body.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return _serialize(build)


@router.delete("/{build_id}", status_code=204)
def delete_build(
    build_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> None:
    svc.delete_build(db, _owned(db, current_user, build_id))


@router.get("/{build_id}/compatibility", response_model=BuildCompatibilityOut)
def check_compatibility(
    build_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> BuildCompatibilityOut:
    build = _owned(db, current_user, build_id)
    result = compatibility_svc.check_build_compatibility(db, build)
    return BuildCompatibilityOut(
        build_id=build.id,
        overall_status=result.status,
        items=[
            CompatibilityStatus(
                product_id=item.product_id,
                product_name=item.product_name,
                slot=item.slot,
                status=item.status,
                message=item.message,
            )
            for item in result.items or []
        ],
    )


@router.get("/{build_id}/total", response_model=BuildTotalOut)
def calculate_total(
    build_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db_session, scope="function"),
) -> BuildTotalOut:
    _owned(db, current_user, build_id)
    return BuildTotalOut(**svc.calculate_build_total(db, build_id))
