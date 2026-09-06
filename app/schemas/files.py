import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, field_validator


class PresignedUploadRequest(BaseModel):
    submission_id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int

    @field_validator("file_type")
    @classmethod
    def valid_file_type(cls, v: str) -> str:
        if v not in ("abstract_document", "final_presentation", "final_poster"):
            raise ValueError("Invalid file_type")
        return v

    @field_validator("size_bytes")
    @classmethod
    def reasonable_size(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("size_bytes must be positive")
        return v


class PresignedUploadResponse(BaseModel):
    upload_url: str
    storage_key: str
    expires_in: int


class ConfirmUploadRequest(BaseModel):
    storage_key: str
    submission_id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int


class AttachmentRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime


class PresignedDownloadResponse(BaseModel):
    download_url: str
    expires_in: int


# ─── Admin/chair file monitoring ────────────────────────────────────────────────


class AdminFileRead(BaseModel):
    """One uploaded file with its submission/presenter/session context."""

    attachment_id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime
    submission_id: uuid.UUID
    submission_title: str
    presenter_name: str
    submission_status: str
    session_title: str | None = None
    slot_order: int | None = None


class SlotAttachment(BaseModel):
    attachment_id: uuid.UUID
    file_type: str
    original_filename: str
    size_bytes: int
    uploaded_at: datetime


class SlotFileStatus(BaseModel):
    slot_id: uuid.UUID
    slot_order: int
    slot_type: str
    submission_id: uuid.UUID | None = None
    submission_title: str | None = None
    presenter_name: str | None = None
    # A talk/poster slot is expected to have a final file; qa/discussion are not.
    expected: bool
    uploaded: bool
    attachments: list[SlotAttachment] = []


class SessionFilesRead(BaseModel):
    session_id: uuid.UUID
    title: str
    session_type: str
    session_date: date
    start_time: time
    room: str | None = None
    chair_name: str | None = None
    total_expected: int
    total_uploaded: int
    total_missing: int
    slots: list[SlotFileStatus] = []
