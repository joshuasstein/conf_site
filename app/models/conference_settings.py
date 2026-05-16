from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ConferenceSettings(Base):
    __tablename__ = "conference_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_single_row"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    conference_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    conference_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    conference_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submission_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    confirmation_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    file_submission_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    tracks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
