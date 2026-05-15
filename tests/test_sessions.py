"""Tests for session creation, slot assignment, and max_slots enforcement."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from tests.conftest import auth_header

_SESSION_PAYLOAD = {
    "title": "Morning Orals",
    "session_type": "oral",
    "session_date": "2025-09-15",
    "start_time": "09:00:00",
    "end_time": "12:00:00",
    "max_slots": 2,
}


@pytest.mark.asyncio
async def test_program_chair_creates_session(client: AsyncClient, program_chair: User) -> None:
    resp = await client.post(
        "/api/v1/sessions/",
        json=_SESSION_PAYLOAD,
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert resp.json()["title"] == "Morning Orals"
    assert resp.json()["is_published"] is False


@pytest.mark.asyncio
async def test_submitter_cannot_create_session(client: AsyncClient, submitter: User) -> None:
    resp = await client.post(
        "/api/v1/sessions/",
        json=_SESSION_PAYLOAD,
        headers=auth_header(submitter),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_assign_submission_to_session(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = Submission(
        title="A decided talk",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.DECIDED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()

    session_resp = await client.post(
        "/api/v1/sessions/",
        json=_SESSION_PAYLOAD,
        headers=auth_header(program_chair),
    )
    session_id = session_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert resp.json()["submission_id"] == str(sub.id)


@pytest.mark.asyncio
async def test_session_max_slots_enforced(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    session_resp = await client.post(
        "/api/v1/sessions/",
        json={**_SESSION_PAYLOAD, "max_slots": 1},
        headers=auth_header(program_chair),
    )
    session_id = session_resp.json()["id"]

    for i in range(2):
        sub = Submission(
            title=f"Talk {i}",
            abstract_text="text",
            presenting_author_id=submitter.id,
            co_authors=[],
            keywords=[],
            status=SubmissionStatus.DECIDED,
            submission_type_preference="oral",
        )
        db.add(sub)
    await db.commit()

    from sqlalchemy import select
    result = await db.execute(
        select(Submission).where(Submission.status == SubmissionStatus.DECIDED).limit(2)
    )
    subs = list(result.scalars().all())

    resp1 = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(subs[0].id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert resp1.status_code == 201

    resp2 = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(subs[1].id), "slot_order": 2, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert resp2.status_code == 422
