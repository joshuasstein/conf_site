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


def generate_presigned_get(storage_key: str, original_filename: str) -> str:
    """Return a 30-minute pre-signed download URL. Never expose the raw storage key."""
    settings = get_settings()
    s3 = _s3_client()
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket_name, "Key": storage_key},
        ExpiresIn=settings.presigned_url_expiry_seconds,
    )
