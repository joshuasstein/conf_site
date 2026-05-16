"""Tests for reviewer assignment and self-review prevention."""
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from tests.conftest import auth_header


async def _make_submission_under_review(submitter: User, db: AsyncSession) -> Submission:
    sub = Submission(
        title="Under Review Sub",
        abstract_text="text",
        presenting_author_id=submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.SUBMITTED,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


@pytest.mark.asyncio
async def test_assign_reviewer(client: AsyncClient, admin: User, submitter: User, reviewer: User, db: AsyncSession) -> None:
    sub = await _make_submission_under_review(submitter, db)
    resp = await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer.id)},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["reviewer_id"] == str(reviewer.id)
    assert data["submitted_at"] is None


@pytest.mark.asyncio
async def test_reviewer_cannot_review_own_submission(
    client: AsyncClient, admin: User, submitter: User, db: AsyncSession
) -> None:
    """Submitter also has reviewer role to test self-review guard."""
    from tests.conftest import _make_user
    from app.models.user import UserRole
    reviewer_submitter = _make_user(UserRole.REVIEWER)
    db.add(reviewer_submitter)
    await db.commit()

    sub = Submission(
        title="Own sub",
        abstract_text="text",
        presenting_author_id=reviewer_submitter.id,
        co_authors=[],
        keywords=[],
        status=SubmissionStatus.UNDER_REVIEW,
        submission_type_preference="oral",
    )
    db.add(sub)
    await db.commit()

    resp = await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer_submitter.id)},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_cannot_assign_reviewer_twice(
    client: AsyncClient, admin: User, submitter: User, reviewer: User, db: AsyncSession
) -> None:
    sub = await _make_submission_under_review(submitter, db)
    await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer.id)},
        headers=auth_header(admin),
    )
    resp = await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer.id)},
        headers=auth_header(admin),
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_submit_review(
    client: AsyncClient, admin: User, submitter: User, reviewer: User, db: AsyncSession
) -> None:
    sub = await _make_submission_under_review(submitter, db)
    assign_resp = await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer.id)},
        headers=auth_header(admin),
    )
    review_id = assign_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/reviews/{review_id}/submit",
        json={"score": 4, "recommendation": "oral", "comments": "Great work"},
        headers=auth_header(reviewer),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["score"] == 4
    assert data["submitted_at"] is not None


@pytest.mark.asyncio
async def test_reviewer_cannot_submit_another_reviewers_review(
    client: AsyncClient, admin: User, submitter: User, reviewer: User, db: AsyncSession
) -> None:
    from tests.conftest import _make_user
    from app.models.user import UserRole
    other_reviewer = _make_user(UserRole.REVIEWER)
    db.add(other_reviewer)
    await db.commit()

    sub = await _make_submission_under_review(submitter, db)
    assign_resp = await client.post(
        "/api/v1/reviews/",
        json={"submission_id": str(sub.id), "reviewer_id": str(reviewer.id)},
        headers=auth_header(admin),
    )
    review_id = assign_resp.json()["id"]

    resp = await client.post(
        f"/api/v1/reviews/{review_id}/submit",
        json={"score": 3, "recommendation": "poster"},
        headers=auth_header(other_reviewer),
    )
    assert resp.status_code == 403
