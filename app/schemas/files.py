import uuid
from datetime import datetime

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
