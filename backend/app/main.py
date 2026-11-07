from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="PC Builder & Store API")

app.include_router(health_router)


@app.get("/")
async def root():
    return {"message": "Backend is running!"}
