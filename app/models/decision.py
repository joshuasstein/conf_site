import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class DecisionOutcome:
    ORAL = "oral"
    POSTER = "poster"
    REJECTED = "rejected"


class Decision(Base):
    __tablename__ = "decisions"
    __table_args__ = (UniqueConstraint("submission_id", name="uq_decision_submission"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Outcome key is validated in the service against the configurable definitions
    # in conference_settings (see app/services/type_config.py), not by a DB enum.
    outcome: Mapped[str] = mapped_column(String(50), nullable=False)
    decided_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    submission: Mapped["Submission"] = relationship("Submission", back_populates="decision")  # noqa: F821
    decided_by: Mapped["User | None"] = relationship("User", foreign_keys=[decided_by_id])  # noqa: F821
