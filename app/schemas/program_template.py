import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, Field, model_validator

# The portable export format version. Bumped if the on-disk shape changes so
# imports from older files can be handled/rejected explicitly.
EXPORT_FORMAT = "conf-site.program-template"
EXPORT_VERSION = 1


class TemplateSessionEntry(BaseModel):
    """One empty session in a template — everything needed to recreate a Session
    row except the assigned submissions/slots."""

    title: str
    description: str | None = None
    session_type: str
    session_date: date
    start_time: time
    end_time: time
    room: str | None = None
    chair_name: str | None = None
    max_slots: int = 0

    @model_validator(mode="after")
    def end_after_start(self) -> "TemplateSessionEntry":
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class SaveCurrentRequest(BaseModel):
    """Snapshot the live sessions (minus slots) into a new template."""

    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class ProgramTemplateImport(BaseModel):
    """Payload for importing a template — the shape produced by export.

    ``format``/``version`` are validated in the service so a clear error is
    returned for an unrecognized file rather than a generic 422.
    """

    format: str | None = None
    version: int | None = None
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    sessions: list[TemplateSessionEntry]


class ApplyTemplateRequest(BaseModel):
    """Recreate the template's sessions as live Session rows.

    If ``new_start_date`` is given, every session date is shifted by the offset
    between it and the template's earliest session date, preserving the gaps
    between days. Times of day are kept as-is. If omitted, the stored dates are
    used verbatim.
    """

    new_start_date: date | None = None
    publish: bool = False


class ProgramTemplateSummary(BaseModel):
    """List view — omits the (potentially large) sessions payload."""

    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str | None
    session_count: int
    created_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class ProgramTemplateRead(ProgramTemplateSummary):
    sessions: list[TemplateSessionEntry]


class ProgramTemplateExport(BaseModel):
    """The portable file format written by the export endpoint."""

    format: str = EXPORT_FORMAT
    version: int = EXPORT_VERSION
    name: str
    description: str | None = None
    sessions: list[TemplateSessionEntry]


class ApplyTemplateResponse(BaseModel):
    created: int
    new_start_date: date | None = None
