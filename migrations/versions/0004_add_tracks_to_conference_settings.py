"""add tracks to conference_settings

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conference_settings",
        sa.Column("tracks", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("conference_settings", "tracks")
