from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_admin
from app.models.email_job import EmailJob
from app.models.user import User
from app.schemas.admin import BulkNotifyRequest, BulkNotifyResponse
from app.services.notifications import bulk_notify_decisions

router = APIRouter(prefix="/notifications", tags=["notifications"])

AdminUser = Annotated[User, Depends(require_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/email-jobs")
async def list_email_jobs(current_user: AdminUser, db: DB, status: str | None = None):
    q = select(EmailJob).order_by(EmailJob.created_at.desc()).limit(200)
    if status:
        q = q.where(EmailJob.status == status)
    result = await db.execute(q)
    jobs = result.scalars().all()
    return [
        {
            "id": str(j.id),
            "recipient_email": j.recipient_email,
            "template_alias": j.template_alias,
            "status": j.status,
            "error_message": j.error_message,
            "retry_count": j.retry_count,
            "created_at": j.created_at.isoformat(),
            "sent_at": j.sent_at.isoformat() if j.sent_at else None,
        }
        for j in jobs
    ]
