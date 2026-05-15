"""Submission service: CRUD and state machine transitions."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.audit_log import AuditLog
from app.models.email_job import EmailJob, EmailTemplate
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import SubmissionCreate, SubmissionUpdate


async def get_submission_or_404(submission_id: uuid.UUID, db: AsyncSession) -> Submission:
    result = await db.execute(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(selectinload(Submission.presenting_author))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    return sub


async def list_submissions(actor: User, db: AsyncSession) -> list[Submission]:
    """Submitters see only their own; reviewers/chairs/admins see all."""
    q = select(Submission).options(selectinload(Submission.presenting_author))
    if actor.role == UserRole.SUBMITTER:
        q = q.where(Submission.presenting_author_id == actor.id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def create_submission(payload: SubmissionCreate, author: User, db: AsyncSession) -> Submission:
    """Create a draft submission. Raises 403 if role is not submitter."""
    if author.role not in (UserRole.SUBMITTER, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only submitters can create submissions")
    sub = Submission(
        title=payload.title,
        abstract_text=payload.abstract_text,
        presenting_author_id=author.id,
        co_authors=[a.model_dump() for a in payload.co_authors],
        keywords=payload.keywords,
        track=payload.track,
        submission_type_preference=payload.submission_type_preference,
        status=SubmissionStatus.DRAFT,
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def update_submission(
    submission_id: uuid.UUID, payload: SubmissionUpdate, actor: User, db: AsyncSession
) -> Submission:
    """Update a draft submission. Only the owner or admin can edit; only drafts are editable."""
    sub = await get_submission_or_404(submission_id, db)
    _assert_owner_or_admin(sub, actor)
    if sub.status != SubmissionStatus.DRAFT and actor.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only draft submissions can be edited")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "co_authors":
            setattr(sub, field, [a if isinstance(a, dict) else a.model_dump() for a in value])
        else:
            setattr(sub, field, value)
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(sub)
    return sub


async def delete_submission(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> None:
    """Delete a draft submission."""
    sub = await get_submission_or_404(submission_id, db)
    _assert_owner_or_admin(sub, actor)
    if sub.status != SubmissionStatus.DRAFT and actor.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Only draft submissions can be deleted")
    await db.delete(sub)
    await db.commit()


async def transition_submission(
    submission_id: uuid.UUID,
    target_status: str,
    actor: User,
    db: AsyncSession,
    *,
    admin_override: bool = False,
    override_reason: str | None = None,
) -> Submission:
    """Advance submission status through the state machine.

    Raises 422 if the transition is invalid (unless admin_override=True).
    Admin overrides are always logged to AuditLog.
    """
    sub = await get_submission_or_404(submission_id, db)
    settings = get_settings()
    now = datetime.now(timezone.utc)

    if admin_override:
        if actor.role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can override status")
        db.add(AuditLog(
            actor_id=actor.id,
            action="status_override",
            target_type="submission",
            target_id=submission_id,
            detail={"from": sub.status, "to": target_status, "reason": override_reason},
        ))
    else:
        allowed = SubmissionStatus.TRANSITIONS.get(sub.status, [])
        if target_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cannot transition from '{sub.status}' to '{target_status}'",
            )
        _enforce_role_for_transition(sub.status, target_status, actor, settings, now)

    old_status = sub.status
    sub.status = target_status
    if target_status == SubmissionStatus.SUBMITTED:
        sub.submitted_at = now
    sub.updated_at = now

    await _queue_transition_emails(sub, old_status, target_status, actor, db)
    await db.commit()
    await db.refresh(sub)
    return sub


def _assert_owner_or_admin(sub: Submission, actor: User) -> None:
    if actor.role == UserRole.ADMIN:
        return
    if sub.presenting_author_id != actor.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not the submission owner")


def _enforce_role_for_transition(
    from_status: str, to_status: str, actor: User, settings, now: datetime
) -> None:
    S = SubmissionStatus
    role = actor.role

    # submitter transitions
    if from_status == S.DRAFT and to_status == S.SUBMITTED:
        if role != UserRole.SUBMITTER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only submitters can submit")
        if now > settings.submission_deadline:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Submission deadline has passed")

    elif from_status == S.NOTIFIED and to_status in (S.CONFIRMED, S.WITHDRAWN):
        if role != UserRole.SUBMITTER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only submitters can confirm or withdraw")

    elif from_status == S.CONFIRMED and to_status == S.FILES_SUBMITTED:
        if role != UserRole.SUBMITTER:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only submitters can submit files")
        if now > settings.file_submission_deadline:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="File submission deadline has passed")

    # admin transitions
    elif from_status == S.SUBMITTED and to_status == S.UNDER_REVIEW:
        if role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can open review")

    elif from_status == S.UNDER_REVIEW and to_status == S.DECIDED:
        if role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can record decisions")

    elif from_status == S.DECIDED and to_status == S.ASSIGNED_TO_SESSION:
        if role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only program chairs can assign sessions")

    elif from_status == S.ASSIGNED_TO_SESSION and to_status == S.NOTIFIED:
        if role != UserRole.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can trigger notifications")


async def _queue_transition_emails(
    sub: Submission, old_status: str, new_status: str, actor: User, db: AsyncSession
) -> None:
    S = SubmissionStatus
    if new_status == S.SUBMITTED:
        db.add(EmailJob(
            recipient_email=sub.presenting_author.email,
            recipient_name=sub.presenting_author.full_name,
            template_alias=EmailTemplate.SUBMISSION_CONFIRMATION,
            template_model={"title": sub.title, "submission_id": str(sub.id)},
            created_by_id=actor.id,
        ))
