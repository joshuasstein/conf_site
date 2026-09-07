from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_program_chair
from app.errors import InvalidOperation
from app.models.email_job import EmailJob, EmailTemplate
from app.models.user import User
from app.schemas.admin import BulkNotifyRequest, BulkNotifyResponse
from app.services.notifications import bulk_notify_decisions
from app.workers.email_templates import _REGISTRY

router = APIRouter(prefix="/notifications", tags=["notifications"])

# Admins and program chairs may notify, test, and monitor email.
StaffUser = Annotated[User, Depends(require_program_chair)]
DB = Annotated[AsyncSession, Depends(get_db)]


_PLACEHOLDER: dict[str, dict] = {
    "submission-confirmation": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
        "submission_id": "00000000-0000-0000-0000-000000000001",
    },
    "decision-accepted": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
        "submission_id": "00000000-0000-0000-0000-000000000001",
        "outcome": "oral",
        "session_title": "PV Performance & Reliability",
        "session_date": "2026-09-10",
        "session_start_time": "09:00",
        "slot_order": 2,
    },
    "decision-rejected": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
    },
    "review-assignment": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
        "submission_id": "00000000-0000-0000-0000-000000000001",
    },
    "file-submission-reminder": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
        "submission_id": "00000000-0000-0000-0000-000000000001",
        "session_title": "PV Performance & Reliability",
        "session_date": "2026-09-10",
        "session_start_time": "09:00",
        "slot_order": 2,
    },
    "confirmation-reminder": {
        "full_name": "Jane Smith",
        "submission_title": "Novel Approaches to PV Cell Degradation",
        "submission_id": "00000000-0000-0000-0000-000000000001",
        "session_title": "PV Performance & Reliability",
        "session_date": "2026-09-10",
        "session_start_time": "09:00",
        "slot_order": 2,
        "confirmation_deadline": "2026-08-01",
    },
}

_SENDABLE_TEMPLATES = set(_PLACEHOLDER.keys())


class TestEmailRequest(BaseModel):
    template: str


@router.post("/test-email", status_code=202)
async def send_test_email(payload: TestEmailRequest, current_user: StaffUser, db: DB):
    if payload.template not in _SENDABLE_TEMPLATES:
        raise InvalidOperation(f"Unknown or unsendable template: {payload.template!r}")
    if payload.template not in _REGISTRY:
        raise InvalidOperation(f"Template not registered: {payload.template!r}")
    db.add(EmailJob(
        recipient_email=current_user.email,
        recipient_name=current_user.full_name,
        template_alias=payload.template,
        template_model=_PLACEHOLDER[payload.template],
        created_by_id=current_user.id,
    ))
    await db.commit()
    return {"queued": True}


@router.get("/email-jobs")
async def list_email_jobs(current_user: StaffUser, db: DB, status: str | None = None):
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
