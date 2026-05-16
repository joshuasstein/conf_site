import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, field_validator, model_validator


class SessionCreate(BaseModel):
    title: str
    description: str | None = None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None = None
    chair_name: str | None = None
    max_slots: int

    @field_validator("session_type")
    @classmethod
    def valid_session_type(cls, v: str) -> str:
        if v not in ("oral", "poster", "keynote", "workshop"):
            raise ValueError("session_type must be oral, poster, keynote, or workshop")
        return v

    @model_validator(mode="after")
    def end_after_start(self) -> "SessionCreate":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class SessionUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    session_type: str | None = None
    session_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    room: str | None = None
    chair_name: str | None = None
    max_slots: int | None = None
    is_published: bool | None = None


class SessionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    description: str | None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None
    chair_name: str | None
    max_slots: int
    is_published: bool
    created_by_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ProgramSlotRead(BaseModel):
    """Public-facing slot: abstract title and presenter name, no IDs."""
    model_config = {"from_attributes": True}

    slot_order: int
    duration_minutes: int
    abstract_title: str
    presenter_name: str


class ProgramSessionRead(BaseModel):
    """Public-facing session for the conference program."""
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    description: str | None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None
    chair_name: str | None
    slots: list[ProgramSlotRead]


class SlotAssign(BaseModel):
    submission_id: uuid.UUID
    slot_order: int
    duration_minutes: int


class SessionSlotRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    session_id: uuid.UUID
    submission_id: uuid.UUID
    slot_order: int
    duration_minutes: int
    created_at: datetime
