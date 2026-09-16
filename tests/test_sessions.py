"""Tests for session creation, slot assignment, and max_slots enforcement."""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision import Decision, DecisionOutcome
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
    db.add(Decision(submission_id=sub.id, outcome=DecisionOutcome.ORAL))
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
@pytest.mark.parametrize("outcome", [DecisionOutcome.POSTER, DecisionOutcome.REJECTED])
async def test_assign_submission_outcome_must_match_session_type(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession, outcome: str
) -> None:
    """A submission whose decision outcome does not match the session's type
    (a poster or a rejected submission for an 'oral' session) cannot be slotted."""
    sub = Submission(
        title="Wrong-outcome talk",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.DECIDED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    db.add(Decision(submission_id=sub.id, outcome=outcome))
    await db.commit()

    session_resp = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = session_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 422


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

    subs = []
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
        subs.append(sub)
    await db.commit()

    for s in subs:
        db.add(Decision(submission_id=s.id, outcome=DecisionOutcome.ORAL))
    await db.commit()

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


@pytest.mark.asyncio
async def test_program_chair_deletes_session(client: AsyncClient, program_chair: User) -> None:
    created = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = created.json()["id"]

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}", headers=auth_header(program_chair)
    )
    assert resp.status_code == 204

    gone = await client.get(f"/api/v1/sessions/{session_id}", headers=auth_header(program_chair))
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_submitter_cannot_delete_session(
    client: AsyncClient, program_chair: User, submitter: User
) -> None:
    created = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = created.json()["id"]

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}", headers=auth_header(submitter)
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_delete_session_reverts_assigned_submission(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    from sqlalchemy import select

    sub = Submission(
        title="Assigned talk",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.DECIDED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    db.add(Decision(submission_id=sub.id, outcome=DecisionOutcome.ORAL))
    await db.commit()

    created = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = created.json()["id"]

    assigned = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert assigned.status_code == 201

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}", headers=auth_header(program_chair)
    )
    assert resp.status_code == 204

    refreshed = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    await db.refresh(refreshed)
    assert refreshed.status == SubmissionStatus.DECIDED


@pytest.mark.asyncio
async def test_remove_slot_reverts_notified_submission_to_decided(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    """Removing the slot of an already-notified submission returns it to
    'decided' so it can be scheduled again (regression: it used to linger at
    'notified', session-less and unassignable)."""
    from sqlalchemy import select

    sub = Submission(
        title="Notified talk",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.DECIDED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    db.add(Decision(submission_id=sub.id, outcome=DecisionOutcome.ORAL))
    await db.commit()

    created = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = created.json()["id"]

    assigned = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert assigned.status_code == 201
    slot_id = assigned.json()["id"]

    # Advance the presenter to 'notified' (as a bulk-notify would).
    refreshed = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    refreshed.status = SubmissionStatus.NOTIFIED
    await db.commit()

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}/slots/{slot_id}", headers=auth_header(program_chair)
    )
    assert resp.status_code == 200

    reverted = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    await db.refresh(reverted)
    assert reverted.status == SubmissionStatus.DECIDED


async def _session_with_confirmed_submission(client, db, program_chair, submitter):
    """Create a session with a slot holding a CONFIRMED submission (an 'advanced'
    status that deletion must handle explicitly)."""
    from app.models.session_slot import SessionSlot

    created = await client.post(
        "/api/v1/sessions/", json=_SESSION_PAYLOAD, headers=auth_header(program_chair)
    )
    session_id = created.json()["id"]

    sub = Submission(
        title="Confirmed talk",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.CONFIRMED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()

    import uuid as _uuid
    db.add(SessionSlot(
        id=_uuid.uuid4(),
        session_id=_uuid.UUID(session_id),
        submission_id=sub.id,
        slot_type="talk",
        slot_order=1,
        duration_minutes=20,
    ))
    await db.commit()
    return session_id, sub


@pytest.mark.asyncio
async def test_deletion_impact_lists_advanced_submissions(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    session_id, sub = await _session_with_confirmed_submission(client, db, program_chair, submitter)

    resp = await client.get(
        f"/api/v1/sessions/{session_id}/deletion-impact", headers=auth_header(program_chair)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["slot_count"] == 1
    assert body["assigned_count"] == 0
    assert len(body["advanced"]) == 1
    assert body["advanced"][0]["status"] == SubmissionStatus.CONFIRMED
    assert body["advanced"][0]["title"] == "Confirmed talk"


@pytest.mark.asyncio
async def test_delete_session_withdraws_advanced_submission(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    from app.models.audit_log import AuditLog

    session_id, sub = await _session_with_confirmed_submission(client, db, program_chair, submitter)

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}?advanced_status=withdrawn",
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 204

    refreshed = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    await db.refresh(refreshed)
    assert refreshed.status == SubmissionStatus.WITHDRAWN

    logs = (await db.execute(
        select(AuditLog).where(AuditLog.action == "session_deleted_status_change")
    )).scalars().all()
    assert any(log.target_id == sub.id for log in logs)


@pytest.mark.asyncio
async def test_delete_session_advanced_to_decided(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    session_id, sub = await _session_with_confirmed_submission(client, db, program_chair, submitter)

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}?advanced_status=decided",
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 204

    refreshed = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    await db.refresh(refreshed)
    assert refreshed.status == SubmissionStatus.DECIDED


@pytest.mark.asyncio
async def test_delete_session_rejects_invalid_advanced_status(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    session_id, _ = await _session_with_confirmed_submission(client, db, program_chair, submitter)

    resp = await client.delete(
        f"/api/v1/sessions/{session_id}?advanced_status=confirmed",
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 422
