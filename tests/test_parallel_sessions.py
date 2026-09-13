"""Parallel session blocks: create / update / add-column / program / delete."""
import pytest
import pytest_asyncio
from datetime import date, time

from sqlalchemy import delete, select

from app.models.audit_log import AuditLog
from app.models.session import Session
from app.models.session_group import SessionGroup
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from tests.conftest import auth_header

BASE = "/api/v1/sessions"


@pytest_asyncio.fixture(autouse=True)
async def _clean(db):
    for model in (SessionSlot, Session, SessionGroup):
        await db.execute(delete(model))
    await db.commit()
    yield


async def _create_block(client, chair, **over):
    payload = {
        "count": 2,
        "session_date": "2026-06-01",
        "start_time": "09:00:00",
        "session_type": "oral",
        "default_duration_minutes": 60,
        "title": "Technical Tracks",
    }
    payload.update(over)
    return await client.post(f"{BASE}/groups", json=payload, headers=auth_header(chair))


@pytest.mark.asyncio
async def test_create_parallel_block(client, db, program_chair):
    resp = await _create_block(client, program_chair)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["title"] == "Technical Tracks"
    assert len(body["columns"]) == 2
    assert body["start_time"] == "09:00:00"
    assert body["end_time"] == "10:00:00"
    # Columns share the block's date/start and are ordered
    assert [c["column_order"] for c in body["columns"]] == [0, 1]
    assert all(c["session_date"] == "2026-06-01" for c in body["columns"])
    assert all(c["start_time"] == "09:00:00" for c in body["columns"])
    assert all(c["group_id"] == body["id"] for c in body["columns"])


@pytest.mark.asyncio
async def test_submitter_cannot_create_block(client, db, submitter):
    resp = await _create_block(client, submitter)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_count_must_be_at_least_two(client, db, program_chair):
    resp = await _create_block(client, program_chair, count=1)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_update_block_start_cascades_to_columns(client, db, program_chair):
    created = (await _create_block(client, program_chair)).json()
    gid = created["id"]

    resp = await client.patch(
        f"{BASE}/groups/{gid}",
        json={"start_time": "14:00:00", "title": "Afternoon Tracks"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["title"] == "Afternoon Tracks"
    assert body["start_time"] == "14:00:00"
    assert all(c["start_time"] == "14:00:00" for c in body["columns"])


@pytest.mark.asyncio
async def test_column_duration_is_independent(client, db, program_chair):
    created = (await _create_block(client, program_chair)).json()
    col = created["columns"][0]

    # end_time (duration) is editable per column; start_time is group-controlled and ignored.
    resp = await client.patch(
        f"{BASE}/{col['id']}",
        json={"end_time": "11:30:00", "start_time": "08:00:00"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["end_time"] == "11:30:00"
    assert body["start_time"] == "09:00:00"  # unchanged


@pytest.mark.asyncio
async def test_add_column(client, db, program_chair):
    created = (await _create_block(client, program_chair)).json()
    gid = created["id"]
    resp = await client.post(
        f"{BASE}/groups/{gid}/columns",
        json={"session_type": "oral", "duration_minutes": 30},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert len(resp.json()["columns"]) == 3


@pytest.mark.asyncio
async def test_program_shows_parallel_row(client, db, program_chair):
    created = (await _create_block(client, program_chair)).json()
    gid = created["id"]
    # Publish the block (cascades to columns) so it appears on the public program.
    await client.patch(f"{BASE}/groups/{gid}", json={"is_published": True}, headers=auth_header(program_chair))

    resp = await client.get(f"{BASE}/program")
    assert resp.status_code == 200
    rows = resp.json()
    parallel = [r for r in rows if r["is_parallel"]]
    assert len(parallel) == 1
    assert parallel[0]["group_title"] == "Technical Tracks"
    assert len(parallel[0]["columns"]) == 2


@pytest.mark.asyncio
async def test_delete_block_reverts_advanced_and_removes_all(client, db, program_chair, submitter):
    import uuid as _uuid

    created = (await _create_block(client, program_chair)).json()
    gid = created["id"]
    col_id = created["columns"][0]["id"]

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
    db.add(SessionSlot(
        id=_uuid.uuid4(),
        session_id=_uuid.UUID(col_id),
        submission_id=sub.id,
        slot_type="talk",
        slot_order=1,
        duration_minutes=20,
    ))
    await db.commit()

    impact = await client.get(f"{BASE}/groups/{gid}/deletion-impact", headers=auth_header(program_chair))
    assert impact.status_code == 200
    assert len(impact.json()["advanced"]) == 1

    resp = await client.delete(
        f"{BASE}/groups/{gid}?advanced_status=withdrawn", headers=auth_header(program_chair)
    )
    assert resp.status_code == 204

    assert (await db.execute(select(SessionGroup))).scalars().first() is None
    assert (await db.execute(select(Session))).scalars().first() is None
    refreshed = (await db.execute(select(Submission).where(Submission.id == sub.id))).scalar_one()
    await db.refresh(refreshed)
    assert refreshed.status == SubmissionStatus.WITHDRAWN


@pytest.mark.asyncio
async def test_deleting_column_dissolves_two_column_block(client, db, program_chair):
    created = (await _create_block(client, program_chair)).json()
    gid = created["id"]
    col_id = created["columns"][0]["id"]

    # Delete one of the two columns via the normal session delete.
    resp = await client.delete(f"{BASE}/{col_id}", headers=auth_header(program_chair))
    assert resp.status_code == 204

    # Block is dissolved; the remaining column becomes standalone.
    assert (await db.execute(select(SessionGroup).where(SessionGroup.id == _as_uuid(gid)))).scalar_one_or_none() is None
    remaining = (await db.execute(select(Session))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].group_id is None


def _as_uuid(s):
    import uuid
    return uuid.UUID(s)
