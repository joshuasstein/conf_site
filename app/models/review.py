import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ReviewRecommendation:
    ORAL = "oral"
    POSTER = "poster"
    REJECT = "reject"


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (
        UniqueConstraint("submission_id", "reviewer_id", name="uq_review_submission_reviewer"),
        CheckConstraint("score >= 1 AND score <= 5", name="ck_review_score_range"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reviewer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    recommendation: Mapped[str | None] = mapped_column(
        Enum("oral", "poster", "reject", name="review_recommendation"),
        nullable=True,
    )
    comments: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_for_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    submission: Mapped["Submission"] = relationship("Submission", back_populates="reviews")  # noqa: F821
    reviewer: Mapped["User"] = relationship("User", back_populates="reviews")  # noqa: F821
