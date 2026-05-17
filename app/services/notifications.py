"""Notification service: bulk email queuing for decision notifications."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.email_job import EmailJob, EmailTemplate
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import PermissionDenied
from app.schemas.admin import BulkNotifyResponse
from app.services.submission import transition_submission


async def bulk_notify_decisions(actor: User, db: AsyncSession, *, dry_run: bool = False) -> BulkNotifyResponse:
    """Queue decision-accepted or decision-rejected emails for all assigned_to_session submissions.

    Batches are handled by the EmailJob worker. This function only creates the jobs.
    Raises 403 if caller is not admin.
    """
    if actor.role != UserRole.ADMIN:
        raise PermissionDenied("Only admins can trigger bulk notifications")

    result = await db.execute(
        select(Submission)
        .where(Submission.status == SubmissionStatus.ASSIGNED_TO_SESSION)
        .options(
            selectinload(Submission.presenting_author),
            selectinload(Submission.decision),
            selectinload(Submission.session_slot).selectinload(SessionSlot.session),
        )
    )
    submissions = list(result.scalars().all())

    if dry_run:
        return BulkNotifyResponse(queued=len(submissions), dry_run=True)

    now = datetime.now(timezone.utc)
    queued = 0
    for sub in submissions:
        slot = sub.session_slot
        session = slot.session if slot else None

        if sub.decision:
            outcome = sub.decision.outcome
        elif session and session.session_type in ("oral", "poster"):
            outcome = session.session_type
        else:
            continue

        is_accepted = outcome in ("oral", "poster")

        if is_accepted:
            template_model: dict = {
                "full_name": sub.presenting_author.full_name,
                "submission_title": sub.title,
                "outcome": outcome,
                "submission_id": str(sub.id),
            }
            if session:
                template_model["session_title"] = session.title
                template_model["session_date"] = session.session_date.strftime("%B %-d, %Y")
                template_model["session_start_time"] = session.start_time.strftime("%-I:%M %p")
                template_model["slot_order"] = slot.slot_order
            template_alias = EmailTemplate.DECISION_ACCEPTED
        else:
            template_model = {
                "full_name": sub.presenting_author.full_name,
                "submission_title": sub.title,
            }
            template_alias = EmailTemplate.DECISION_REJECTED

        db.add(EmailJob(
            recipient_email=sub.presenting_author.email,
            recipient_name=sub.presenting_author.full_name,
            template_alias=template_alias,
            template_model=template_model,
            created_by_id=actor.id,
        ))
        if sub.decision:
            sub.decision.notification_sent_at = now
        await transition_submission(sub.id, SubmissionStatus.NOTIFIED, actor, db)
        queued += 1

    await db.commit()
    return BulkNotifyResponse(queued=queued, dry_run=False)
