import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    actor_id: uuid.UUID
    action: str
    target_type: str
    target_id: uuid.UUID
    detail: dict
    created_at: datetime


class ConferenceSettingsRead(BaseModel):
    model_config = {"from_attributes": True}

    conference_name: str
    location: str | None
    conference_start_date: datetime | None
    conference_end_date: datetime | None
    submission_deadline: datetime | None
    confirmation_deadline: datetime | None
    file_submission_deadline: datetime | None
    tracks: list[str] = []


class ConferenceSettingsUpdate(BaseModel):
    conference_name: str | None = None
    location: str | None = None
    conference_start_date: datetime | None = None
    conference_end_date: datetime | None = None
    submission_deadline: datetime | None = None
    confirmation_deadline: datetime | None = None
    file_submission_deadline: datetime | None = None
    tracks: list[str] | None = None


class BulkNotifyRequest(BaseModel):
    """Trigger decision notification emails for all assigned_to_session submissions."""
    dry_run: bool = False


class BulkNotifyResponse(BaseModel):
    queued: int
    dry_run: bool
