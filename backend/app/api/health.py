"""Real PostgreSQL connectivity diagnostic with a safe OpenAPI contract."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db_session

router = APIRouter(tags=["health"])


class DatabaseHealthResponse(BaseModel):
    status: Literal["ok"]
    database: Literal["connected"]


@router.get("/health/db", response_model=DatabaseHealthResponse)
def health_db(
    db: Annotated[Session, Depends(get_db_session)],
) -> DatabaseHealthResponse:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="database unavailable") from exc
    return DatabaseHealthResponse(status="ok", database="connected")
