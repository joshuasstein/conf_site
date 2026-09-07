"""Broadcast service: email a filtered subset of users (admin / program chair).

Resolves an audience from a set of filters, then queues one custom EmailJob per
recipient. The EmailJob worker sends them via Postmark — nothing is sent from the
request handler.
"""
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.errors import PermissionDenied
from app.models.audit_log import AuditLog
from app.models.email_job import EmailJob, TemplateAlias
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.schemas.broadcast import (
    AudienceFilter,
    BroadcastPreviewResponse,
    BroadcastResponse,
    RecipientRead,
)

_SAMPLE_LIMIT = 50

# Admins and program chairs may broadcast.
_ALLOWED_ROLES = (UserRole.ADMIN, UserRole.PROGRAM_CHAIR)


def _require_broadcaster(actor: User) -> None:
    if actor.role not in _ALLOWED_ROLES:
        raise PermissionDenied("Only admins and program chairs can email users")


def _audience_query(filters: AudienceFilter) -> Select:
    """Build a SELECT of distinct users matching all provided filters."""
    q = select(User)
    if filters.roles:
        q = q.where(User.role.in_(filters.roles))
    if filters.email_verified is not None:
        q = q.where(User.email_verified == filters.email_verified)
    if filters.submission_statuses:
        # Users with at least one submission in one of the given statuses.
        sub = select(Submission.presenting_author_id).where(
            Submission.status.in_(filters.submission_statuses)
        )
        q = q.where(User.id.in_(sub))
    return q


async def preview_audience(filters: AudienceFilter, actor: User, db: AsyncSession) -> BroadcastPreviewResponse:
    _require_broadcaster(actor)
    base = _audience_query(filters)

    count = await db.scalar(select(func.count()).select_from(base.subquery()))
    result = await db.execute(base.order_by(User.full_name).limit(_SAMPLE_LIMIT))
    sample = [RecipientRead.model_validate(u) for u in result.scalars().all()]
    return BroadcastPreviewResponse(count=count or 0, sample=sample)


async def send_broadcast(
    filters: AudienceFilter,
    subject: str,
    body: str,
    actor: User,
    db: AsyncSession,
) -> BroadcastResponse:
    _require_broadcaster(actor)

    result = await db.execute(_audience_query(filters).order_by(User.full_name))
    users = list(result.scalars().all())

    for user in users:
        db.add(EmailJob(
            recipient_email=user.email,
            recipient_name=user.full_name,
            template_alias=TemplateAlias.CUSTOM_BROADCAST,
            template_model={"subject": subject, "body": body, "full_name": user.full_name},
            created_by_id=actor.id,
        ))

    # Governance: record who emailed whom, with what, and how many.
    db.add(AuditLog(
        actor_id=actor.id,
        action="broadcast_email",
        target_type="broadcast",
        target_id=actor.id,
        detail={
            "subject": subject,
            "recipient_count": len(users),
            "filters": filters.model_dump(),
            "at": datetime.now(timezone.utc).isoformat(),
        },
    ))

    await db.commit()
    return BroadcastResponse(queued=len(users))
