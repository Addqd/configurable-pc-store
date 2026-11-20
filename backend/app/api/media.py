"""Serve administratively uploaded product images from the controlled media root.

Only opaque, server-generated filenames resolve; every other path is a 404.

The route lives under `/api/v1` so the images are reachable through the existing
`/api` frontend proxy without any URL rewriting on the client. The legacy
`/media/products/{filename}` path stays available read-only for image URLs that
were stored before this route moved, so old rows keep rendering.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.product_image_service import (
    MEDIA_URL_PREFIX,
    content_type_for,
    resolve_media_path,
)

router = APIRouter(tags=["media"])

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=86400",
}


@router.get("/media/products/{filename}", include_in_schema=False)
@router.get(f"{MEDIA_URL_PREFIX}/{{filename}}")
def get_product_image(filename: str) -> FileResponse:
    path = resolve_media_path(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        path,
        media_type=content_type_for(filename),
        headers=_SECURITY_HEADERS,
    )
