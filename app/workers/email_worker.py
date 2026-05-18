"""Background email worker: polls EmailJob table and sends via AWS SES."""
import asyncio
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import BotoCoreError, ClientError
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


def _get_ses_client(settings):
    return boto3.client(
        "ses",
        region_name=settings.aws_ses_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


async def _send_via_ses(job: EmailJob, db: AsyncSession) -> None:
    """Render and send a single email via AWS SES. Raises on failure."""
    settings = get_settings()
    conf = await get_conference_settings(db)

    if not conf.email_from_address:
        raise RuntimeError("email_from_address is not configured in Conference Settings")

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

    client = _get_ses_client(settings)
    # boto3 SES calls are synchronous; run in executor to avoid blocking the event loop.
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: client.send_email(
            Source=sender,
            Destination={"ToAddresses": [job.recipient_email]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text, "Charset": "UTF-8"},
                    "Html": {"Data": html, "Charset": "UTF-8"},
                },
            },
        ),
    )


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
            await _send_via_ses(job, db)
            job.status = EmailJobStatus.SENT
            job.sent_at = datetime.now(timezone.utc)
            job.error_message = None
        except (BotoCoreError, ClientError) as exc:
            job.retry_count += 1
            job.error_message = str(exc)
            if job.retry_count >= _MAX_RETRIES:
                job.status = EmailJobStatus.FAILED
                logger.error("Email job %s permanently failed: %s", job.id, exc)
            else:
                logger.warning("Email job %s failed (attempt %d): %s", job.id, job.retry_count, exc)
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
