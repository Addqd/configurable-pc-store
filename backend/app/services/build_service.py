"""Private saved-build CRUD, independent slot validation, exact prices."""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, SavedBuild, SavedBuildItem, User
from app.services.compatibility import SLOT_CATEGORIES, check_slot_compatibility


def list_builds(db: Session, user_id: int) -> list[SavedBuild]:
    return list(
        db.scalars(
            select(SavedBuild)
            .where(SavedBuild.user_id == user_id)
            .order_by(SavedBuild.updated_at.desc(), SavedBuild.id.desc())
        ).all()
    )


def get_build(db: Session, build_id: int, user_id: int) -> SavedBuild | None:
    return db.scalar(
        select(SavedBuild).where(
            SavedBuild.id == build_id, SavedBuild.user_id == user_id
        )
    )


def validate_items(db: Session, items: list[dict]) -> None:
    if len(items) > len(SLOT_CATEGORIES):
        raise ValueError("Too many component slots")
    seen: set[str] = set()
    for item in items:
        slot, pid = item["slot"], item["product_id"]
        if slot in seen:
            raise ValueError(f"Duplicate slot: {slot}")
        seen.add(slot)
        result = check_slot_compatibility(db, pid, slot)
        if result.status != "compatible":
            raise ValueError(f"{slot}: {result.message}")


def _store_items(db: Session, build: SavedBuild, items: list[dict]) -> None:
    validate_items(db, items)
    db.execute(
        SavedBuildItem.__table__.delete().where(SavedBuildItem.build_id == build.id)
    )
    db.expire(build, ["items"])
    for item in items:
        db.add(
            SavedBuildItem(
                build_id=build.id, slot=item["slot"], product_id=item["product_id"]
            )
        )
    db.flush()
    db.expire(build, ["items"])


def create_build(
    db: Session, user: User, name: str, description: str, items: list[dict]
) -> SavedBuild:
    validate_items(db, items)
    build = SavedBuild(
        user_id=user.id, name=name.strip(), description=description.strip()
    )
    db.add(build)
    db.flush()
    _store_items(db, build, items)
    db.refresh(build)
    return build


def update_build(
    db: Session,
    build: SavedBuild,
    name: str | None = None,
    description: str | None = None,
    items: list[dict] | None = None,
) -> SavedBuild:
    if name is not None:
        if not name.strip():
            raise ValueError("Build name must not be empty")
        build.name = name.strip()
    if description is not None:
        build.description = description.strip()
    if items is not None:
        _store_items(db, build, items)
    build.updated_at = datetime.now(UTC)
    build.version += 1
    db.flush()
    db.refresh(build)
    return build


def delete_build(db: Session, build: SavedBuild) -> None:
    db.delete(build)
    db.flush()


def get_build_with_items(db: Session, build_id: int) -> SavedBuild | None:
    return db.get(SavedBuild, build_id)


def calculate_build_total(db: Session, build_id: int) -> dict:
    items = (
        db.execute(
            select(Product.price)
            .join(SavedBuildItem, SavedBuildItem.product_id == Product.id)
            .where(SavedBuildItem.build_id == build_id)
        )
        .scalars()
        .all()
    )
    return {
        "build_id": build_id,
        "total_price": sum(items, Decimal("0.00")),
        "item_count": len(items),
    }
