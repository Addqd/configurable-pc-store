"""API tests without credentials or destructive DB operations."""

from collections.abc import Iterator
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.db.session import get_db_session
from app.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


def test_root_returns_200(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "Backend is running!"}


def test_health_db_connected(client: TestClient) -> None:
    # Dependency override ensures a deterministic API test without touching DB.
    session = Mock()

    def fake_session() -> Iterator[Mock]:
        yield session

    app.dependency_overrides[get_db_session] = fake_session
    try:
        response = client.get("/health/db")
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "connected"}
        session.execute.assert_called_once()
    finally:
        app.dependency_overrides.pop(get_db_session, None)


def test_health_db_unavailable(client: TestClient) -> None:
    session = Mock()
    session.execute.side_effect = OperationalError("connection failed", None, None)

    def fake_session() -> Iterator[Mock]:
        yield session

    app.dependency_overrides[get_db_session] = fake_session
    try:
        response = client.get("/health/db")
        assert response.status_code == 503
        # Check a fixed, non-sensitive contract. Never embed the real password.
        assert response.json() == {"detail": "database unavailable"}
    finally:
        app.dependency_overrides.pop(get_db_session, None)


def test_openapi_has_health_route(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    route = response.json()["paths"]["/health/db"]["get"]
    assert "200" in route["responses"]
    assert route["responses"]["200"]["content"]["application/json"]["schema"]


def test_openapi_has_root_route(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "get" in response.json()["paths"]["/"]
