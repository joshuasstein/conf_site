import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator


class DecisionCreate(BaseModel):
    submission_id: uuid.UUID
    outcome: str

    @field_validator("outcome")
    @classmethod
    def valid_outcome(cls, v: str) -> str:
        if v not in ("oral", "poster", "rejected"):
            raise ValueError("outcome must be oral, poster, or rejected")
        return v


class DecisionOverride(BaseModel):
    outcome: str

    @field_validator("outcome")
    @classmethod
    def valid_outcome(cls, v: str) -> str:
        if v not in ("oral", "poster", "rejected"):
            raise ValueError("outcome must be oral, poster, or rejected")
        return v


class DecisionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    outcome: str
    decided_by_id: uuid.UUID
    decided_at: datetime
    notification_sent_at: datetime | None
