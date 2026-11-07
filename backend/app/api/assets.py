"""Serve the exact project placeholder; never substitute an invented image."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

router = APIRouter(tags=["assets"])
_PLACEHOLDER = Path(__file__).resolve().parent / "assets" / "product-placeholder.jpg"


@router.get("/api/v1/assets/product-placeholder.jpg")
def get_product_placeholder() -> FileResponse:
    if not _PLACEHOLDER.is_file():
        raise HTTPException(status_code=503, detail="Product placeholder unavailable")
    return FileResponse(_PLACEHOLDER, media_type="image/jpeg")
