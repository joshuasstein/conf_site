import uuid

from pydantic import BaseModel, field_validator

from app.models.submission import SubmissionStatus
from app.models.user import UserRole

_VALID_ROLES = {UserRole.SUBMITTER, UserRole.REVIEWER, UserRole.PROGRAM_CHAIR, UserRole.ADMIN}
_VALID_STATUSES = {
    SubmissionStatus.DRAFT,
    SubmissionStatus.SUBMITTED,
    SubmissionStatus.UNDER_REVIEW,
    SubmissionStatus.DECIDED,
    SubmissionStatus.ASSIGNED_TO_SESSION,
    SubmissionStatus.NOTIFIED,
    SubmissionStatus.CONFIRMED,
    SubmissionStatus.FILES_SUBMITTED,
    SubmissionStatus.WITHDRAWN,
}


class AudienceFilter(BaseModel):
    """Selects a subset of users. Filters combine with AND; a list matches ANY.

    - roles: users whose role is one of these
    - submission_statuses: users who have >= 1 submission in one of these statuses
    - email_verified: restrict by verification state
    An empty filter matches all users.
    """

    roles: list[str] = []
    submission_statuses: list[str] = []
    email_verified: bool | None = None

    @field_validator("roles")
    @classmethod
    def valid_roles(cls, v: list[str]) -> list[str]:
        bad = set(v) - _VALID_ROLES
        if bad:
            raise ValueError(f"Invalid role(s): {', '.join(sorted(bad))}")
        return v

    @field_validator("submission_statuses")
    @classmethod
    def valid_statuses(cls, v: list[str]) -> list[str]:
        bad = set(v) - _VALID_STATUSES
        if bad:
            raise ValueError(f"Invalid status(es): {', '.join(sorted(bad))}")
        return v


class RecipientRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    full_name: str
    email: str
    role: str


class BroadcastPreviewResponse(BaseModel):
    count: int
    # A sample of the matching recipients for the UI to display (capped).
    sample: list[RecipientRead]


class BroadcastRequest(BaseModel):
    filters: AudienceFilter
    subject: str
    body: str  # plain text; {full_name} is substituted per recipient

    @field_validator("subject", "body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v


class BroadcastResponse(BaseModel):
    queued: int
