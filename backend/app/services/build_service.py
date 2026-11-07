"""Saved build CRUD and pricing service."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Product, SavedBuild, SavedBuildItem, User


def list_builds(db: Session, user_id: int) -> list[SavedBuild]:
    """List all builds for a user."""
    return list(
        db.scalars(
            select(SavedBuild)
            .where(SavedBuild.user_id == user_id)
            .order_by(SavedBuild.updated_at.desc())
        ).all()
    )


def get_build(db: Session, build_id: int, user_id: int) -> SavedBuild | None:
    """Get a build by ID, verifying ownership."""
    return db.execute(
        select(SavedBuild).where(
            SavedBuild.id == build_id, SavedBuild.user_id == user_id
        )
    ).scalar_one_or_none()


def create_build(
    db: Session,
    user: User,
    name: str,
    description: str,
    items: list[dict],
) -> SavedBuild:
    """Create a new saved build."""
    build = SavedBuild(
        user_id=user.id,
        name=name,
        description=description,
    )
    db.add(build)
    db.flush()

    for item in items:
        build_item = SavedBuildItem(
            build_id=build.id,
            slot=item["slot"],
            product_id=item["product_id"],
        )
        db.add(build_item)

    db.flush()
    db.refresh(build)
    return build


def update_build(
    db: Session,
    build: SavedBuild,
    name: str | None = None,
    description: str | None = None,
    items: list[dict] | None = None,
) -> SavedBuild:
    """Update a build's metadata and/or items."""
    if name is not None:
        build.name = name
    if description is not None:
        build.description = description

    if items is not None:
        # Replace all items
        db.execute(
            SavedBuildItem.__table__.delete().where(SavedBuildItem.build_id == build.id)
        )
        for item in items:
            build_item = SavedBuildItem(
                build_id=build.id,
                slot=item["slot"],
                product_id=item["product_id"],
            )
            db.add(build_item)

    build.updated_at = datetime.now(UTC)
    db.flush()
    db.refresh(build)
    return build


def delete_build(db: Session, build: SavedBuild) -> None:
    """Delete a build (cascade removes items)."""
    db.delete(build)
    db.flush()


def get_build_with_items(db: Session, build_id: int) -> SavedBuild | None:
    """Get a build with its items loaded."""
    return db.execute(
        select(SavedBuild).where(SavedBuild.id == build_id)
    ).scalar_one_or_none()


def calculate_build_total(db: Session, build_id: int) -> dict:
    """Calculate total price for a build."""
    items = db.execute(
        select(SavedBuildItem, Product.price)
        .join(Product, SavedBuildItem.product_id == Product.id)
        .where(SavedBuildItem.build_id == build_id)
    ).all()

    total = 0.0
    count = 0
    for item, price in items:
        total += float(price)
        count += 1

    return {
        "build_id": build_id,
        "total_price": total,
        "item_count": count,
    }
