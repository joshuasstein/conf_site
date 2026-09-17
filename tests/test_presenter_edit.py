"""Admin/chair editing of a submission's presenter name/affiliation for the program."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision import Decision, DecisionOutcome
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from tests.conftest import auth_header


async def _decided_oral_submission(submitter: User, db: AsyncSession) -> Submission:
    sub = Submission(
        title="A talk",
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
    await db.refresh(sub)
    return sub


@pytest.mark.asyncio
async def test_chair_can_edit_presenter_overrides(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _decided_oral_submission(submitter, db)
    resp = await client.patch(
        f"/api/v1/submissions/{sub.id}/presenter",
        json={
            "presenter_name_override": "Dr. Jane Q. Public",
            "presenter_institution_override": "Institute of Sunlight",
            "co_authors": [{"name": "Sam Co", "email": "sam@x.org", "institution": "Lab B"}],
        },
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["presenter_name_override"] == "Dr. Jane Q. Public"
    assert data["presenter_institution_override"] == "Institute of Sunlight"
    assert data["co_authors"][0]["name"] == "Sam Co"


@pytest.mark.asyncio
async def test_blank_override_clears_it(
    client: AsyncClient, admin: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _decided_oral_submission(submitter, db)
    await client.patch(
        f"/api/v1/submissions/{sub.id}/presenter",
        json={"presenter_name_override": "Temp Name"},
        headers=auth_header(admin),
    )
    cleared = await client.patch(
        f"/api/v1/submissions/{sub.id}/presenter",
        json={"presenter_name_override": ""},
        headers=auth_header(admin),
    )
    assert cleared.status_code == 200
    assert cleared.json()["presenter_name_override"] is None


@pytest.mark.asyncio
async def test_submitter_cannot_edit_presenter(
    client: AsyncClient, submitter: User, db: AsyncSession
) -> None:
    sub = await _decided_oral_submission(submitter, db)
    resp = await client.patch(
        f"/api/v1/submissions/{sub.id}/presenter",
        json={"presenter_name_override": "Hacker"},
        headers=auth_header(submitter),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_program_uses_presenter_override(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _decided_oral_submission(submitter, db)
    await client.patch(
        f"/api/v1/submissions/{sub.id}/presenter",
        json={"presenter_name_override": "Program Display Name", "presenter_institution_override": "Prog Inst"},
        headers=auth_header(program_chair),
    )

    session_resp = await client.post(
        "/api/v1/sessions/",
        json={
            "title": "Morning Orals",
            "session_type": "oral",
            "session_date": "2025-09-15",
            "start_time": "09:00:00",
            "end_time": "12:00:00",
            "max_slots": 2,
        },
        headers=auth_header(program_chair),
    )
    session_id = session_resp.json()["id"]
    await client.post(
        f"/api/v1/sessions/{session_id}/slots",
        json={"submission_id": str(sub.id), "slot_order": 1, "duration_minutes": 20},
        headers=auth_header(program_chair),
    )
    await client.patch(
        f"/api/v1/sessions/{session_id}",
        json={"is_published": True},
        headers=auth_header(program_chair),
    )

    program = await client.get("/api/v1/sessions/program")
    assert program.status_code == 200
    slots = [slot for row in program.json() for col in row["columns"] for slot in col["slots"]]
    presenter_names = [s.get("presenter_name") for s in slots]
    assert "Program Display Name" in presenter_names