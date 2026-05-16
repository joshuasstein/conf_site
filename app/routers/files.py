import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.attachment import Attachment
from app.models.user import User, UserRole
from app.schemas.files import (
    AttachmentRead,
    ConfirmUploadRequest,
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
)
from app.services.files import confirm_upload, generate_presigned_get, generate_presigned_put

router = APIRouter(prefix="/files", tags=["files"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/upload-url", response_model=PresignedUploadResponse)
async def request_upload_url(payload: PresignedUploadRequest, current_user: CurrentUser) -> PresignedUploadResponse:
    return generate_presigned_put(
        payload.submission_id,
        payload.file_type,
        payload.original_filename,
        payload.mime_type,
        payload.size_bytes,
    )


@router.post("/confirm-upload", response_model=AttachmentRead, status_code=201)
async def confirm(payload: ConfirmUploadRequest, current_user: CurrentUser, db: DB):
    return await confirm_upload(payload, current_user, db)


@router.get("/{attachment_id}/download-url", response_model=PresignedDownloadResponse)
async def download_url(attachment_id: uuid.UUID, current_user: CurrentUser, db: DB) -> PresignedDownloadResponse:
    from fastapi import HTTPException, status as http_status
    from app.config import get_settings

    result = await db.execute(
        select(Attachment)
        .where(Attachment.id == attachment_id)
        .options(selectinload(Attachment.submission))
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if current_user.role == UserRole.SUBMITTER and attachment.submission.presenting_author_id != current_user.id:
        raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your submission")

    settings = get_settings()
    url = generate_presigned_get(attachment.storage_key)
    return PresignedDownloadResponse(download_url=url, expires_in=settings.presigned_url_expiry_seconds)
