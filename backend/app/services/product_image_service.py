"""Product image storage in a controlled, project-local media directory.

Every uploaded file is identified by its real content (magic bytes), stored under
a server-generated random name, and served only through the strict media route.
The original filename and client content type are never trusted.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import NoReturn
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.security import get_settings
from app.models import Product, ProductImage, User
from app.schemas.admin_products import MAX_IMAGE_COUNT, AdminProductImageOut
from app.services import event_service
from app.services.errors import (
    ConflictError,
    InvalidInputError,
    NotFoundError,
    PayloadTooLargeError,
)

MEDIA_URL_PREFIX = "/media/products"
MEDIA_SUBDIRECTORY = "products"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
_CHUNK_SIZE = 64 * 1024
FILENAME_RE = re.compile(r"[0-9a-f]{32}\.(?:jpg|png|webp)")
_EXTENSIONS = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


def media_root() -> Path:
    return Path(get_settings().media_root)


def media_directory() -> Path:
    return media_root() / MEDIA_SUBDIRECTORY


def detect_image_type(head: bytes) -> str | None:
    """Return the extension implied by the file signature, or None."""
    if head.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    return None


def content_type_for(filename: str) -> str:
    return _EXTENSIONS.get(
        filename.rsplit(".", 1)[-1].lower(), "application/octet-stream"
    )


def resolve_media_path(filename: str) -> Path | None:
    """Map a strict media filename to an existing file inside the media root."""
    if FILENAME_RE.fullmatch(filename) is None:
        return None
    root = media_root().resolve()
    target = (root / MEDIA_SUBDIRECTORY / filename).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        return None
    return target


def _remove_managed_file(url: str) -> None:
    prefix = MEDIA_URL_PREFIX + "/"
    if not url.startswith(prefix):
        return
    filename = url[len(prefix) :]
    if FILENAME_RE.fullmatch(filename) is None:
        return
    path = resolve_media_path(filename)
    if path is not None:
        path.unlink(missing_ok=True)


def _sorted_rows(product: Product) -> list[ProductImage]:
    return sorted(product.images, key=lambda image: (image.sort_order, image.id))


def list_images(product: Product) -> list[AdminProductImageOut]:
    return [
        AdminProductImageOut(
            id=row.id,
            url=row.image_url,
            alt_text=row.alt_text,
            sort_order=row.sort_order,
            is_cover=index == 0,
        )
        for index, row in enumerate(_sorted_rows(product))
    ]


def _next_sort_order(product: Product) -> int:
    rows = _sorted_rows(product)
    return rows[-1].sort_order + 1 if rows else 0


def _clean_alt_text(alt_text: str | None) -> str | None:
    if alt_text is None:
        return None
    cleaned = " ".join(alt_text.split())
    if not cleaned:
        return None
    if len(cleaned) > 255:
        raise InvalidInputError("Alt text must be at most 255 characters")
    return cleaned


def _reject_upload(
    db: Session,
    actor: User,
    product: Product,
    reason: str,
    error: ConflictError | InvalidInputError | PayloadTooLargeError,
) -> NoReturn:
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_image_upload_failed",
        outcome=event_service.OUTCOME_FAILURE,
        actor=actor,
        target_type="product",
        target_id=product.id,
        reason=reason,
    )
    raise error


def save_upload(
    db: Session,
    actor: User,
    product: Product,
    upload: UploadFile,
    alt_text: str | None = None,
) -> AdminProductImageOut:
    if len(product.images) >= MAX_IMAGE_COUNT:
        _reject_upload(
            db,
            actor,
            product,
            f"A product can have at most {MAX_IMAGE_COUNT} images",
            ConflictError(f"A product can have at most {MAX_IMAGE_COUNT} images"),
        )
    head = upload.file.read(_CHUNK_SIZE)
    if not head:
        _reject_upload(
            db,
            actor,
            product,
            "Uploaded file is empty",
            InvalidInputError("Uploaded file is empty"),
        )
    extension = detect_image_type(head)
    if extension is None:
        _reject_upload(
            db,
            actor,
            product,
            "Unsupported image format",
            InvalidInputError("Unsupported image format: JPEG, PNG or WebP required"),
        )
    size = len(head)
    if size > MAX_IMAGE_BYTES:
        _reject_upload(
            db,
            actor,
            product,
            "Image exceeds the size limit",
            PayloadTooLargeError("Image must not exceed 5 MB"),
        )

    directory = media_directory()
    directory.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{extension}"
    target = directory / filename
    temporary = target.with_name(target.name + ".part")
    try:
        with temporary.open("wb") as handle:
            handle.write(head)
            while True:
                chunk = upload.file.read(_CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_IMAGE_BYTES:
                    temporary.unlink(missing_ok=True)
                    _reject_upload(
                        db,
                        actor,
                        product,
                        "Image exceeds the size limit",
                        PayloadTooLargeError("Image must not exceed 5 MB"),
                    )
                handle.write(chunk)
        temporary.replace(target)
    except PayloadTooLargeError:
        temporary.unlink(missing_ok=True)
        raise
    except OSError:
        temporary.unlink(missing_ok=True)
        _reject_upload(
            db,
            actor,
            product,
            "Could not store the uploaded image",
            InvalidInputError("Could not store the uploaded image"),
        )

    image = ProductImage(
        product_id=product.id,
        image_url=f"{MEDIA_URL_PREFIX}/{filename}",
        alt_text=_clean_alt_text(alt_text),
        sort_order=_next_sort_order(product),
    )
    db.add(image)
    try:
        db.flush()
    except SQLAlchemyError:
        # Never leave an orphaned file behind when the row cannot be stored.
        target.unlink(missing_ok=True)
        raise
    db.refresh(product, ["images"])
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_image_added",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"image_id": image.id, "sort_order": image.sort_order},
    )
    for stored in list_images(product):
        if stored.id == image.id:
            return stored
    raise NotFoundError("Image not found")


def delete_image(db: Session, actor: User, product: Product, image_id: int) -> None:
    image = db.get(ProductImage, image_id)
    if image is None or image.product_id != product.id:
        raise NotFoundError("Image not found")
    url = image.image_url
    db.delete(image)
    db.flush()
    _remove_managed_file(url)
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_image_deleted",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"image_id": image_id},
    )


def reorder_images(
    db: Session, actor: User, product: Product, image_ids: list[int]
) -> list[AdminProductImageOut]:
    if len(set(image_ids)) != len(image_ids):
        raise InvalidInputError("Duplicate image ids")
    rows = {row.id: row for row in product.images}
    if set(image_ids) != set(rows):
        raise InvalidInputError("Every product image must be listed exactly once")
    # Two phases with a safe positive offset keep `uq_product_images_order`
    # satisfied while sort orders are shuffled (negative values are rejected by
    # ck_product_images_sort_order_nonnegative).
    offset = max((row.sort_order for row in rows.values()), default=0) + len(rows) + 1
    for index, image_id in enumerate(image_ids):
        rows[image_id].sort_order = offset + index
    db.flush()
    for index, image_id in enumerate(image_ids):
        rows[image_id].sort_order = index
    db.flush()
    db.refresh(product, ["images"])
    event_service.record_event(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_images_reordered",
        actor=actor,
        target_type="product",
        target_id=product.id,
        details={"image_ids": image_ids},
    )
    return list_images(product)
