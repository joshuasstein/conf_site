"""Decision service: record accept/reject outcomes."""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision import Decision
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.decision import DecisionCreate
from app.services.submission import transition_submission


async def record_decision(payload: DecisionCreate, actor: User, db: AsyncSession) -> Decision:
    """Record the committee decision and advance submission to 'decided'.

    Raises 409 if a decision already exists for this submission.
    """
    if actor.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can record decisions")

    result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if sub.status != SubmissionStatus.UNDER_REVIEW:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Submission is not under review")

    existing = await db.execute(select(Decision).where(Decision.submission_id == payload.submission_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Decision already recorded")

    decision = Decision(
        submission_id=payload.submission_id,
        outcome=payload.outcome,
        decided_by_id=actor.id,
    )
    db.add(decision)
    await db.flush()

    # Advance submission status
    await transition_submission(payload.submission_id, SubmissionStatus.DECIDED, actor, db)
    await db.refresh(decision)
    return decision


async def get_decision(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> Decision:
    result = await db.execute(select(Decision).where(Decision.submission_id == submission_id))
    decision = result.scalar_one_or_none()
    if not decision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No decision recorded")
    if actor.role == UserRole.SUBMITTER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view decisions directly")
    return decision
