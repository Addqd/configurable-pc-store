"""Static asset endpoints for product placeholder images."""

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(tags=["assets"])

# Path to the original placeholder JPEG
_ASSETS_DIR = Path(__file__).resolve().parents[3] / "frontend" / "src" / "assets"
_PLACEHOLDER_PATH = _ASSETS_DIR / "placeholder.jpg"


@router.get("/api/v1/assets/product-placeholder.jpg")
async def get_product_placeholder() -> Response:
    """Serve the original product placeholder image as JPEG."""
    if not _PLACEHOLDER_PATH.exists():
        # Fallback: try to read from the same directory
        fallback = (
            Path(__file__).resolve().parents[1] / "assets" / "product-placeholder.jpg"
        )
        if fallback.exists():
            content = fallback.read_bytes()
            return Response(
                content=content,
                media_type="image/jpeg",
            )
        # Return minimal valid JPEG
        import base64

        # Minimal 1x1 red JPEG
        jpeg_bytes = base64.b64decode(
            "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBD"
            "AAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwg"
            "JC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAB"
            "AAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAB"
            "AAAAAAAAAAAAAAAAAAABAv/aAAwDAQACEQMRAD8A"
        )
        return Response(content=jpeg_bytes, media_type="image/jpeg")

    content = _PLACEHOLDER_PATH.read_bytes()
    return Response(
        content=content,
        media_type="image/jpeg",
    )
