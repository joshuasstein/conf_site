import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class ReviewCreate(BaseModel):
    submission_id: uuid.UUID
    reviewer_id: uuid.UUID


class ReviewSubmit(BaseModel):
    score: int
    recommendation: str
    comments: str | None = None

    @field_validator("score")
    @classmethod
    def score_range(cls, v: int) -> int:
        if not 1 <= v <= 10:
            raise ValueError("Score must be between 1 and 10")
        return v

    @field_validator("recommendation")
    @classmethod
    def valid_recommendation(cls, v: str) -> str:
        if v not in ("oral", "poster", "na"):
            raise ValueError("recommendation must be oral, poster, or na")
        return v


class ReviewRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    reviewer_id: uuid.UUID
    score: int | None
    recommendation: str | None
    comments: str | None
    submitted_at: datetime | None
    created_at: datetime


class AttachmentInfo(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    file_type: str
    original_filename: str
    mime_type: str
    size_bytes: int
    uploaded_at: datetime


class SubmissionSummary(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    abstract_text: str
    keywords: list[str]
    track: str | None
    submission_type_preference: str | None
    attachments: list[AttachmentInfo] = []


class ReviewWithSubmission(ReviewRead):
    submission: SubmissionSummary
