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
    # Editable session/slot type definitions. See app/services/type_config.py.
    # session_types: [{key, label, color, has_slots}]
    # slot_types:    [{key, label, requires_submission, expects_file}]
    session_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    slot_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # decision_outcomes: [{key, label, is_acceptance}]
    decision_outcomes: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    email_from_address: Mapped[str | None] = mapped_column(String(320), nullable=True)
    email_from_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    preview_variables: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
