import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SessionSlot(Base):
    __tablename__ = "session_slots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Nullable: Q&A and Discussion slots have no associated submission
    submission_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # talk | qa | discussion | poster
    slot_type: Mapped[str] = mapped_column(String(50), nullable=False, default="talk")
    slot_order: Mapped[int] = mapped_column(Integer, nullable=False)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    # Poster session fields
    board_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    poster_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    session: Mapped["Session"] = relationship("Session", back_populates="slots")  # noqa: F821
    submission: Mapped["Submission | None"] = relationship("Submission", back_populates="session_slot")  # noqa: F821
