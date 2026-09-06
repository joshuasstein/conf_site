"""Background email worker: polls EmailJob table and sends via Postmark."""
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

_MAX_RETRIES = 3


def _format_conf_dates(conf) -> str:
    start = conf.conference_start_date
    end = conf.conference_end_date
    if not start and not end:
        return ""
    if start and not end:
        return start.strftime("%B %-d, %Y")
    if end and not start:
        return end.strftime("%B %-d, %Y")
    if start.year == end.year and start.month == end.month:
        return f"{start.strftime('%B %-d')}–{end.strftime('%-d, %Y')}"
    if start.year == end.year:
        return f"{start.strftime('%B %-d')}–{end.strftime('%B %-d, %Y')}"
    return f"{start.strftime('%B %-d, %Y')}–{end.strftime('%B %-d, %Y')}"


_POSTMARK_ENDPOINT = "https://api.postmarkapp.com/email"


def _report_to_sentry(job: EmailJob, exc: Exception) -> None:
    """Alert on a permanently-failed email job (no-op unless Sentry is configured)."""
    if not get_settings().sentry_dsn:
        return
    try:
        import sentry_sdk

        with sentry_sdk.new_scope() as scope:
            scope.set_tag("email_template", job.template_alias)
            scope.set_context(
                "email_job",
                {
                    "id": str(job.id),
                    "recipient": job.recipient_email,
                    "template": job.template_alias,
                    "retry_count": job.retry_count,
                },
            )
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001 — alerting must never break the worker
        logger.exception("Failed to report email job %s to Sentry", job.id)


async def _send_via_postmark(job: EmailJob, db: AsyncSession) -> None:
    """Render and send a single email via the Postmark API. Raises on failure."""
    settings = get_settings()
    conf = await get_conference_settings(db)

    if not conf.email_from_address:
        raise RuntimeError("email_from_address is not configured in Conference Settings")
    if not settings.postmark_api_token:
        raise RuntimeError("POSTMARK_API_TOKEN is not configured")

    sender = (
        f"{conf.email_from_name} <{conf.email_from_address}>"
        if conf.email_from_name
        else conf.email_from_address
    )

    conf_model = {
        "conference_name": conf.conference_name or "",
        "conference_location": conf.location or "",
        "conference_dates": _format_conf_dates(conf),
        **job.template_model,
    }
    subject, html, text = await render(job.template_alias, conf_model, db)

    payload = {
        "From": sender,
        "To": job.recipient_email,
        "Subject": subject,
        "HtmlBody": html,
        "TextBody": text,
        "MessageStream": settings.postmark_message_stream,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            _POSTMARK_ENDPOINT,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Postmark-Server-Token": settings.postmark_api_token,
            },
            json=payload,
        )
    if resp.status_code != 200:
        # Postmark returns a JSON body with ErrorCode + Message on failure.
        raise RuntimeError(f"Postmark send failed: HTTP {resp.status_code} {resp.text}")


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

    for job in jobs:
        try:
            await _send_via_postmark(job, db)
            job.status = EmailJobStatus.SENT
            job.sent_at = datetime.now(timezone.utc)
            job.error_message = None
        except Exception as exc:
            job.retry_count += 1
            job.error_message = str(exc)
            if job.retry_count >= _MAX_RETRIES:
                job.status = EmailJobStatus.FAILED
                logger.error("Email job %s permanently failed: %s", job.id, exc)
                _report_to_sentry(job, exc)
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
