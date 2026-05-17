from typing import Annotated

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import require_admin
from app.errors import InvalidOperation
from app.models.email_job import EmailJob, EmailTemplate
from app.models.user import User
from app.schemas.admin import BulkNotifyRequest, BulkNotifyResponse
from app.services.conference_settings import get_conference_settings
from app.services.notifications import bulk_notify_decisions
from app.workers.email_templates import _REGISTRY

router = APIRouter(prefix="/notifications", tags=["notifications"])

AdminUser = Annotated[User, Depends(require_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/resend-status")
async def resend_status(current_user: AdminUser, db: DB):
    """Return a live diagnostic of the Resend integration."""
    settings = get_settings()
    conf = await get_conference_settings(db)

    api_key_set = bool(settings.resend_api_key)
    from_address = conf.email_from_address
    from_name = conf.email_from_name

    resend_ok = False
    resend_error: str | None = None
    if api_key_set:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    "https://api.resend.com/domains",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                )
            if resp.status_code == 200:
                resend_ok = True
            else:
                resend_error = f"Resend returned HTTP {resp.status_code}: {resp.text[:200]}"
        except Exception as exc:
            resend_error = str(exc)
    else:
        resend_error = "RESEND_API_KEY is not set"

    return {
        "api_key_set": api_key_set,
        "resend_reachable": resend_ok,
        "resend_error": resend_error,
        "from_address": from_address,
        "from_name": from_name,
        "from_address_configured": bool(from_address),
    }


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
async def send_test_email(payload: TestEmailRequest, current_user: AdminUser, db: DB):
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
