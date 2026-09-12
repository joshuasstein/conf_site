import re
import uuid
from datetime import datetime

from pydantic import BaseModel, field_validator

from app.services.type_config import EXPECTS_FILE_OPTIONS, SESSION_COLORS

_KEY_RE = re.compile(r"^[a-z0-9_]+$")


class SessionTypeDef(BaseModel):
    key: str
    label: str
    color: str = "indigo"
    has_slots: bool = True

    @field_validator("key")
    @classmethod
    def valid_key(cls, v: str) -> str:
        if not _KEY_RE.match(v):
            raise ValueError("key must be lowercase letters, digits, or underscores")
        return v

    @field_validator("color")
    @classmethod
    def valid_color(cls, v: str) -> str:
        if v not in SESSION_COLORS:
            raise ValueError(f"color must be one of: {', '.join(SESSION_COLORS)}")
        return v


class SlotTypeDef(BaseModel):
    key: str
    label: str
    requires_submission: bool = False
    expects_file: str = "none"

    @field_validator("key")
    @classmethod
    def valid_key(cls, v: str) -> str:
        if not _KEY_RE.match(v):
            raise ValueError("key must be lowercase letters, digits, or underscores")
        return v

    @field_validator("expects_file")
    @classmethod
    def valid_expects_file(cls, v: str) -> str:
        if v not in EXPECTS_FILE_OPTIONS:
            raise ValueError(f"expects_file must be one of: {', '.join(EXPECTS_FILE_OPTIONS)}")
        return v


class DecisionOutcomeDef(BaseModel):
    key: str
    label: str
    is_acceptance: bool = True

    @field_validator("key")
    @classmethod
    def valid_key(cls, v: str) -> str:
        if not _KEY_RE.match(v):
            raise ValueError("key must be lowercase letters, digits, or underscores")
        return v


class AuditLogRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    # Nullable: set to NULL when the acting user is later deleted (ondelete=SET NULL).
    actor_id: uuid.UUID | None
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
    session_types: list[SessionTypeDef] = []
    slot_types: list[SlotTypeDef] = []
    decision_outcomes: list[DecisionOutcomeDef] = []
    email_from_address: str | None = None
    email_from_name: str | None = None
    preview_variables: dict = {}


def _require_unique_keys(items: list) -> list:
    keys = [i.key for i in items]
    if len(keys) != len(set(keys)):
        raise ValueError("type keys must be unique")
    return items


class ConferenceSettingsUpdate(BaseModel):
    conference_name: str | None = None
    location: str | None = None
    conference_start_date: datetime | None = None
    conference_end_date: datetime | None = None
    submission_deadline: datetime | None = None
    confirmation_deadline: datetime | None = None
    file_submission_deadline: datetime | None = None
    tracks: list[str] | None = None
    session_types: list[SessionTypeDef] | None = None
    slot_types: list[SlotTypeDef] | None = None
    decision_outcomes: list[DecisionOutcomeDef] | None = None
    email_from_address: str | None = None
    email_from_name: str | None = None
    preview_variables: dict | None = None

    @field_validator("session_types", "slot_types", "decision_outcomes")
    @classmethod
    def unique_keys(cls, v):
        if v is not None:
            _require_unique_keys(v)
        return v


class BulkNotifyRequest(BaseModel):
    """Trigger decision notification emails for all assigned_to_session submissions."""
    dry_run: bool = False


class BulkNotifyResponse(BaseModel):
    queued: int
    dry_run: bool


class ResetOTPResponse(BaseModel):
    otp_token: str


class ResetRequest(BaseModel):
    otp_token: str
    otp_code: str


class EmailTemplateRead(BaseModel):
    model_config = {"from_attributes": True}

    alias: str
    subject: str
    html: str
    text: str
    updated_at: datetime


class EmailTemplateUpdate(BaseModel):
    subject: str
    html: str
    text: str
