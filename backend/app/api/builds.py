"""Saved builds API: CRUD, compatibility, pricing."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserDep, get_current_user
from app.db.session import get_db_session
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
from app.services import build_service as build_svc
from app.services import compatibility as compat_svc

router = APIRouter(prefix="/api/v1/builds", tags=["builds"])


@router.get("", response_model=list[SavedBuildOut], summary="List user's builds")
def list_builds(
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> list[SavedBuildOut]:
    """List all saved builds for the current user."""
    builds = build_svc.list_builds(db, current_user.id)
    return [
        SavedBuildOut(
            id=b.id,
            user_id=b.user_id,
            name=b.name,
            description=b.description,
            image_url=b.image_url,
            version=b.version,
            created_at=b.created_at,
            updated_at=b.updated_at,
            items=[
                BuildItemOut(
                    slot=bi.slot,
                    product_id=bi.product_id,
                    product_name=bi.product.name if bi.product else "",
                    product_slug=bi.product.slug if bi.product else "",
                    price=float(bi.product.price)
                    if bi.product and bi.product.price
                    else 0.0,
                )
                for bi in b.items
            ],
        )
        for b in builds
    ]


@router.post("", response_model=SavedBuildOut, summary="Create a build")
def create_build(
    body: SavedBuildCreate,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SavedBuildOut:
    """Create a new saved build with optional items."""
    # Validate slots are unique
    slot_set = set()
    for item in body.items:
        if item.slot in slot_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate slot: {item.slot}",
            )
        slot_set.add(item.slot)

    build = build_svc.create_build(
        db,
        user=current_user,
        name=body.name,
        description=body.description or "",
        items=[{"slot": i.slot, "product_id": i.product_id} for i in body.items],
    )

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
                slot=bi.slot,
                product_id=bi.product_id,
                product_name=bi.product.name if bi.product else "",
                product_slug=bi.product.slug if bi.product else "",
                price=float(bi.product.price)
                if bi.product and bi.product.price
                else 0.0,
            )
            for bi in build.items
        ],
    )


@router.get("/{build_id}", response_model=SavedBuildOut, summary="Get a build")
def get_build(
    build_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SavedBuildOut:
    """Get a specific build by ID (ownership enforced)."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

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
                slot=bi.slot,
                product_id=bi.product_id,
                product_name=bi.product.name if bi.product else "",
                product_slug=bi.product.slug if bi.product else "",
                price=float(bi.product.price)
                if bi.product and bi.product.price
                else 0.0,
            )
            for bi in build.items
        ],
    )


@router.put("/{build_id}", response_model=SavedBuildOut, summary="Update a build")
def update_build(
    build_id: int,
    body: SavedBuildUpdate,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SavedBuildOut:
    """Update build name and/or description."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    updated = build_svc.update_build(
        db,
        build,
        name=body.name,
        description=body.description,
    )

    return SavedBuildOut(
        id=updated.id,
        user_id=updated.user_id,
        name=updated.name,
        description=updated.description,
        image_url=updated.image_url,
        version=updated.version,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
        items=[
            BuildItemOut(
                slot=bi.slot,
                product_id=bi.product_id,
                product_name=bi.product.name if bi.product else "",
                product_slug=bi.product.slug if bi.product else "",
                price=float(bi.product.price)
                if bi.product and bi.product.price
                else 0.0,
            )
            for bi in updated.items
        ],
    )


@router.post(
    "/{build_id}/items", response_model=SavedBuildOut, summary="Update build items"
)
def update_build_items(
    build_id: int,
    body: BuildUpdateItemsRequest,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> SavedBuildOut:
    """Replace all items in a build."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    # Validate unique slots
    slot_set = set()
    for item in body.items:
        if item.slot in slot_set:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate slot: {item.slot}",
            )
        slot_set.add(item.slot)

    updated = build_svc.update_build(
        db,
        build,
        items=[{"slot": i.slot, "product_id": i.product_id} for i in body.items],
    )

    return SavedBuildOut(
        id=updated.id,
        user_id=updated.user_id,
        name=updated.name,
        description=updated.description,
        image_url=updated.image_url,
        version=updated.version,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
        items=[
            BuildItemOut(
                slot=bi.slot,
                product_id=bi.product_id,
                product_name=bi.product.name if bi.product else "",
                product_slug=bi.product.slug if bi.product else "",
                price=float(bi.product.price)
                if bi.product and bi.product.price
                else 0.0,
            )
            for bi in updated.items
        ],
    )


@router.delete(
    "/{build_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a build"
)
def delete_build(
    build_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> None:
    """Delete a saved build (ownership enforced)."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )
    build_svc.delete_build(db, build)


@router.get(
    "/{build_id}/compatibility",
    response_model=BuildCompatibilityOut,
    summary="Check build compatibility",
)
def check_compatibility(
    build_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BuildCompatibilityOut:
    """Check compatibility of all items in a build."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    result = compat_svc.check_build_compatibility(db, build)
    return BuildCompatibilityOut(
        build_id=build_id,
        overall_status=result.status,
        items=[
            CompatibilityStatus(
                product_id=r.product_id,
                product_name="",
                slot=r.slot,
                status=r.status,
                message=r.message,
            )
            for r in (result.items or [])
        ],
    )


@router.get(
    "/{build_id}/total", response_model=BuildTotalOut, summary="Calculate build total"
)
def calculate_total(
    build_id: int,
    current_user: CurrentUserDep = Depends(get_current_user),
    db: Session = Depends(get_db_session),
) -> BuildTotalOut:
    """Calculate total price for a build."""
    build = build_svc.get_build(db, build_id, current_user.id)
    if build is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Build not found",
        )

    total = build_svc.calculate_build_total(db, build_id)
    return BuildTotalOut(
        build_id=build_id,
        total_price=total["total_price"],
        item_count=total["item_count"],
    )
