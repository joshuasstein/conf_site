"""Background email worker: polls EmailJob table and sends via Resend."""
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session_factory
from app.models.email_job import EmailJob, EmailJobStatus
from app.services.conference_settings import get_conference_settings
from app.workers.email_templates import render

logger = logging.getLogger(__name__)

_RESEND_SEND_URL = "https://api.resend.com/emails"
_MAX_RETRIES = 3


async def _send_via_resend(job: EmailJob, client: httpx.AsyncClient, db: AsyncSession) -> None:
    """Render and send a single email via Resend. Raises on failure."""
    settings = get_settings()
    conf = await get_conference_settings(db)

    if not conf.email_from_address:
        raise RuntimeError("email_from_address is not configured in Conference Settings")

    sender = (
        f"{conf.email_from_name} <{conf.email_from_address}>"
        if conf.email_from_name
        else conf.email_from_address
    )

    subject, html, text = render(job.template_alias, job.template_model)

    resp = await client.post(
        _RESEND_SEND_URL,
        json={
            "from": sender,
            "to": [job.recipient_email],
            "subject": subject,
            "html": html,
            "text": text,
        },
        headers={
            "Authorization": f"Bearer {settings.resend_api_key}",
            "Content-Type": "application/json",
        },
        timeout=10.0,
    )
    resp.raise_for_status()


async def process_batch(db: AsyncSession) -> int:
    """Fetch up to batch_size pending jobs, send them, and update their status.

    Returns the number of jobs processed.
    """
    settings = get_settings()
    result = await db.execute(
        select(EmailJob)
        .where(EmailJob.status == EmailJobStatus.PENDING, EmailJob.retry_count < _MAX_RETRIES)
        .order_by(EmailJob.created_at)
        .limit(settings.email_batch_size)
        .with_for_update(skip_locked=True)
    )
    jobs = list(result.scalars().all())
    if not jobs:
        return 0

    async with httpx.AsyncClient() as client:
        for job in jobs:
            try:
                await _send_via_resend(job, client, db)
                job.status = EmailJobStatus.SENT
                job.sent_at = datetime.now(timezone.utc)
                job.error_message = None
            except Exception as exc:
                job.retry_count += 1
                job.error_message = str(exc)
                if job.retry_count >= _MAX_RETRIES:
                    job.status = EmailJobStatus.FAILED
                    logger.error("Email job %s permanently failed: %s", job.id, exc)
                else:
                    logger.warning("Email job %s failed (attempt %d): %s", job.id, job.retry_count, exc)

    await db.commit()
    return len(jobs)


async def run_worker() -> None:
    """Main worker loop. Polls every email_worker_interval_seconds."""
    settings = get_settings()
    logger.info("Email worker started (interval=%ds)", settings.email_worker_interval_seconds)
    while True:
        try:
            async with get_session_factory()() as db:
                processed = await process_batch(db)
                if processed:
                    logger.info("Sent %d email(s)", processed)
        except Exception as exc:
            logger.error("Worker iteration error: %s", exc)
        await asyncio.sleep(settings.email_worker_interval_seconds)
