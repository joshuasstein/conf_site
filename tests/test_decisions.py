"""Tests for recording committee decisions, including recovery from a stale
decision left behind when a decided submission is reverted to under_review."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from tests.conftest import auth_header


async def _make_submission_under_review(submitter: User, db: AsyncSession) -> Submission:
    sub = Submission(
        title="Decidable Sub",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.UNDER_REVIEW,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@pytest.mark.asyncio
async def test_record_decision_advances_to_decided(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_submission_under_review(submitter, db)
    resp = await client.post(
        "/api/v1/decisions/",
        json={"submission_id": str(sub.id), "outcome": "oral"},
        headers=auth_header(program_chair),
    )
    assert resp.status_code == 201
    assert resp.json()["outcome"] == "oral"

    await db.refresh(sub)
    assert sub.status == SubmissionStatus.DECIDED


@pytest.mark.asyncio
async def test_record_decision_recovers_after_revert_to_under_review(
    client: AsyncClient, admin: User, submitter: User, db: AsyncSession
) -> None:
    """A decided submission reverted to under_review keeps its decision row; the
    chair must still be able to record a (possibly different) decision."""
    sub = await _make_submission_under_review(submitter, db)

    first = await client.post(
        "/api/v1/decisions/",
        json={"submission_id": str(sub.id), "outcome": "poster"},
        headers=auth_header(admin),
    )
    assert first.status_code == 201

    # Admin forces the submission back to under_review — the decision row lingers.
    override = await client.post(
        f"/api/v1/admin/submissions/{sub.id}/status",
        json={"status": "under_review", "reason": "reopen for re-review"},
        headers=auth_header(admin),
    )
    assert override.status_code == 200

    # Recording again must succeed (not 409) and update the outcome + advance status.
    second = await client.post(
        "/api/v1/decisions/",
        json={"submission_id": str(sub.id), "outcome": "oral"},
        headers=auth_header(admin),
    )
    assert second.status_code == 201, second.text
    assert second.json()["outcome"] == "oral"

    await db.refresh(sub)
    assert sub.status == SubmissionStatus.DECIDED


@pytest.mark.asyncio
async def test_cannot_record_decision_when_not_under_review(
    client: AsyncClient, program_chair: User, submitter: User, db: AsyncSession
) -> None:
    sub = await _make_submission_under_review(submitter, db)
    await client.post(
        "/api/v1/decisions/",
        json={"submission_id": str(sub.id), "outcome": "oral"},
        headers=auth_header(program_chair),
    )
    # Now decided — a second record attempt is blocked by the status guard.
    again = await client.post(
        "/api/v1/decisions/",
        json={"submission_id": str(sub.id), "outcome": "poster"},
        headers=auth_header(program_chair),
    )
    assert again.status_code == 422
