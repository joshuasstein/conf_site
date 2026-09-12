import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, model_validator

# Session/slot type keys are validated against the configurable definitions in
# app.services.type_config (which reads them from conference_settings), so there
# are no hardcoded type tuples here.


class SessionCreate(BaseModel):
    title: str
    description: str | None = None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None = None
    chair_name: str | None = None
    # Not required for no-slot (time-block) session types; forced to 0 in the service.
    max_slots: int | None = None

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
    slot_type_label: str | None = None
    duration_minutes: int
    # Populated for talk/poster slots
    abstract_title: str | None = None
    abstract_text: str | None = None
    presenter_name: str | None = None
    presenter_institution: str | None = None
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
    session_type_label: str | None = None
    session_type_color: str | None = None
    session_type_has_slots: bool = True
    session_date: date
    start_time: time
    end_time: time
    room: str | None
    chair_name: str | None
    slots: list[ProgramSlotRead]


class SlotAssign(BaseModel):
    """Add any slot to a session. The slot type and whether a submission is required
    are validated in the service against the configurable slot-type definitions."""
    submission_id: uuid.UUID | None = None
    slot_type: str = "talk"
    slot_order: int
    duration_minutes: int = 15
    board_number: str | None = None
    poster_number: int | None = None


class SlotUpdate(BaseModel):
    slot_order: int | None = None
    duration_minutes: int | None = None
    board_number: str | None = None
    poster_number: int | None = None
