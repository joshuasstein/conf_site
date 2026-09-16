"""Tests for the is_admin_viewer privilege flag plumbing (PR 1).

Behavioural read/write access changes land in later PRs; here we only verify the
flag defaults off, round-trips through the admin user-update endpoint, and is
exposed on the authenticated user.
"""
import pytest
from httpx import AsyncClient

from app.models.user import User
from tests.conftest import auth_header


@pytest.mark.asyncio
async def test_admin_viewer_defaults_false(client: AsyncClient, submitter: User) -> None:
    resp = await client.get("/api/v1/auth/me", headers=auth_header(submitter))
    assert resp.status_code == 200
    assert resp.json()["is_admin_viewer"] is False


@pytest.mark.asyncio
async def test_admin_can_grant_and_revoke_admin_viewer(
    client: AsyncClient, admin: User, submitter: User
) -> None:
    grant = await client.patch(
        f"/api/v1/admin/users/{submitter.id}",
        json={"is_admin_viewer": True},
        headers=auth_header(admin),
    )
    assert grant.status_code == 200
    assert grant.json()["is_admin_viewer"] is True

    # The flag is visible to the user themselves via /auth/me.
    me = await client.get("/api/v1/auth/me", headers=auth_header(submitter))
    assert me.json()["is_admin_viewer"] is True

    revoke = await client.patch(
        f"/api/v1/admin/users/{submitter.id}",
        json={"is_admin_viewer": False},
        headers=auth_header(admin),
    )
    assert revoke.status_code == 200
    assert revoke.json()["is_admin_viewer"] is False


@pytest.mark.asyncio
async def test_non_admin_cannot_grant_admin_viewer(
    client: AsyncClient, program_chair: User, submitter: User
) -> None:
    resp = await client.patch(
        f"/api/v1/admin/users/{submitter.id}",
        json={"is_admin_viewer": True},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 403
