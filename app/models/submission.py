import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SubmissionStatus:
    DRAFT = "draft"
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    DECIDED = "decided"
    ASSIGNED_TO_SESSION = "assigned_to_session"
    NOTIFIED = "notified"
    CONFIRMED = "confirmed"
    FILES_SUBMITTED = "files_submitted"
    WITHDRAWN = "withdrawn"

    # Valid forward transitions (non-admin)
    TRANSITIONS: dict[str, list[str]] = {
        DRAFT: [SUBMITTED],
        SUBMITTED: [UNDER_REVIEW],
        UNDER_REVIEW: [DECIDED],
        DECIDED: [ASSIGNED_TO_SESSION],
        ASSIGNED_TO_SESSION: [NOTIFIED],
        NOTIFIED: [CONFIRMED, WITHDRAWN],
        CONFIRMED: [FILES_SUBMITTED],
        FILES_SUBMITTED: [],
        WITHDRAWN: [],
    }


class SubmissionTypePreference:
    ORAL = "oral"
    POSTER = "poster"
    EITHER = "either"


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    abstract_text: Mapped[str] = mapped_column(Text, nullable=False)
    presenting_author_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    co_authors: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    keywords: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    track: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(
        Enum(
            "draft",
            "submitted",
            "under_review",
            "decided",
            "assigned_to_session",
            "notified",
            "confirmed",
            "files_submitted",
            "withdrawn",
            name="submission_status",
        ),
        nullable=False,
        default="draft",
    )
    submission_type_preference: Mapped[str] = mapped_column(
        Enum("oral", "poster", "either", name="submission_type_preference"),
        nullable=False,
        default="either",
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    presenting_author: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="submissions", foreign_keys=[presenting_author_id]
    )
    attachments: Mapped[list["Attachment"]] = relationship(  # noqa: F821
        "Attachment", back_populates="submission", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(  # noqa: F821
        "Review", back_populates="submission", cascade="all, delete-orphan"
    )
    decision: Mapped["Decision | None"] = relationship(  # noqa: F821
        "Decision", back_populates="submission", uselist=False
    )
    session_slot: Mapped["SessionSlot | None"] = relationship(  # noqa: F821
        "SessionSlot", back_populates="submission", uselist=False
    )
