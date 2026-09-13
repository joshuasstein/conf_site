import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ProgramTemplate(Base):
    """A saved snapshot of the program's *empty* session structure (dates, times,
    rooms, types — but no assigned submissions/slots).

    Lets organizers save the program skeleton, export it to a file, and recreate
    it the following year after the conference DB has been wiped. Stored in its
    own table so it survives the admin "reset all data" operation, which only
    clears the enumerated conference tables.

    ``sessions`` is a JSON list of entries, each a JSON-serialized
    ``TemplateSessionEntry`` (date/time as ISO strings).
    """

    __tablename__ = "program_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sessions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    created_by: Mapped["User"] = relationship("User", foreign_keys=[created_by_id])  # noqa: F821
