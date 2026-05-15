import pytest
from httpx import AsyncClient

from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/auth/register", json={
        "email": "new@example.com",
        "full_name": "New User",
        "password": "password123",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert data["role"] == "submitter"


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient) -> None:
    payload = {"email": "dup@example.com", "full_name": "Dup", "password": "password123"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_login_valid(client: AsyncClient, submitter) -> None:
    # Re-register with known password since fixture uses hashed one
    await client.post("/api/v1/auth/register", json={
        "email": "logintest@example.com", "full_name": "Login User", "password": "mypassword"
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "logintest@example.com", "password": "mypassword"
    })
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient) -> None:
    await client.post("/api/v1/auth/register", json={
        "email": "wrongpw@example.com", "full_name": "Wrong PW", "password": "correctpw"
    })
    resp = await client.post("/api/v1/auth/login", json={
        "email": "wrongpw@example.com", "password": "wrongpassword"
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_protected_endpoint_requires_auth(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/submissions/")
    assert resp.status_code == 401
