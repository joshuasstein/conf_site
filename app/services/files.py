"""File service: pre-signed S3 URL generation and attachment registration."""
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.attachment import Attachment, FileType
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import InvalidOperation, NotFound, PayloadTooLarge, PermissionDenied
from app.schemas.files import ConfirmUploadRequest, PresignedUploadResponse

_MAX_SIZE: dict[str, int] = {
    FileType.ABSTRACT_DOCUMENT: 10 * 1024 * 1024,       # 10 MB
    FileType.FINAL_PRESENTATION: 100 * 1024 * 1024,     # 100 MB
    FileType.FINAL_POSTER: 100 * 1024 * 1024,           # 100 MB
}

_ALLOWED_MIME: dict[str, set[str]] = {
    FileType.ABSTRACT_DOCUMENT: {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    FileType.FINAL_PRESENTATION: {"application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    FileType.FINAL_POSTER: {"application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"},
}


def _s3_client():
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key_id,
        aws_secret_access_key=settings.s3_secret_access_key,
        region_name=settings.s3_region,
    )


def generate_presigned_put(
    submission_id: uuid.UUID,
    file_type: str,
    original_filename: str,
    mime_type: str,
    size_bytes: int,
) -> PresignedUploadResponse:
    """Return a pre-signed PUT URL for direct client-to-S3 upload.

    Raises 422 for disallowed mime types or oversized files.
    """
    settings = get_settings()

    if file_type not in _ALLOWED_MIME:
        raise InvalidOperation("Invalid file_type")
    if mime_type not in _ALLOWED_MIME[file_type]:
        raise InvalidOperation(f"Disallowed mime type for {file_type}")
    if size_bytes > _MAX_SIZE[file_type]:
        raise PayloadTooLarge("File too large")

    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "bin"
    storage_key = f"submissions/{submission_id}/{file_type}/{uuid.uuid4()}.{ext}"

    s3 = _s3_client()
    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": storage_key, "ContentType": mime_type},
        ExpiresIn=settings.presigned_url_expiry_seconds,
    )
    return PresignedUploadResponse(
        upload_url=upload_url,
        storage_key=storage_key,
        expires_in=settings.presigned_url_expiry_seconds,
    )


async def confirm_upload(payload: ConfirmUploadRequest, actor: User, db: AsyncSession) -> Attachment:
    """Register an attachment after the client has completed the S3 PUT.

    Raises 403 if caller does not own the submission (unless admin).
    """
    result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")

    if actor.role != UserRole.ADMIN and sub.presenting_author_id != actor.id:
        raise PermissionDenied("Not the submission owner")

    if payload.file_type == FileType.ABSTRACT_DOCUMENT:
        if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.SUBMITTED):
            raise InvalidOperation("Cannot upload abstract document at this stage")
    else:
        if sub.status != SubmissionStatus.CONFIRMED:
            raise InvalidOperation("Final files can only be uploaded after confirmation")

    attachment = Attachment(
        submission_id=payload.submission_id,
        file_type=payload.file_type,
        storage_key=payload.storage_key,
        original_filename=payload.original_filename,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        uploaded_by_id=actor.id,
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return attachment


async def delete_attachment(attachment_id: uuid.UUID, actor: User, db: AsyncSession) -> None:
    """Delete an attachment from R2 and the database.

    Submitters can only delete attachments on their own submission while it is still editable.
    Admins can delete any attachment.
    """
    att_result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = att_result.scalar_one_or_none()
    if not attachment:
        raise NotFound("Attachment not found")

    if actor.role != UserRole.ADMIN:
        sub_result = await db.execute(select(Submission).where(Submission.id == attachment.submission_id))
        sub = sub_result.scalar_one_or_none()
        if not sub or sub.presenting_author_id != actor.id:
            raise PermissionDenied("Not the submission owner")
        if attachment.file_type == FileType.ABSTRACT_DOCUMENT:
            if sub.status not in (SubmissionStatus.DRAFT, SubmissionStatus.SUBMITTED):
                raise InvalidOperation("Cannot delete document at this stage")
        else:
            if sub.status != SubmissionStatus.CONFIRMED:
                raise InvalidOperation("Cannot delete final files at this stage")

    settings = get_settings()
    try:
        _s3_client().delete_object(Bucket=settings.s3_bucket_name, Key=attachment.storage_key)
    except ClientError:
        pass  # R2 object already gone or unreachable — still remove the DB row

    await db.delete(attachment)
    await db.commit()


def generate_presigned_get(storage_key: str, original_filename: str) -> str:
    """Return a 30-minute pre-signed download URL. Never expose the raw storage key."""
    settings = get_settings()
    s3 = _s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": storage_key},
        ExpiresIn=settings.presigned_url_expiry_seconds,
    )


