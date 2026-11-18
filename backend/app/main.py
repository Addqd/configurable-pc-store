from fastapi import FastAPI, Request
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


@app.get("/")
async def root():
    return {"message": "Backend is running!"}
