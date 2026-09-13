"""Parallel session blocks.

Adds ``session_groups`` (a block of parallel sessions sharing a date/start time)
and links sessions to it via ``sessions.group_id`` + ``sessions.column_order``.

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-13
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "session_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("is_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.add_column(
        "sessions",
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("column_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.alter_column("sessions", "column_order", server_default=None)
    op.create_index("ix_sessions_group_id", "sessions", ["group_id"])
    op.create_foreign_key(
        "fk_sessions_group_id",
        "sessions",
        "session_groups",
        ["group_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sessions_group_id", "sessions", type_="foreignkey")
    op.drop_index("ix_sessions_group_id", table_name="sessions")
    op.drop_column("sessions", "column_order")
    op.drop_column("sessions", "group_id")
    op.drop_table("session_groups")
