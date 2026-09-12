"""Tests for configurable session/slot types and decision overrides."""
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.decision import Decision
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from tests.conftest import auth_header

_BASE_SESSION = {
    "session_date": "2025-09-15",
    "start_time": "09:00:00",
    "end_time": "12:00:00",
    "max_slots": 3,
}

# The suite shares one in-memory DB across tests, so type-setting tests append to
# whatever is configured (via _add_session_type / _add_slot_type) rather than
# replacing the list — removing a type still used by another test's session/slot
# would trip the deletion guard.


async def _set_types(client, admin, *, session_types=None, slot_types=None):
    payload = {}
    if session_types is not None:
        payload["session_types"] = session_types
    if slot_types is not None:
        payload["slot_types"] = slot_types
    return await client.patch(
        "/api/v1/admin/conference-settings", json=payload, headers=auth_header(admin)
    )


async def _current(client, admin):
    """Current settings (the suite shares one DB, so read live state)."""
    return (await client.get("/api/v1/admin/conference-settings", headers=auth_header(admin))).json()


async def _add_session_type(client, admin, new_type):
    """Append a session type to whatever is configured, never removing in-use types."""
    types = (await _current(client, admin))["session_types"]
    types = [t for t in types if t["key"] != new_type["key"]] + [new_type]
    return await _set_types(client, admin, session_types=types)


async def _add_slot_type(client, admin, new_type):
    types = (await _current(client, admin))["slot_types"]
    types = [t for t in types if t["key"] != new_type["key"]] + [new_type]
    return await _set_types(client, admin, slot_types=types)


async def _add_decision_outcome(client, admin, new_outcome):
    outcomes = (await _current(client, admin))["decision_outcomes"]
    outcomes = [o for o in outcomes if o["key"] != new_outcome["key"]] + [new_outcome]
    return await client.patch(
        "/api/v1/admin/conference-settings",
        json={"decision_outcomes": outcomes},
        headers=auth_header(admin),
    )


# ── Session types ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_session_with_custom_type(client: AsyncClient, admin: User, program_chair: User) -> None:
    resp = await _add_session_type(client, admin, {"key": "tutorial", "label": "Tutorial", "color": "teal", "has_slots": True})
    assert resp.status_code == 200

    resp = await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "Intro Tutorial", "session_type": "tutorial"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert resp.json()["session_type"] == "tutorial"


@pytest.mark.asyncio
async def test_unknown_session_type_rejected(client: AsyncClient, program_chair: User) -> None:
    resp = await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "Bogus", "session_type": "does_not_exist"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_custom_color_validated(client: AsyncClient, admin: User) -> None:
    resp = await _set_types(client, admin, session_types=[
        {"key": "oral", "label": "Oral", "color": "fuchsia", "has_slots": True},
    ])
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_keys_rejected(client: AsyncClient, admin: User) -> None:
    resp = await _set_types(client, admin, session_types=[
        {"key": "oral", "label": "Oral", "color": "indigo", "has_slots": True},
        {"key": "oral", "label": "Oral 2", "color": "teal", "has_slots": True},
    ])
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_cannot_remove_session_type_in_use(client: AsyncClient, admin: User, program_chair: User) -> None:
    # Create a session using the default 'oral' type.
    await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "Orals", "session_type": "oral"},
        headers=auth_header(program_chair),
    )
    # Now try to save a type list that drops 'oral'.
    resp = await _set_types(client, admin, session_types=[
        {"key": "poster", "label": "Poster", "color": "emerald", "has_slots": True},
    ])
    assert resp.status_code == 422
    assert "oral" in resp.json()["detail"]


# ── Slot types ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_custom_slot_type_without_submission(client: AsyncClient, admin: User, program_chair: User) -> None:
    resp = await _add_slot_type(client, admin, {"key": "intro", "label": "Intro", "requires_submission": False, "expects_file": "none"})
    assert resp.status_code == 200
    session_id = (await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "S", "session_type": "oral"},
        headers=auth_header(program_chair),
    )).json()["id"]

    resp = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"slot_type": "intro", "slot_order": 1, "duration_minutes": 10},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert resp.json()["slot_type"] == "intro"


@pytest.mark.asyncio
async def test_slot_requiring_submission_without_one_rejected(client: AsyncClient, program_chair: User) -> None:
    session_id = (await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "S", "session_type": "oral"},
        headers=auth_header(program_chair),
    )).json()["id"]
    # 'talk' requires a submission by default.
    resp = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"slot_type": "talk", "slot_order": 1, "duration_minutes": 15},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 422


