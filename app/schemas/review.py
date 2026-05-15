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
    comments_for_author: str | None = None

    @field_validator("score")
    @classmethod
    def score_range(cls, v: int) -> int:
        if not 1 <= v <= 5:
            raise ValueError("Score must be between 1 and 5")
        return v

    @field_validator("recommendation")
    @classmethod
    def valid_recommendation(cls, v: str) -> str:
        if v not in ("oral", "poster", "reject"):
            raise ValueError("recommendation must be oral, poster, or reject")
        return v


class ReviewRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    reviewer_id: uuid.UUID
    score: int | None
    recommendation: str | None
    comments: str | None
    comments_for_author: str | None
    submitted_at: datetime | None
    created_at: datetime
