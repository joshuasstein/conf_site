"""Review service: assignment and submission of reviewer feedback."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import Conflict, InvalidOperation, NotFound, PermissionDenied
from app.schemas.review import ReviewSubmit


async def assign_reviewer(submission_id: uuid.UUID, reviewer_id: uuid.UUID, actor: User, db: AsyncSession) -> Review:
    """Assign a reviewer to a submission. Prevents self-review.

    Raises 400 if reviewer already assigned or would review their own submission.
    """
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")
    if sub.status not in (SubmissionStatus.SUBMITTED, SubmissionStatus.UNDER_REVIEW):
        raise InvalidOperation("Submission must be submitted or under review to assign a reviewer")

    if sub.status == SubmissionStatus.SUBMITTED:
        sub.status = SubmissionStatus.UNDER_REVIEW

    result = await db.execute(select(User).where(User.id == reviewer_id))
    reviewer = result.scalar_one_or_none()
    if not reviewer or reviewer.role not in (UserRole.REVIEWER, UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise InvalidOperation("Invalid reviewer")
    if reviewer.id == sub.presenting_author_id:
        raise InvalidOperation("Reviewer cannot review their own submission")

    existing = await db.execute(
        select(Review).where(Review.submission_id == submission_id, Review.reviewer_id == reviewer_id)
    )
    if existing.scalar_one_or_none():
        raise Conflict("Reviewer already assigned")

    review = Review(submission_id=submission_id, reviewer_id=reviewer_id)
    db.add(review)
    # No per-assignment email — reviewers are notified in one digest via the
    # "Notify Reviewers" action (services.notifications.notify_reviewers).
    await db.commit()
    await db.refresh(review)
    return review


async def list_my_reviews(actor: User, db: AsyncSession) -> list[Review]:
    """Return all reviews assigned to the calling reviewer, with submission eagerly loaded."""
    result = await db.execute(
        select(Review)
        .where(Review.reviewer_id == actor.id)
        .options(selectinload(Review.submission).selectinload(Submission.attachments))
        .order_by(Review.created_at.desc())
    )
    return list(result.scalars().all())


async def list_reviews_for_submission(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> list[Review]:
    """Return reviews. Reviewers only see their own; chairs/admins see all."""
    q = select(Review).where(Review.submission_id == submission_id)
    if actor.role == UserRole.REVIEWER:
        q = q.where(Review.reviewer_id == actor.id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def unassign_reviewer(review_id: uuid.UUID, actor: User, db: AsyncSession) -> None:
    """Remove a reviewer assignment. Admins and program chairs only.

    Deletes the review row, including any feedback the reviewer had already
    submitted. Raises 404 if the review does not exist.
    """
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise PermissionDenied("Insufficient permissions")
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise NotFound("Review not found")
    await db.delete(review)
    await db.commit()


async def submit_review(review_id: uuid.UUID, payload: ReviewSubmit, actor: User, db: AsyncSession) -> Review:
    """Record a reviewer's score and recommendation.

    Raises 403 if caller is not the assigned reviewer.
    """
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise NotFound("Review not found")
    if actor.role not in (UserRole.ADMIN,) and review.reviewer_id != actor.id:
        raise PermissionDenied("Not your review")
    if review.submitted_at is not None:
        raise InvalidOperation("Review already submitted")

    review.score = payload.score
    review.recommendation = payload.recommendation
    review.comments = payload.comments
    review.comments_for_author = payload.comments_for_author
    review.submitted_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(review)
    return review
