import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EmailJobStatus:
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"


class TemplateAlias:
    SUBMISSION_CONFIRMATION = "submission-confirmation"
    REVIEW_ASSIGNMENT = "review-assignment"
    DECISION_ACCEPTED = "decision-accepted"
    DECISION_REJECTED = "decision-rejected"
    CONFIRMATION_REMINDER = "confirmation-reminder"
    RESET_OTP = "admin-reset-otp"
    FILE_SUBMISSION_REMINDER = "file-submission-reminder"
    EMAIL_VERIFICATION = "email-verification"
    USERNAME_REMINDER = "username-reminder"
    PASSWORD_RESET = "password-reset"
    CUSTOM_BROADCAST = "custom-broadcast"


# Backwards-compat alias so existing imports keep working
EmailTemplate = TemplateAlias


class EmailJob(Base):
    __tablename__ = "email_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient_email: Mapped[str] = mapped_column(String(320), nullable=False)
    recipient_name: Mapped[str] = mapped_column(String(255), nullable=False)
    template_alias: Mapped[str] = mapped_column(String(100), nullable=False)
    template_model: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(
        Enum("pending", "sent", "failed", name="email_job_status"),
        nullable=False,
        default="pending",
        index=True,
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # nullable — system-generated jobs won't always have an actor
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
