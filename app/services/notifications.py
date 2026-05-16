"""Notification service: bulk email queuing for decision notifications."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.decision import Decision
from app.models.email_job import EmailJob, EmailTemplate
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import PermissionDenied
from app.schemas.admin import BulkNotifyResponse
from app.services.submission import transition_submission


async def bulk_notify_decisions(actor: User, db: AsyncSession, *, dry_run: bool = False) -> BulkNotifyResponse:
    """Queue decision notification emails for all assigned_to_session submissions.

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
            selectinload(Submission.session_slot),
        )
    )
    submissions = list(result.scalars().all())

    if dry_run:
        return BulkNotifyResponse(queued=len(submissions), dry_run=True)

    now = datetime.now(timezone.utc)
    queued = 0
    for sub in submissions:
        if not sub.decision:
            continue
        template_model = {
            "full_name": sub.presenting_author.full_name,
            "submission_title": sub.title,
            "outcome": sub.decision.outcome,
        }
        db.add(EmailJob(
            recipient_email=sub.presenting_author.email,
            recipient_name=sub.presenting_author.full_name,
            template_alias=EmailTemplate.DECISION_NOTIFICATION,
            template_model=template_model,
            created_by_id=actor.id,
        ))
        sub.decision.notification_sent_at = now
        # Advance status
        await transition_submission(sub.id, SubmissionStatus.NOTIFIED, actor, db)
        queued += 1

    await db.commit()
    return BulkNotifyResponse(queued=queued, dry_run=False)
