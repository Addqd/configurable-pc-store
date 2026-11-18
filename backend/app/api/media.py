"""Serve administratively uploaded product images from the controlled media root.

Only opaque, server-generated filenames resolve; every other path is a 404.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.product_image_service import (
    content_type_for,
    resolve_media_path,
)

router = APIRouter(tags=["media"])


@router.get("/media/products/{filename}")
def get_product_image(filename: str) -> FileResponse:
    path = resolve_media_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        path,
        media_type=content_type_for(filename),
        headers={
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "public, max-age=86400",
        },
    )
