"""Decision service: record accept/reject outcomes."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditLog
from app.models.decision import Decision
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import Conflict, InvalidOperation, NotFound, PermissionDenied
from app.schemas.decision import DecisionCreate, DecisionOverride
from app.services.conference_settings import get_conference_settings
from app.services import type_config
from app.services.submission import transition_submission

# Submissions at or past the "decided" milestone, for the Decisions list.
_DECIDED_OR_BEYOND = (
    SubmissionStatus.DECIDED,
    SubmissionStatus.ASSIGNED_TO_SESSION,
    SubmissionStatus.NOTIFIED,
    SubmissionStatus.CONFIRMED,
    SubmissionStatus.FILES_SUBMITTED,
    SubmissionStatus.WITHDRAWN,
)


async def _validate_outcome(db: AsyncSession, outcome: str) -> None:
    conf = await get_conference_settings(db)
    if outcome not in type_config.decision_outcome_keys(conf):
        raise InvalidOperation(f"Unknown decision outcome '{outcome}'")


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

    await _validate_outcome(db, payload.outcome)

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

    await _validate_outcome(db, payload.outcome)

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


async def list_decisions(actor: User, db: AsyncSession) -> list[dict]:
    """Every submission at or past 'decided', with presenter, title, outcome, and
    assigned session name (for admins & program chairs)."""
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        raise PermissionDenied("Not authorized to view decisions")

    result = await db.execute(
        select(Submission)
        .where(Submission.status.in_(_DECIDED_OR_BEYOND))
        .options(
            selectinload(Submission.presenting_author),
            selectinload(Submission.decision),
            selectinload(Submission.session_slot).selectinload(SessionSlot.session),
        )
        .order_by(Submission.title)
    )
    items: list[dict] = []
    for sub in result.scalars().all():
        session = sub.session_slot.session if sub.session_slot else None
        items.append({
            "submission_id": sub.id,
            "title": sub.title,
            "presenter_name": sub.presenting_author.full_name if sub.presenting_author else "",
            "status": sub.status,
            "outcome": sub.decision.outcome if sub.decision else None,
            "session_title": session.title if session else None,
        })
    return items
