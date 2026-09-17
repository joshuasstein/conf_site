"""Admin Viewer access contract (PR 2).

A user with is_admin_viewer set — regardless of base role — can READ every
admin-level surface, but every write/action still obeys their base role. The
subject here is a *submitter* + admin_viewer (the weakest base role), so a 403
on a mutation proves the flag grants no action power.
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from tests.conftest import _make_user, auth_header


@pytest_asyncio.fixture
async def admin_viewer(db: AsyncSession) -> User:
    """A base submitter granted the Admin Viewer read privilege."""
    user = _make_user(UserRole.SUBMITTER, is_admin_viewer=True)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


# ─── Reads: an Admin Viewer sees admin-level surfaces ────────────────────────────

READ_ENDPOINTS = [
    "/api/v1/admin/users",
    "/api/v1/admin/reviewers",
    "/api/v1/admin/audit-log",
    "/api/v1/admin/conference-settings",
    "/api/v1/admin/email-templates",
    "/api/v1/admin/program-templates",
    "/api/v1/admin/presenters.csv",
    "/api/v1/files/all",
    "/api/v1/files/by-session",
    "/api/v1/notifications/email-jobs",
    "/api/v1/reviews/",
    "/api/v1/decisions/",
    "/api/v1/sessions/groups",
    "/api/v1/sessions/program-check",
]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_admin_viewer_can_read_admin_surfaces(
    client: AsyncClient, admin_viewer: User, path: str
) -> None:
    resp = await client.get(path, headers=auth_header(admin_viewer))
    assert resp.status_code == 200, f"{path} -> {resp.status_code} {resp.text}"


@pytest.mark.asyncio
@pytest.mark.parametrize("path", READ_ENDPOINTS)
async def test_plain_submitter_is_denied_admin_surfaces(
    client: AsyncClient, submitter: User, path: str
) -> None:
    """Control: the same base role WITHOUT the flag is refused (403)."""
    resp = await client.get(path, headers=auth_header(submitter))
    assert resp.status_code == 403, f"{path} -> {resp.status_code} {resp.text}"


@pytest.mark.asyncio
async def test_admin_viewer_submission_list_shows_all(
    client: AsyncClient, admin_viewer: User, submitter: User, db: AsyncSession
) -> None:
    """A viewer's submission list is unscoped (sees others' submissions)."""
    other = Submission(
        title="Someone else's abstract",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.SUBMITTED,
        submission_type_preference="oral",
    )
    db.add(other)
    await db.commit()

    resp = await client.get("/api/v1/submissions/", headers=auth_header(admin_viewer))
    assert resp.status_code == 200
    ids = {row["id"] for row in resp.json()}
    assert str(other.id) in ids


# ─── Writes/actions: base role still governs ─────────────────────────────────────

@pytest.mark.asyncio
async def test_admin_viewer_cannot_mutate(
    client: AsyncClient, admin_viewer: User, submitter: User, db: AsyncSession
) -> None:
    hdr = auth_header(admin_viewer)

    # Admin-only mutations (guarded by the strict role dependency).
    assert (await client.patch("/api/v1/admin/conference-settings", json={}, headers=hdr)).status_code == 403
    assert (await client.patch(f"/api/v1/admin/users/{submitter.id}", json={"role": "admin"}, headers=hdr)).status_code == 403
    assert (await client.post(
        f"/api/v1/admin/submissions/{submitter.id}/status",
        json={"status": "under_review", "reason": "x"}, headers=hdr,
    )).status_code == 403

    # Chair-level actions stay strict too (sending email, notifying).
    assert (await client.post("/api/v1/notifications/notify-reviewers", json={"dry_run": True}, headers=hdr)).status_code == 403
    assert (await client.post(
        "/api/v1/broadcast/send",
        json={"filters": {}, "subject": "Hi", "body": "Hello {full_name}"}, headers=hdr,
    )).status_code == 403


@pytest.mark.asyncio
async def test_admin_viewer_cannot_grant_admin_viewer(
    client: AsyncClient, admin_viewer: User, submitter: User
) -> None:
    """The flag is not self-propagating: a viewer can't grant it to others."""
    resp = await client.patch(
        f"/api/v1/admin/users/{submitter.id}",
        json={"is_admin_viewer": True},
        headers=auth_header(admin_viewer),
    )
    assert resp.status_code == 403
