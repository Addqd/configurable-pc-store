"""Build CRUD/owner protection and no false positive compatibility."""

from secrets import token_hex

from fastapi.testclient import TestClient


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
