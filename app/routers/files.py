import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user, require_program_chair
from app.models.attachment import Attachment
from app.models.user import User, UserRole
from app.schemas.files import (
    AdminFileRead,
    AttachmentRead,
    ConfirmUploadRequest,
    PresignedDownloadResponse,
    PresignedUploadRequest,
    PresignedUploadResponse,
    SessionFilesRead,
)
from app.services.files import (
    confirm_upload,
    delete_attachment,
    generate_presigned_get,
    generate_presigned_put,
    list_all_files,
    list_session_files,
)

router = APIRouter(prefix="/files", tags=["files"])

CurrentUser = Annotated[User, Depends(get_current_user)]
# Admins and program chairs (session chairs) may monitor all uploaded files.
ChairUser = Annotated[User, Depends(require_program_chair)]
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


@router.get("/all", response_model=list[AdminFileRead])
async def all_files(current_user: ChairUser, db: DB):
    """Every uploaded file across all submissions (admins & program chairs)."""
    return await list_all_files(db)


@router.get("/by-session", response_model=list[SessionFilesRead])
async def files_by_session(current_user: ChairUser, db: DB):
    """Per-session slot upload status, to track missing presentations."""
    return await list_session_files(db)


@router.delete("/{attachment_id}", status_code=204)
async def remove_attachment(attachment_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    await delete_attachment(attachment_id, current_user, db)


@router.get("/{attachment_id}/download-url", response_model=PresignedDownloadResponse)
async def download_url(attachment_id: uuid.UUID, current_user: CurrentUser, db: DB) -> PresignedDownloadResponse:
    from fastapi import HTTPException, status as http_status
    from app.config import get_settings
    from app.models.submission import Submission

    result = await db.execute(select(Attachment).where(Attachment.id == attachment_id))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Attachment not found")

    if current_user.role == UserRole.SUBMITTER:
        sub_result = await db.execute(select(Submission).where(Submission.id == attachment.submission_id))
        sub = sub_result.scalar_one_or_none()
        if not sub or sub.presenting_author_id != current_user.id:
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not your submission")
    elif current_user.role == UserRole.REVIEWER:
        from app.models.review import Review
        rev_result = await db.execute(
            select(Review).where(
                Review.submission_id == attachment.submission_id,
                Review.reviewer_id == current_user.id,
            )
        )
        if not rev_result.scalar_one_or_none():
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN, detail="Not assigned to this submission")

    settings = get_settings()
    url = generate_presigned_get(attachment.storage_key, attachment.original_filename)
    return PresignedDownloadResponse(download_url=url, expires_in=settings.presigned_url_expiry_seconds)
