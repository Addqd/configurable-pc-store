import math
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.builds import router as builds_router
from app.api.cart import router as cart_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.media import router as media_router
from app.api.social import router as social_router
from app.services.errors import ServiceError

app = FastAPI(title="PC Builder & Store API")

app.include_router(health_router)
app.include_router(assets_router)
app.include_router(media_router)
app.include_router(catalog_router)
app.include_router(auth_router)
app.include_router(builds_router)
app.include_router(cart_router)
app.include_router(social_router)
app.include_router(admin_router)


@app.exception_handler(ServiceError)
def handle_service_error(request: Request, exc: ServiceError) -> JSONResponse:
    """Map expected service failures to consistent, documented HTTP errors."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


def _without_non_finite(value: Any) -> Any:
    """Replace `NaN`/`Infinity` with their literal text, recursively.

    Pydantic reports the rejected input in its errors, and a JSON document may
    carry the `NaN`/`Infinity` literals (they are accepted by Python's decoder but
    not emitted by `json.dumps`). Such an input must not make the *error response*
    unrenderable.
    """
    if isinstance(value, float):
        return value if math.isfinite(value) else str(value)
    if isinstance(value, dict):
        return {key: _without_non_finite(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_without_non_finite(item) for item in value]
    return value


@app.exception_handler(RequestValidationError)
def handle_request_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Keep every malformed request a 422.

    The default handler echoes the submitted input verbatim; when that input holds
    a non-finite float, rendering the response raises and the client sees HTTP 500
    instead of the validation error.
    """
    detail = _without_non_finite(jsonable_encoder(exc.errors()))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": detail},
    )


@app.get("/")
async def root():
    return {"message": "Backend is running!"}