# ── Program payload display metadata ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_program_includes_display_metadata(client: AsyncClient, admin: User, program_chair: User) -> None:
    resp = await _add_session_type(client, admin, {"key": "keynote", "label": "Keynote", "color": "violet", "has_slots": True})
    assert resp.status_code == 200
    session_id = (await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "Opening Keynote", "session_type": "keynote"},
        headers=auth_header(program_chair),
    )).json()["id"]
    await client.patch(
        f"/api/v1/sessions/{session_id}",
        json={"is_published": True},
        headers=auth_header(program_chair),
    )

    resp = await client.get("/api/v1/sessions/program")
    assert resp.status_code == 200
    sess = next(s for s in resp.json() if s["id"] == session_id)
    assert sess["session_type_label"] == "Keynote"
    assert sess["session_type_color"] == "violet"
    assert sess["session_type_has_slots"] is True


# ── Decision overrides ─────────────────────────────────────────────────────────

async def _make_decided_submission(db: AsyncSession, submitter: User) -> Submission:
    sub = Submission(
        title="An abstract",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.DECIDED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@pytest.mark.asyncio
async def test_program_chair_can_override_decision(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_decided_submission(db, submitter)
    db.add(Decision(submission_id=sub.id, outcome="oral", decided_by_id=program_chair.id))
    await db.commit()

    resp = await client.put(
        f"/api/v1/decisions/{sub.id}",
        json={"outcome": "poster"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "poster"

    log = (await db.execute(
        select(AuditLog).where(AuditLog.action == "decision_override", AuditLog.target_id == sub.id)
    )).scalar_one_or_none()
    assert log is not None
    assert log.detail["from"] == "oral"
    assert log.detail["to"] == "poster"


@pytest.mark.asyncio
async def test_admin_override_creates_decision_when_absent(
    client: AsyncClient, admin: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_decided_submission(db, submitter)
    resp = await client.put(
        f"/api/v1/decisions/{sub.id}",
        json={"outcome": "rejected"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "rejected"


@pytest.mark.asyncio
async def test_submitter_cannot_override_decision(
    client: AsyncClient, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_decided_submission(db, submitter)
    resp = await client.put(
        f"/api/v1/decisions/{sub.id}",
        json={"outcome": "poster"},
        headers=auth_header(submitter),
    )
    assert resp.status_code == 403


# ── Configurable decision outcomes ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_custom_decision_outcome(client: AsyncClient, admin: User, submitter: User, db: AsyncSession) -> None:
    resp = await _add_decision_outcome(client, admin, {"key": "waitlist", "label": "Waitlist", "is_acceptance": False})
    assert resp.status_code == 200
    sub = await _make_decided_submission(db, submitter)
    resp = await client.put(
        f"/api/v1/decisions/{sub.id}",
        json={"outcome": "waitlist"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "waitlist"


@pytest.mark.asyncio
async def test_unknown_decision_outcome_rejected(client: AsyncClient, admin: User, submitter: User, db: AsyncSession) -> None:
    sub = await _make_decided_submission(db, submitter)
    resp = await client.put(
        f"/api/v1/decisions/{sub.id}",
        json={"outcome": "not_a_real_outcome"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_cannot_remove_decision_outcome_in_use(client: AsyncClient, admin: User, submitter: User, db: AsyncSession) -> None:
    sub = await _make_decided_submission(db, submitter)
    db.add(Decision(submission_id=sub.id, outcome="oral", decided_by_id=admin.id))
    await db.commit()
    # Try to drop 'oral' while a decision uses it.
    resp = await client.patch(
        "/api/v1/admin/conference-settings",
        json={"decision_outcomes": [{"key": "poster", "label": "Poster", "is_acceptance": True}]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422
    assert "oral" in resp.json()["detail"]


# ── Decisions list ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_decisions_list_shows_presenter_title_outcome(
    client: AsyncClient, admin: User, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_decided_submission(db, submitter)
    db.add(Decision(submission_id=sub.id, outcome="poster", decided_by_id=admin.id))
    await db.commit()

    resp = await client.get("/api/v1/decisions/", headers=auth_header(program_chair))
    assert resp.status_code == 200
    row = next(r for r in resp.json() if r["submission_id"] == str(sub.id))
    assert row["title"] == sub.title
    assert row["presenter_name"] == submitter.full_name
    assert row["outcome"] == "poster"
    assert row["session_title"] is None


@pytest.mark.asyncio
async def test_decisions_list_shows_session_once_assigned(
    client: AsyncClient, admin: User, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_decided_submission(db, submitter)
    db.add(Decision(submission_id=sub.id, outcome="oral", decided_by_id=admin.id))
    await db.commit()

    session_id = (await client.post(
        "/api/v1/sessions/",
        json={**_BASE_SESSION, "title": "Assigned Session", "session_type": "oral"},
        headers=auth_header(program_chair),
    )).json()["id"]
    assign = await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_type": "talk", "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    assert assign.status_code == 201

    resp = await client.get("/api/v1/decisions/", headers=auth_header(admin))
    row = next(r for r in resp.json() if r["submission_id"] == str(sub.id))
    assert row["session_title"] == "Assigned Session"


@pytest.mark.asyncio
async def test_submitter_cannot_list_decisions(client: AsyncClient, submitter: User) -> None:
    resp = await client.get("/api/v1/decisions/", headers=auth_header(submitter))
    assert resp.status_code == 403