# ─── Admin/chair file monitoring ────────────────────────────────────────────────

# Final presentation/poster file types a talk/poster slot is expected to receive.
_FINAL_FILE_TYPES = (FileType.FINAL_PRESENTATION, FileType.FINAL_POSTER)
# Which final file type each slot type is expected to produce.
_EXPECTED_BY_SLOT_TYPE = {
    "talk": FileType.FINAL_PRESENTATION,
    "poster": FileType.FINAL_POSTER,
}


async def list_all_files(db: AsyncSession) -> list[dict]:
    """Every uploaded attachment with submission/presenter/session context, newest first."""
    from sqlalchemy.orm import selectinload
    from app.models.session_slot import SessionSlot

    result = await db.execute(
        select(Attachment)
        .options(
            selectinload(Attachment.submission).selectinload(Submission.presenting_author),
            selectinload(Attachment.submission)
            .selectinload(Submission.session_slot)
            .selectinload(SessionSlot.session),
        )
        .order_by(Attachment.uploaded_at.desc())
    )
    items: list[dict] = []
    for att in result.scalars().all():
        sub = att.submission
        slot = sub.session_slot if sub else None
        session = slot.session if slot else None
        items.append({
            "attachment_id": att.id,
            "file_type": att.file_type,
            "original_filename": att.original_filename,
            "mime_type": att.mime_type,
            "size_bytes": att.size_bytes,
            "uploaded_at": att.uploaded_at,
            "submission_id": sub.id if sub else None,
            "submission_title": sub.title if sub else "",
            "presenter_name": sub.presenting_author.full_name if sub and sub.presenting_author else "",
            "submission_status": sub.status if sub else "",
            "session_title": session.title if session else None,
            "slot_order": slot.slot_order if slot else None,
        })
    return items


async def list_session_files(db: AsyncSession) -> list[dict]:
    """Per-session slot upload status, so chairs can see which presentations are missing.

    Only sessions that have at least one slot are returned. For each talk/poster slot
    (which has an assigned submission), ``uploaded`` reflects whether the presenter has
    uploaded the expected final file; qa/discussion slots are never "expected".
    """
    from sqlalchemy.orm import selectinload
    from app.models.session import Session
    from app.models.session_slot import SessionSlot

    result = await db.execute(
        select(Session)
        .options(
            selectinload(Session.slots)
            .selectinload(SessionSlot.submission)
            .selectinload(Submission.presenting_author),
            selectinload(Session.slots)
            .selectinload(SessionSlot.submission)
            .selectinload(Submission.attachments),
        )
        .order_by(Session.session_date, Session.start_time)
    )

    sessions_out: list[dict] = []
    for session in result.scalars().all():
        slots = sorted(session.slots, key=lambda s: s.slot_order)
        if not slots:
            continue

        slot_rows: list[dict] = []
        expected_count = uploaded_count = 0
        for slot in slots:
            sub = slot.submission
            expected_type = _EXPECTED_BY_SLOT_TYPE.get(slot.slot_type)
            is_expected = bool(expected_type and sub is not None)

            final_atts = (
                [a for a in sub.attachments if a.file_type in _FINAL_FILE_TYPES] if sub else []
            )
            # Uploaded when the specifically expected final file exists for this slot type.
            uploaded = is_expected and any(a.file_type == expected_type for a in final_atts)

            if is_expected:
                expected_count += 1
                if uploaded:
                    uploaded_count += 1

            slot_rows.append({
                "slot_id": slot.id,
                "slot_order": slot.slot_order,
                "slot_type": slot.slot_type,
                "submission_id": sub.id if sub else None,
                "submission_title": sub.title if sub else None,
                "presenter_name": sub.presenting_author.full_name if sub and sub.presenting_author else None,
                "expected": is_expected,
                "uploaded": uploaded,
                "attachments": [
                    {
                        "attachment_id": a.id,
                        "file_type": a.file_type,
                        "original_filename": a.original_filename,
                        "size_bytes": a.size_bytes,
                        "uploaded_at": a.uploaded_at,
                    }
                    for a in final_atts
                ],
            })

        sessions_out.append({
            "session_id": session.id,
            "title": session.title,
            "session_type": session.session_type,
            "session_date": session.session_date,
            "start_time": session.start_time,
            "room": session.room,
            "chair_name": session.chair_name,
            "total_expected": expected_count,
            "total_uploaded": uploaded_count,
            "total_missing": expected_count - uploaded_count,
            "slots": slot_rows,
        })
    return sessions_out
