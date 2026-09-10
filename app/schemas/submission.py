import uuid
from datetime import datetime

from pydantic import BaseModel


class AttachmentInfo(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime


class CoAuthor(BaseModel):
    name: str
    email: str
    institution: str | None = None


class SubmissionCreate(BaseModel):
    title: str
    abstract_text: str
    co_authors: list[CoAuthor] = []
    keywords: list[str] = []
    track: str | None = None
    submission_type_preference: str = "either"


class SubmissionUpdate(BaseModel):
    title: str | None = None
    abstract_text: str | None = None
    co_authors: list[CoAuthor] | None = None
    keywords: list[str] | None = None
    track: str | None = None
    submission_type_preference: str | None = None


class PresenterInfo(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    full_name: str
    username: str
    email: str
    institution: str | None


class SubmissionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    abstract_text: str
    presenting_author_id: uuid.UUID
    presenting_author: PresenterInfo
    co_authors: list[dict]
    keywords: list[str]
    track: str | None
    status: str
    submission_type_preference: str
    submitted_at: datetime | None
    updated_at: datetime
    attachments: list[AttachmentInfo] = []


class SubmissionStatusOverride(BaseModel):
    status: str
    reason: str


class SubmissionReassign(BaseModel):
    new_author_id: uuid.UUID
