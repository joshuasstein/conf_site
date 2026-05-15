"""initial schema

Revision ID: 0001
Revises:
Create Date: 2025-01-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enums
    user_role = postgresql.ENUM("submitter", "reviewer", "program_chair", "admin", name="user_role")
    submission_status = postgresql.ENUM(
        "draft", "submitted", "under_review", "decided", "assigned_to_session",
        "notified", "confirmed", "files_submitted", "withdrawn",
        name="submission_status",
    )
    submission_type_preference = postgresql.ENUM("oral", "poster", "either", name="submission_type_preference")
    file_type = postgresql.ENUM("abstract_document", "final_presentation", "final_poster", name="file_type")
    review_recommendation = postgresql.ENUM("oral", "poster", "reject", name="review_recommendation")
    decision_outcome = postgresql.ENUM("oral", "poster", "rejected", name="decision_outcome")
    session_type = postgresql.ENUM("oral", "poster", "keynote", "workshop", name="session_type")
    email_job_status = postgresql.ENUM("pending", "sent", "failed", name="email_job_status")

    for enum in (user_role, submission_status, submission_type_preference, file_type,
                 review_recommendation, decision_outcome, session_type, email_job_status):
        enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("institution", sa.String(255), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.Enum("submitter", "reviewer", "program_chair", "admin", name="user_role"), nullable=False, server_default="submitter"),
        sa.Column("email_verified", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("abstract_text", sa.Text, nullable=False),
        sa.Column("presenting_author_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("co_authors", postgresql.JSON, nullable=False, server_default="[]"),
        sa.Column("keywords", postgresql.JSON, nullable=False, server_default="[]"),
        sa.Column("track", sa.String(100), nullable=True),
        sa.Column("status", sa.Enum("draft", "submitted", "under_review", "decided", "assigned_to_session", "notified", "confirmed", "files_submitted", "withdrawn", name="submission_status"), nullable=False, server_default="draft"),
        sa.Column("submission_type_preference", sa.Enum("oral", "poster", "either", name="submission_type_preference"), nullable=False, server_default="either"),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_submissions_presenting_author_id", "submissions", ["presenting_author_id"])

    op.create_table(
        "attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("file_type", sa.Enum("abstract_document", "final_presentation", "final_poster", name="file_type"), nullable=False),
        sa.Column("storage_key", sa.String(1024), nullable=False),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("uploaded_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
    )
    op.create_index("ix_attachments_submission_id", "attachments", ["submission_id"])

    op.create_table(
        "reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reviewer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("score", sa.Integer, nullable=True),
        sa.Column("recommendation", sa.Enum("oral", "poster", "reject", name="review_recommendation"), nullable=True),
        sa.Column("comments", sa.Text, nullable=True),
        sa.Column("comments_for_author", sa.Text, nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("submission_id", "reviewer_id", name="uq_review_submission_reviewer"),
        sa.CheckConstraint("score >= 1 AND score <= 5", name="ck_review_score_range"),
    )
    op.create_index("ix_reviews_submission_id", "reviews", ["submission_id"])
    op.create_index("ix_reviews_reviewer_id", "reviews", ["reviewer_id"])

    op.create_table(
        "decisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("outcome", sa.Enum("oral", "poster", "rejected", name="decision_outcome"), nullable=False),
        sa.Column("decided_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("notification_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("submission_id", name="uq_decision_submission"),
    )
    op.create_index("ix_decisions_submission_id", "decisions", ["submission_id"])

    op.create_table(
        "sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("session_type", sa.Enum("oral", "poster", "keynote", "workshop", name="session_type"), nullable=False),
        sa.Column("session_date", sa.Date, nullable=False),
        sa.Column("start_time", sa.Time, nullable=False),
        sa.Column("end_time", sa.Time, nullable=False),
        sa.Column("room", sa.String(100), nullable=True),
        sa.Column("chair_name", sa.String(255), nullable=True),
        sa.Column("max_slots", sa.Integer, nullable=False),
        sa.Column("is_published", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "session_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("submission_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("submissions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot_order", sa.Integer, nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("submission_id", name="uq_slot_submission"),
    )
    op.create_index("ix_session_slots_session_id", "session_slots", ["session_id"])
    op.create_index("ix_session_slots_submission_id", "session_slots", ["submission_id"])

    op.create_table(
        "audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("detail", postgresql.JSON, nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    op.create_table(
        "email_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("recipient_email", sa.String(320), nullable=False),
        sa.Column("recipient_name", sa.String(255), nullable=False),
        sa.Column("template_alias", sa.String(100), nullable=False),
        sa.Column("template_model", postgresql.JSON, nullable=False, server_default="{}"),
        sa.Column("status", sa.Enum("pending", "sent", "failed", name="email_job_status"), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_email_jobs_status", "email_jobs", ["status"])


def downgrade() -> None:
    op.drop_table("email_jobs")
    op.drop_table("audit_logs")
    op.drop_table("session_slots")
    op.drop_table("sessions")
    op.drop_table("decisions")
    op.drop_table("reviews")
    op.drop_table("attachments")
    op.drop_table("submissions")
    op.drop_table("users")

    for name in ("email_job_status", "session_type", "decision_outcome", "review_recommendation",
                 "file_type", "submission_type_preference", "submission_status", "user_role"):
        op.execute(f"DROP TYPE IF EXISTS {name}")
