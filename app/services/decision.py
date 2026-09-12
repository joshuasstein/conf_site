"""Decision service: record accept/reject outcomes."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.decision import Decision
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import Conflict, InvalidOperation, NotFound, PermissionDenied
from app.schemas.decision import DecisionCreate, DecisionOverride
from app.services.submission import transition_submission


async def record_decision(payload: DecisionCreate, actor: User, db: AsyncSession) -> Decision:
    """Record the committee decision and advance submission to 'decided'.

    Raises 409 if a decision already exists for this submission.
    """
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise PermissionDenied("Only admins and program chairs can record decisions")

    result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")
    if sub.status != SubmissionStatus.UNDER_REVIEW:
        raise InvalidOperation("Submission is not under review")

    existing = await db.execute(select(Decision).where(Decision.submission_id == payload.submission_id))
    if existing.scalar_one_or_none():
        raise Conflict("Decision already recorded")

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


async def override_decision(submission_id: uuid.UUID, payload: DecisionOverride, actor: User, db: AsyncSession) -> Decision:
    """Override the recorded committee decision for a submission.

    Available to admins and program chairs. Unlike ``record_decision`` this works
    regardless of the submission's current status and whether a decision already
    exists. It updates (or creates) the Decision outcome and writes an audit-log
    entry; it deliberately does NOT walk the submission state machine or re-send
    notification emails — a separate status override handles those if needed.
    """
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise PermissionDenied("Only admins and program chairs can override decisions")

    result = await db.execute(select(Submission).where(Submission.id == submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")

    result = await db.execute(select(Decision).where(Decision.submission_id == submission_id))
    decision = result.scalar_one_or_none()
    previous = decision.outcome if decision else None

    if decision:
        decision.outcome = payload.outcome
        decision.decided_by_id = actor.id
    else:
        decision = Decision(
            submission_id=submission_id,
            outcome=payload.outcome,
            decided_by_id=actor.id,
        )
        db.add(decision)

    db.add(AuditLog(
        actor_id=actor.id,
        action="decision_override",
        target_type="submission",
        target_id=submission_id,
        detail={"from": previous, "to": payload.outcome},
    ))
    await db.commit()
    await db.refresh(decision)
    return decision


async def get_decision(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> Decision:
    result = await db.execute(select(Decision).where(Decision.submission_id == submission_id))
    decision = result.scalar_one_or_none()
    if not decision:
        raise NotFound("No decision recorded")
    if actor.role == UserRole.SUBMITTER:
        raise PermissionDenied("Not authorized to view decisions directly")
    return decision
