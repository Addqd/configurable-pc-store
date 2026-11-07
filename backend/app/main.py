from fastapi import FastAPI

from app.api.assets import router as assets_router
from app.api.auth import router as auth_router
from app.api.builds import router as builds_router
from app.api.cart import router as cart_router
from app.api.catalog import router as catalog_router
from app.api.health import router as health_router
from app.api.social import router as social_router

app = FastAPI(title="PC Builder & Store API")

app.include_router(health_router)
app.include_router(assets_router)
app.include_router(catalog_router)
app.include_router(auth_router)
app.include_router(builds_router)
app.include_router(cart_router)
app.include_router(social_router)


@app.get("/")
async def root():
    return {"message": "Backend is running!"}
