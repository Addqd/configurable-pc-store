"""Product image storage in a controlled, project-local media directory.

Every uploaded file is identified by its real content (magic bytes), stored under
a server-generated random name, and served only through the strict media route.
The original filename and client content type are never trusted.

Files follow the database transaction that owns them: an uploaded file is
removed again when that transaction rolls back, and a deleted image file is only
unlinked after the outermost transaction commits. Nested SAVEPOINTs keep their
own file operations, so rolling back a SAVEPOINT neither deletes the image an
outer commit keeps nor keeps the file whose row the SAVEPOINT discarded. A
transaction that ends without committing — rolled back, or abandoned by
`Session.close()` without an explicit rollback — leaves no uploaded file behind
and applies no queued deletion. The staging file and the final file both live
inside the configured media root, never in a system temporary directory.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import NoReturn
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy import event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, SessionTransaction

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

MEDIA_URL_PREFIX = "/api/v1/media/products"
# Rows stored before the media route moved under `/api/v1` keep working, and
# their files are still cleaned up when such a row is deleted.
LEGACY_MEDIA_URL_PREFIX = "/media/products"
_MEDIA_URL_PREFIXES = (MEDIA_URL_PREFIX + "/", LEGACY_MEDIA_URL_PREFIX + "/")
MEDIA_SUBDIRECTORY = "products"
MAX_IMAGE_BYTES = 5 * 1024 * 1024
_CHUNK_SIZE = 64 * 1024
FILENAME_RE = re.compile(r"[0-9a-f]{32}\.(?:jpg|png|webp)")
_EXTENSIONS = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
_PENDING_FILES_KEY = "product_image_files"

log = logging.getLogger(__name__)


@dataclass
class _PendingFiles:
    """Managed files whose fate depends on how one transaction ends."""

    created: list[Path] = field(default_factory=list)
    deletions: list[Path] = field(default_factory=list)


# Files are tracked per `SessionTransaction`, never per `Session`: a SAVEPOINT
# decides only about the files it created or deleted itself. `None` collects
# operations queued before the session's first transaction started; they belong
# to the first transaction that settles.
_FileBuckets = dict[SessionTransaction | None, _PendingFiles]


def _file_buckets(db: Session) -> _FileBuckets:
    buckets = db.info.get(_PENDING_FILES_KEY)
    if not isinstance(buckets, dict):
        buckets = {}
        db.info[_PENDING_FILES_KEY] = buckets
    return buckets


def _bucket(
    buckets: _FileBuckets, transaction: SessionTransaction | None
) -> _PendingFiles:
    pending = buckets.get(transaction)
    if pending is None:
        pending = _PendingFiles()
        buckets[transaction] = pending
    return pending


def _current_transaction(db: Session) -> SessionTransaction | None:
    """Innermost transaction that owns a new file operation."""
    return db.get_nested_transaction() or db.get_transaction()


def _discard_pending_files(
    buckets: _FileBuckets, transaction: SessionTransaction
) -> None:
    """Drop the file state of a transaction that never reached `after_commit`.

    The bucket is popped before anything is unlinked, so the rollback hook and the
    `after_transaction_end` fallback may both call this and still handle every
    operation exactly once.
    """
    discarded = [buckets.pop(transaction, None)]
    if transaction.parent is None:
        # Operations queued before the transaction started belong to its work.
        discarded.append(buckets.pop(None, None))
    for pending in discarded:
        if pending is None:
            continue
        for path in pending.created:
            _unlink_quietly(path)


def _merge_files(target: _PendingFiles, source: _PendingFiles | None) -> None:
    if source is None:
        return
    for path in source.created:
        if path not in target.created:
            target.created.append(path)
    for path in source.deletions:
        if path not in target.deletions:
            target.deletions.append(path)


def _unlink_quietly(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except OSError:  # pragma: no cover - leftover file must not fail a response
        log.warning("product image file %s could not be removed", path, exc_info=True)


@event.listens_for(Session, "after_commit")
def _settle_files_of_committed_transaction(session: Session) -> None:
    """Merge a committed SAVEPOINT, settle the outermost commit.

    `after_commit` also fires when a SAVEPOINT is released, including the audit
    SAVEPOINTs of `event_service.record_event()`. Those only hand their files to
    the enclosing transaction; created files stay and deletions run once, after
    the outermost transaction of the session committed.
    """
    buckets = session.info.get(_PENDING_FILES_KEY)
    if not isinstance(buckets, dict):
        return
    # `close()` resets these attributes only after this event, so inside the
    # event they still point at the transaction that was just committed.
    transaction = session.get_nested_transaction() or session.get_transaction()
    if transaction is None:
        return
    pending = buckets.pop(transaction, None)
    if transaction.nested:
        _merge_files(_bucket(buckets, transaction.parent), pending)
        return
    settled = _PendingFiles()
    _merge_files(settled, pending)
    # Operations that predate the transaction were part of its unit of work.
    _merge_files(settled, buckets.pop(None, None))
    for path in settled.deletions:
        _unlink_quietly(path)


@event.listens_for(Session, "after_soft_rollback")
def _discard_files_of_rolled_back_transaction(
    session: Session, previous_transaction: SessionTransaction | None
) -> None:
    """Drop the deletions of a rolled back transaction, remove its new files.

    A nested rollback touches only its own files: the enclosing transaction is
    still free to commit, and the rows it restores keep their images.
    """
    buckets = session.info.get(_PENDING_FILES_KEY)
    if not isinstance(buckets, dict) or previous_transaction is None:
        return
    _discard_pending_files(buckets, previous_transaction)


@event.listens_for(Session, "after_transaction_end")
def _discard_files_of_abandoned_transaction(
    session: Session, transaction: SessionTransaction
) -> None:
    """Settle a transaction that ends without committing.

    `Session.close()` ends every open transaction of the session without emitting
    `after_soft_rollback`, so a pending upload would stay on disk and a pending
    deletion would wait for a commit that can no longer happen. `after_commit`
    runs before this event and pops the bucket of a committed transaction, so a
    bucket still present here belongs to a transaction that was rolled back or
    abandoned by `close()`: its new files are removed, its deletions discarded,
    and the files of an enclosing transaction are left alone. The rollback hook
    runs afterwards and finds nothing left to settle.
    """
    buckets = session.info.get(_PENDING_FILES_KEY)
    if not isinstance(buckets, dict):
        return
    _discard_pending_files(buckets, transaction)


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


def queue_created_file(db: Session, path: Path) -> None:
    """Remove `path` again if its transaction does not reach the outermost commit."""
    _bucket(_file_buckets(db), _current_transaction(db)).created.append(path)


def _managed_filename(url: str) -> str | None:
    """Return the strict filename of a managed media URL, if it is one."""
    for prefix in _MEDIA_URL_PREFIXES:
        if url.startswith(prefix):
            filename = url[len(prefix) :]
            return filename if FILENAME_RE.fullmatch(filename) else None
    return None


def queue_managed_file_deletion(db: Session, url: str) -> None:
    """Unlink the managed file behind `url` only after the outermost commit."""
    filename = _managed_filename(url)
    if filename is None:
        return
    path = resolve_media_path(filename)
    if path is not None:
        pending = _bucket(_file_buckets(db), _current_transaction(db)).deletions
        if path not in pending:
            pending.append(path)


def normalize_media_url(url: str) -> str:
    """Return the current media route for a stored managed image URL.

    Rows written before the media route moved under `/api/v1` still hold the
    legacy prefix, which the frontend proxy does not forward. Only a strict
    managed filename is rewritten; external URLs, the placeholder and any other
    path are returned unchanged, and no stored value is modified.
    """
    filename = _managed_filename(url)
    if filename is None:
        return url
    return f"{MEDIA_URL_PREFIX}/{filename}"


def _shared_managed_url(db: Session, url: str, image_id: int) -> bool:
    """True while another row still references the same managed file."""
    filename = _managed_filename(url)
    if filename is None:
        return False
    candidates = [
        f"{prefix}/{filename}" for prefix in (MEDIA_URL_PREFIX, LEGACY_MEDIA_URL_PREFIX)
    ]
    count = db.scalar(
        select(func.count())
        .select_from(ProductImage)
        .where(ProductImage.image_url.in_(candidates), ProductImage.id != image_id)
    )
    return bool(count)


def _sorted_rows(product: Product) -> list[ProductImage]:
    return sorted(product.images, key=lambda image: (image.sort_order, image.id))


def list_images(product: Product) -> list[AdminProductImageOut]:
    return [
        AdminProductImageOut(
            id=row.id,
            url=normalize_media_url(row.image_url),
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
    event_service.record_failure(
        db,
        category=event_service.CATEGORY_CATALOG,
        event_type="catalog.product_image_upload_failed",
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
        # Removed again if the surrounding transaction does not commit.
        queue_created_file(db, target)
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
    # The row is only really gone after the commit: keep the file until then so a
    # rolled back transaction cannot leave a row pointing at a missing image.
    # A file another row still points at is never unlinked.
    if not _shared_managed_url(db, url, image_id):
        queue_managed_file_deletion(db, url)
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
