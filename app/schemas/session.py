import uuid
from datetime import date, datetime, time
from typing import Literal

from pydantic import BaseModel, field_validator, model_validator

VALID_SESSION_TYPES = ("oral", "poster", "networking_break", "lunch", "happy_hour")
# Session types that have no slots (pure time blocks)
NO_SLOT_SESSION_TYPES = ("networking_break", "lunch", "happy_hour")
VALID_SLOT_TYPES = ("talk", "qa", "discussion", "poster")


class SessionCreate(BaseModel):
    title: str
    description: str | None = None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None = None
    chair_name: str | None = None
    # Not required for networking_break (will be set to 0 automatically)
    max_slots: int | None = None

    @field_validator("session_type")
    @classmethod
    def valid_session_type(cls, v: str) -> str:
        if v not in VALID_SESSION_TYPES:
            raise ValueError(f"session_type must be one of: {', '.join(VALID_SESSION_TYPES)}")
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


class SessionSlotRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    session_id: uuid.UUID
    submission_id: uuid.UUID | None
    slot_type: str
    slot_order: int
    duration_minutes: int
    board_number: str | None
    poster_number: int | None
    created_at: datetime


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
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    slots: list[SessionSlotRead] = []


class ProgramSlotRead(BaseModel):
    """Public-facing slot for the program page."""
    model_config = {"from_attributes": True}

    slot_order: int
    slot_type: str
    duration_minutes: int
    # Populated for talk/poster slots
    abstract_title: str | None = None
    presenter_name: str | None = None
    # Populated for poster slots
    board_number: str | None = None
    poster_number: int | None = None


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
    """Add any slot to a session. submission_id is optional for Q&A/Discussion."""
    submission_id: uuid.UUID | None = None
    slot_type: str = "talk"
    slot_order: int
    duration_minutes: int = 15
    board_number: str | None = None
    poster_number: int | None = None

    @field_validator("slot_type")
    @classmethod
    def valid_slot_type(cls, v: str) -> str:
        if v not in VALID_SLOT_TYPES:
            raise ValueError(f"slot_type must be one of: {', '.join(VALID_SLOT_TYPES)}")
        return v

    @model_validator(mode="after")
    def submission_required_for_talk_and_poster(self) -> "SlotAssign":
        if self.slot_type in ("talk", "poster") and self.submission_id is None:
            raise ValueError(f"submission_id is required for slot_type '{self.slot_type}'")
        if self.slot_type in ("qa", "discussion") and self.submission_id is not None:
            raise ValueError(f"submission_id must be omitted for slot_type '{self.slot_type}'")
        return self


class SlotUpdate(BaseModel):
    slot_order: int | None = None
    duration_minutes: int | None = None
    board_number: str | None = None
    poster_number: int | None = None
