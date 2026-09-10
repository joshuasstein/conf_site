"""Submission service: CRUD and state machine transitions."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import InvalidOperation, NotFound, PermissionDenied
from app.models.audit_log import AuditLog
from app.models.email_job import EmailJob, EmailTemplate
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.submission import SubmissionCreate, SubmissionUpdate
from app.services import abstract_state_machine
from app.services.abstract_state_machine import RejectionKind
from app.services.conference_settings import get_conference_settings


async def get_submission(submission_id: uuid.UUID, db: AsyncSession) -> Submission:
    result = await db.execute(
        select(Submission)
        .where(Submission.id == submission_id)
        .options(selectinload(Submission.presenting_author), selectinload(Submission.attachments))
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")
    return sub


async def list_submissions(actor: User, db: AsyncSession) -> list[Submission]:
    """Chairs/admins see all; everyone else (submitters, reviewers) sees only
    their own submissions. Reviewers access the abstracts they must review via
    their review assignments (My Reviews), not this list."""
    q = select(Submission).options(
        selectinload(Submission.presenting_author), selectinload(Submission.attachments)
    )
    if actor.role not in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        q = q.where(Submission.presenting_author_id == actor.id)
    result = await db.execute(q)
    return list(result.scalars().all())


async def get_submission_for_actor(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> Submission:
    """Fetch a submission with an access check. Admins/chairs see any; a submitter
    sees only their own; a reviewer sees only submissions assigned to them."""
    sub = await get_submission(submission_id, db)
    if actor.role in (UserRole.ADMIN, UserRole.PROGRAM_CHAIR):
        return sub
    if sub.presenting_author_id == actor.id:
        return sub
    if actor.role == UserRole.REVIEWER:
        from app.models.review import Review
        result = await db.execute(
            select(Review).where(
                Review.submission_id == submission_id, Review.reviewer_id == actor.id
            )
        )
        if result.scalar_one_or_none():
            return sub
    raise PermissionDenied("Not authorized to view this submission")


async def create_submission(payload: SubmissionCreate, author: User, db: AsyncSession) -> Submission:
    if author.role not in (UserRole.SUBMITTER, UserRole.ADMIN):
        raise PermissionDenied("Only submitters can create submissions")
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
    return await get_submission(sub.id, db)


async def update_submission(
    submission_id: uuid.UUID, payload: SubmissionUpdate, actor: User, db: AsyncSession
) -> Submission:
    sub = await get_submission(submission_id, db)
    _assert_owner_or_admin(sub, actor)
    if sub.status != SubmissionStatus.DRAFT and actor.role != UserRole.ADMIN:
        raise InvalidOperation("Only draft submissions can be edited")
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "co_authors":
            setattr(sub, field, [a if isinstance(a, dict) else a.model_dump() for a in value])
        else:
            setattr(sub, field, value)
    sub.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await get_submission(submission_id, db)


async def delete_submission(submission_id: uuid.UUID, actor: User, db: AsyncSession) -> None:
    sub = await get_submission(submission_id, db)
    _assert_owner_or_admin(sub, actor)
    if sub.status != SubmissionStatus.DRAFT and actor.role != UserRole.ADMIN:
        raise InvalidOperation("Only draft submissions can be deleted")
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

    Admin overrides bypass the machine and are always audit-logged.
    All other transitions are validated by abstract_state_machine.validate().
    """
    sub = await get_submission(submission_id, db)
    now = datetime.now(timezone.utc)

    if admin_override:
        if actor.role != UserRole.ADMIN:
            raise PermissionDenied("Only admins can override status")
        db.add(AuditLog(
            actor_id=actor.id,
            action="status_override",
            target_type="submission",
            target_id=submission_id,
            detail={"from": sub.status, "to": target_status, "reason": override_reason},
        ))
    else:
        conf = await get_conference_settings(db)
        result = abstract_state_machine.validate(sub.status, target_status, actor.role, conf, now)
        if isinstance(result, abstract_state_machine.TransitionRejected):
            exc_class = PermissionDenied if result.kind == RejectionKind.FORBIDDEN else InvalidOperation
            raise exc_class(result.reason)

        for email_spec in result.emails:
            db.add(EmailJob(
                recipient_email=sub.presenting_author.email,
                recipient_name=sub.presenting_author.full_name,
                template_alias=email_spec.template,
                template_model={
                    "full_name": sub.presenting_author.full_name,
                    "submission_title": sub.title,
                    "submission_id": str(sub.id),
                },
                created_by_id=actor.id,
            ))
        if result.release_slot:
            slot_result = await db.execute(
                select(SessionSlot).where(SessionSlot.submission_id == submission_id)
            )
            slot = slot_result.scalar_one_or_none()
            if slot:
                await db.delete(slot)

    sub.status = target_status
    if target_status == SubmissionStatus.SUBMITTED:
        sub.submitted_at = now
    sub.updated_at = now
    await db.commit()
    return await get_submission(sub.id, db)


async def request_file_replacement(
    submission_id: uuid.UUID, actor: User, db: AsyncSession
) -> Submission:
    """Program chair returns a files_submitted abstract to confirmed so the presenter can re-upload."""
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Only program chairs can request file replacement")
    sub = await get_submission(submission_id, db)
    if sub.status != SubmissionStatus.FILES_SUBMITTED:
        raise InvalidOperation("Submission is not in files_submitted state")
    sub.status = SubmissionStatus.CONFIRMED
    sub.updated_at = datetime.now(timezone.utc)
    db.add(AuditLog(
        actor_id=actor.id,
        action="file_replacement_requested",
        target_type="submission",
        target_id=submission_id,
        detail={"from": SubmissionStatus.FILES_SUBMITTED, "to": SubmissionStatus.CONFIRMED},
    ))

    from app.models.session import Session  # noqa: PLC0415
    slot_result = await db.execute(
        select(SessionSlot)
        .where(SessionSlot.submission_id == submission_id)
        .options(selectinload(SessionSlot.session))
    )
    slot = slot_result.scalar_one_or_none()
    session: Session | None = slot.session if slot else None

    template_model: dict = {
        "full_name": sub.presenting_author.full_name,
        "submission_title": sub.title,
        "submission_id": str(sub.id),
    }
    if session:
        template_model["session_title"] = session.title
        template_model["session_date"] = session.session_date.strftime("%B %-d, %Y")
        template_model["session_start_time"] = session.start_time.strftime("%-I:%M %p")
        template_model["slot_order"] = slot.slot_order

    db.add(EmailJob(
        recipient_email=sub.presenting_author.email,
        recipient_name=sub.presenting_author.full_name,
        template_alias=EmailTemplate.FILE_SUBMISSION_REMINDER,
        template_model=template_model,
        created_by_id=actor.id,
    ))
    await db.commit()
    return await get_submission(sub.id, db)


def _assert_owner_or_admin(sub: Submission, actor: User) -> None:
    if actor.role == UserRole.ADMIN:
        return
    if sub.presenting_author_id != actor.id:
        raise PermissionDenied("Not the submission owner")
