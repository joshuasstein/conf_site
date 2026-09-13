"""Program checker: unscheduled gaps and non-parallel overlaps."""
import pytest
import pytest_asyncio
from sqlalchemy import delete

from app.models.session import Session
from app.models.session_group import SessionGroup
from app.models.session_slot import SessionSlot
from tests.conftest import auth_header

BASE = "/api/v1/sessions"


@pytest_asyncio.fixture(autouse=True)
async def _clean(db):
    for model in (SessionSlot, Session, SessionGroup):
        await db.execute(delete(model))
    await db.commit()
    yield


async def _add(client, chair, start, end, *, date="2026-06-01", stype="oral", title="S"):
    return await client.post(
        f"{BASE}/",
        json={
            "title": title,
            "session_type": stype,
            "session_date": date,
            "start_time": start,
            "end_time": end,
            "max_slots": 5,
        },
        headers=auth_header(chair),
    )


@pytest.mark.asyncio
async def test_detects_gap(client, db, program_chair):
    await _add(client, program_chair, "09:00:00", "10:00:00", title="Morning")
    await _add(client, program_chair, "11:00:00", "12:00:00", title="Late morning")

    resp = await client.get(f"{BASE}/program-check", headers=auth_header(program_chair))
    assert resp.status_code == 200
    body = resp.json()
    assert body["checked_sessions"] == 2
    assert len(body["gaps"]) == 1
    gap = body["gaps"][0]
    assert gap["start"] == "10:00:00"
    assert gap["end"] == "11:00:00"
    assert gap["minutes"] == 60
    assert body["overlaps"] == []


@pytest.mark.asyncio
async def test_no_gap_when_contiguous(client, db, program_chair):
    await _add(client, program_chair, "09:00:00", "10:00:00")
    await _add(client, program_chair, "10:00:00", "11:00:00")

    resp = await client.get(f"{BASE}/program-check", headers=auth_header(program_chair))
    assert resp.json()["gaps"] == []
    assert resp.json()["overlaps"] == []


@pytest.mark.asyncio
async def test_detects_overlap(client, db, program_chair):
    await _add(client, program_chair, "09:00:00", "10:00:00", title="A")
    await _add(client, program_chair, "09:30:00", "10:30:00", title="B")

    resp = await client.get(f"{BASE}/program-check", headers=auth_header(program_chair))
    body = resp.json()
    assert len(body["overlaps"]) == 1
    ov = body["overlaps"][0]
    assert ov["start"] == "09:30:00"
    assert ov["end"] == "10:00:00"
    assert ov["minutes"] == 30
    assert {ov["session_a_title"], ov["session_b_title"]} == {"A", "B"}


@pytest.mark.asyncio
async def test_parallel_columns_not_flagged_as_overlap(client, db, program_chair):
    # Two parallel columns share a time slot by design — not an overlap.
    await client.post(
        f"{BASE}/groups",
        json={
            "count": 2,
            "session_date": "2026-06-01",
            "start_time": "09:00:00",
            "session_type": "oral",
            "default_duration_minutes": 60,
            "title": "Tracks",
        },
        headers=auth_header(program_chair),
    )
    resp = await client.get(f"{BASE}/program-check", headers=auth_header(program_chair))
    body = resp.json()
    assert body["overlaps"] == []
    assert body["gaps"] == []


@pytest.mark.asyncio
async def test_break_fills_gap(client, db, program_chair):
    # A lunch block between two sessions leaves no gap.
    await _add(client, program_chair, "09:00:00", "10:00:00")
    await _add(client, program_chair, "10:00:00", "11:00:00", stype="lunch", title="Lunch")
    await _add(client, program_chair, "11:00:00", "12:00:00")

    resp = await client.get(f"{BASE}/program-check", headers=auth_header(program_chair))
    assert resp.json()["gaps"] == []


@pytest.mark.asyncio
async def test_submitter_forbidden(client, db, submitter):
    resp = await client.get(f"{BASE}/program-check", headers=auth_header(submitter))
    assert resp.status_code == 403
