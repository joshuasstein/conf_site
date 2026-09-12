import uuid
from datetime import datetime

from pydantic import BaseModel

# outcome keys are validated in the service against the configurable decision
# outcomes in conference_settings (see app/services/type_config.py).


class DecisionCreate(BaseModel):
    submission_id: uuid.UUID
    outcome: str


class DecisionOverride(BaseModel):
    outcome: str


class DecisionRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    submission_id: uuid.UUID
    outcome: str
    decided_by_id: uuid.UUID
    decided_at: datetime
    notification_sent_at: datetime | None


class DecisionListItem(BaseModel):
    """A submission that has reached 'decided' or beyond, for the Decisions page."""
    submission_id: uuid.UUID
    title: str
    presenter_name: str
    status: str
    outcome: str | None
    session_title: str | None
