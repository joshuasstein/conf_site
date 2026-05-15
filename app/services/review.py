"""Review service: assignment and submission of reviewer feedback."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.email_job import EmailJob, EmailTemplate
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.review import ReviewSubmit


async def assign_reviewer(submission_id: uuid.UUID, reviewer_id: uuid.UUID, actor: User, db: AsyncSession) -> Review:
    """Assign a reviewer to a submission. Prevents self-review.

    Raises 400 if reviewer already assigned or would review their own submission.
    """
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if sub.status != SubmissionStatus.UNDER_REVIEW:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Submission is not under review")

    result = await db.execute(select(User).where(User.id == reviewer_id))
    reviewer = result.scalar_one_or_none()
    if not reviewer or reviewer.role not in (UserRole.REVIEWER, UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reviewer")
    if reviewer.id == sub.presenting_author_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reviewer cannot review their own submission")

    existing = await db.execute(
        select(Review).where(Review.submission_id == submission_id, Review.reviewer_id == reviewer_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Reviewer already assigned")

    review = Review(submission_id=submission_id, reviewer_id=reviewer_id)
    db.add(review)
    await db.flush()

    db.add(EmailJob(
        recipient_email=reviewer.email,
        recipient_name=reviewer.full_name,
        template_alias=EmailTemplate.REVIEW_ASSIGNMENT,
        template_model={"submission_title": sub.title, "submission_id": str(submission_id)},
        created_by_id=actor.id,
    ))
    await db.commit()
    await db.refresh(review)
    return review


async def list_reviews_for_submission(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> list[Review]:
    """Return reviews. Reviewers only see their own; chairs/admins see all."""
    q = select(Review).where(Review.submission_id == submission_id)
    if actor.role == UserRole.REVIEWER:
        q = q.where(Review.reviewer_id == actor.id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def submit_review(review_id: uuid.UUID, payload: ReviewSubmit, actor: User, db: AsyncSession) -> Review:
    """Record a reviewer's score and recommendation.

    Raises 403 if caller is not the assigned reviewer.
    """
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Review not found")
    if actor.role not in (UserRole.ADMIN,) and review.reviewer_id != actor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your review")
    if review.submitted_at is not None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Review already submitted")

    review.score = payload.score
    review.recommendation = payload.recommendation
    review.comments = payload.comments
    review.comments_for_author = payload.comments_for_author
    review.submitted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    return review
