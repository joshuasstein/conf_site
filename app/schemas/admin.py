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


class DeadlinesUpdate(BaseModel):
    submission_deadline: datetime | None = None
    confirmation_deadline: datetime | None = None
    file_submission_deadline: datetime | None = None


class BulkNotifyRequest(BaseModel):
    """Trigger decision notification emails for all assigned_to_session submissions."""
    dry_run: bool = False


class BulkNotifyResponse(BaseModel):
    queued: int
    dry_run: bool
