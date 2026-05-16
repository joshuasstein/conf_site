"""Background email worker: polls EmailJob table and sends via Postmark."""
import asyncio
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_session_factory
from app.models.email_job import EmailJob, EmailJobStatus

logger = logging.getLogger(__name__)

_POSTMARK_BASE = "https://api.postmarkapp.com"
_MAX_RETRIES = 3


async def _send_via_postmark(job: EmailJob, client: httpx.AsyncClient) -> None:
    """Send a single email via Postmark templated email API. Raises on failure."""
    settings = get_settings()
    resp = await client.post(
        f"{_POSTMARK_BASE}/email/withTemplate",
        json={
            "From": "noreply@conf.example.com",
            "To": job.recipient_email,
            "TemplateAlias": job.template_alias,
            "TemplateModel": job.template_model,
        },
        headers={
            "X-Postmark-Server-Token": settings.postmark_api_key,
            "Accept": "application/json",
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
                await _send_via_postmark(job, client)
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
