"""Build CRUD/owner protection and no false positive compatibility."""

from secrets import token_hex

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.models import (
    Characteristic,
    ProductCharacteristic,
    SavedBuild,
    User,
)
from app.services import build_service
from tests.conftest import apply_compatible_build, create_account


def test_build_rejects_wrong_category(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    response = api_client.post(
        "/api/v1/builds",
        headers=registered_user["headers"],
        json={
            "name": "Wrong parts",
            "items": [{"slot": "cpu", "product_id": sample_products["gpu"].id}],
        },
    )
    assert response.status_code == 422, response.text


def test_build_is_unknown_when_technical_data_absent(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    created = api_client.post(
        "/api/v1/builds",
        headers=registered_user["headers"],
        json={
            "name": "Incomplete build",
            "items": [
                {"slot": "cpu", "product_id": sample_products["cpu"].id},
                {"slot": "mobo", "product_id": sample_products["mobo"].id},
            ],
        },
    )
    assert created.status_code == 201, created.text
    build_id = created.json()["id"]
    report = api_client.get(
        f"/api/v1/builds/{build_id}/compatibility", headers=registered_user["headers"]
    )
    assert report.status_code == 200
    assert report.json()["overall_status"] == "unknown"
    cart = api_client.post(
        "/api/v1/cart/builds",
        headers=registered_user["headers"],
        json={"saved_build_id": build_id, "quantity": 1},
    )
    assert cart.status_code in (409, 422)


def test_build_ownership_is_checked_per_user(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    created = api_client.post(
        "/api/v1/builds",
        headers=registered_user["headers"],
        json={"name": "Private build", "items": []},
    )
    assert created.status_code == 201, created.text
    build_id = created.json()["id"]
    second = token_hex(6)
    registration = api_client.post(
        "/api/v1/auth/register",
        json={
            "email": f"other-{second}@example.com",
            "username": "other" + second,
            "password": "OtherStrongPassword123!",
            "display_name": "Other",
        },
    )
    assert registration.status_code == 201
    login = api_client.post(
        "/api/v1/auth/login",
        json={
            "email_or_username": "other" + second,
            "password": "OtherStrongPassword123!",
        },
    )
    assert login.status_code == 200
    other_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    for method, route in [
        ("get", ""),
        ("put", ""),
        ("delete", ""),
        ("get", "/total"),
        ("get", "/compatibility"),
    ]:
        request = getattr(api_client, method)
        response = request(
            f"/api/v1/builds/{build_id}{route}",
            headers=other_headers,
            **({"json": {"name": "Stolen"}} if method == "put" else {}),
        )
        assert response.status_code == 404, (route, response.status_code, response.text)


def test_build_update_is_atomic(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    headers = registered_user["headers"]
    original = {
        "name": "Original",
        "items": [{"slot": "cpu", "product_id": sample_products["cpu"].id}],
    }
    created = api_client.post("/api/v1/builds", headers=headers, json=original)
    assert created.status_code == 201
    route = f"/api/v1/builds/{created.json()['id']}"
    invalid = api_client.put(
        route,
        headers=headers,
        json={
            "name": "Must not persist",
            "items": [{"slot": "cpu", "product_id": sample_products["gpu"].id}],
        },
    )
    assert invalid.status_code == 422
    current = api_client.get(route, headers=headers).json()
    assert current["name"] == "Original"
    assert current["items"][0]["product_id"] == sample_products["cpu"].id
    updated = api_client.put(
        route,
        headers=headers,
        json={
            "name": "Updated",
            "items": [{"slot": "gpu", "product_id": sample_products["gpu"].id}],
        },
    )
    assert updated.status_code == 200
    current = api_client.get(route, headers=headers).json()
    assert current["name"] == "Updated"
    assert current["items"][0]["product_id"] == sample_products["gpu"].id


def test_unsaved_compatibility_and_duplicate_slots(
    api_client: TestClient, sample_products: dict
):
    item = {"slot": "cpu", "product_id": sample_products["cpu"].id}
    result = api_client.post("/api/v1/builds/compatibility", json={"items": [item]})
    assert result.status_code == 200
    assert result.json()["overall_status"] == "unknown"
    assert (
        api_client.post(
            "/api/v1/builds/compatibility", json={"items": [item, item]}
        ).status_code
        == 422
    )


def test_compatibility_reports_structured_conflicts(
    api_client: TestClient, test_db_session: Session, sample_products: dict
):
    apply_compatible_build(test_db_session, sample_products)
    test_db_session.flush()
    items = [
        {"slot": slot, "product_id": product.id}
        for slot, product in sample_products.items()
    ]
    assert (
        api_client.post("/api/v1/builds/compatibility", json={"items": items}).json()[
            "overall_status"
        ]
        == "compatible"
    )

    # A verified socket conflict is reported with both values, not a generic text.
    test_db_session.flush()
    cpu_id = sample_products["cpu"].id
    socket_id = (
        test_db_session.query(Characteristic.id)
        .filter(
            Characteristic.category_id
            == sample_products["cpu"].product_type.category_id,
            Characteristic.code == "socket",
        )
        .scalar()
    )
    row = test_db_session.get(ProductCharacteristic, (cpu_id, socket_id))
    row.value = "LGA1700"
    test_db_session.flush()

    report = api_client.post(
        "/api/v1/builds/compatibility", json={"items": items}
    ).json()
    assert report["overall_status"] == "incompatible"
    conflict = next(row for row in report["items"] if row["slot"] == "cpu+mobo_socket")
    assert conflict["status"] == "incompatible"
    assert {detail["slot"] for detail in conflict["details"]} == {"cpu", "mobo"}
    values = {detail["slot"]: detail["value"] for detail in conflict["details"]}
    assert values["cpu"] == "LGA1700"
    assert values["mobo"] == "AM5"
    assert all(detail["product_name"] for detail in conflict["details"])


def test_incomplete_and_incompatible_builds_can_be_saved(
    api_client: TestClient,
    test_db_session: Session,
    registered_user: dict,
    sample_products: dict,
):
    headers = registered_user["headers"]
    # Incomplete but valid: only two correctly categorized parts.
    incomplete = api_client.post(
        "/api/v1/builds",
        headers=headers,
        json={
            "name": "Partial",
            "items": [
                {"slot": "cpu", "product_id": sample_products["cpu"].id},
                {"slot": "mobo", "product_id": sample_products["mobo"].id},
            ],
        },
    )
    assert incomplete.status_code == 201, incomplete.text

    # Incompatible but structurally valid: a conflicting socket is still saved.
    apply_compatible_build(test_db_session, sample_products)
    test_db_session.flush()
    cpu = sample_products["cpu"]
    socket_id = (
        test_db_session.query(Characteristic.id)
        .filter(
            Characteristic.category_id == cpu.product_type.category_id,
            Characteristic.code == "socket",
        )
        .scalar()
    )
    test_db_session.get(ProductCharacteristic, (cpu.id, socket_id)).value = "LGA1700"
    test_db_session.flush()

    incompatible = api_client.post(
        "/api/v1/builds",
        headers=headers,
        json={
            "name": "Conflicting",
            "items": [
                {"slot": slot, "product_id": product.id}
                for slot, product in sample_products.items()
            ],
        },
    )
    assert incompatible.status_code == 201, incompatible.text
    report = api_client.get(
        f"/api/v1/builds/{incompatible.json()['id']}/compatibility", headers=headers
    ).json()
    assert report["overall_status"] == "incompatible"
    # Saving never required a passing verdict, and never consumed a slot twice.
    assert len(api_client.get("/api/v1/builds", headers=headers).json()) == 2


def test_five_saved_build_limit_and_editing(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    headers = registered_user["headers"]
    item = {"slot": "cpu", "product_id": sample_products["cpu"].id}
    ids = []
    for number in range(build_service.SAVED_BUILD_LIMIT):
        created = api_client.post(
            "/api/v1/builds",
            headers=headers,
            json={"name": f"Build {number}", "items": [item]},
        )
        assert created.status_code == 201, created.text
        ids.append(created.json()["id"])

    rejected = api_client.post(
        "/api/v1/builds", headers=headers, json={"name": "Sixth", "items": [item]}
    )
    assert rejected.status_code == 409, rejected.text
    assert str(build_service.SAVED_BUILD_LIMIT) in rejected.json()["detail"]
    assert len(api_client.get("/api/v1/builds", headers=headers).json()) == 5

    # Editing remains allowed while the limit is reached.
    assert (
        api_client.put(
            f"/api/v1/builds/{ids[0]}", headers=headers, json={"name": "Renamed"}
        ).status_code
        == 200
    )

    # Deleting one build releases exactly one slot.
    assert (
        api_client.delete(f"/api/v1/builds/{ids[0]}", headers=headers).status_code
        == 204
    )
    replacement = api_client.post(
        "/api/v1/builds", headers=headers, json={"name": "Replacement", "items": [item]}
    )
    assert replacement.status_code == 201, replacement.text
    assert (
        api_client.post(
            "/api/v1/builds",
            headers=headers,
            json={"name": "Sixth again", "items": [item]},
        ).status_code
        == 409
    )
    # The limit also blocks a build without components.
    assert (
        api_client.post(
            "/api/v1/builds", headers=headers, json={"name": "Empty", "items": []}
        ).status_code
        == 409
    )


def test_saved_build_limit_is_per_user(
    api_client: TestClient, registered_user: dict, sample_products: dict
):
    item = {"slot": "cpu", "product_id": sample_products["cpu"].id}
    for number in range(build_service.SAVED_BUILD_LIMIT):
        assert (
            api_client.post(
                "/api/v1/builds",
                headers=registered_user["headers"],
                json={"name": f"Mine {number}", "items": [item]},
            ).status_code
            == 201
        )
    assert (
        api_client.post(
            "/api/v1/builds",
            headers=registered_user["headers"],
            json={"name": "Over", "items": [item]},
        ).status_code
        == 409
    )

    other = create_account(api_client)
    assert (
        api_client.post(
            "/api/v1/builds",
            headers=other["headers"],
            json={"name": "Other", "items": [item]},
        ).status_code
        == 201
    )


def test_create_serializes_the_limit_through_the_user_row(
    test_db_session: Session, registered_user: dict, sample_products: dict
):
    """The count check runs under a row lock of the owning user.

    Two concurrent creates of one user cannot both observe a free slot: the second
    waits for the first transaction to commit.
    """
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = test_db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        build_service.create_build(
            test_db_session,
            test_db_session.get(User, registered_user["id"]),
            "Locked",
            "",
            [{"slot": "cpu", "product_id": sample_products["cpu"].id}],
        )
    finally:
        event.remove(engine, "before_cursor_execute", record)

    lock_index = next(
        index
        for index, statement in enumerate(statements)
        if "FROM users" in statement and "FOR UPDATE" in statement
    )
    count_index = next(
        index
        for index, statement in enumerate(statements)
        if "FROM saved_builds" in statement and "count(" in statement
    )
    assert lock_index < count_index
    assert (
        test_db_session.query(SavedBuild)
        .filter_by(user_id=registered_user["id"])
        .count()
        == 1
    )
