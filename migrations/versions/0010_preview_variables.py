"""Add preview_variables to conference_settings.

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conference_settings",
        sa.Column("preview_variables", JSON, nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("conference_settings", "preview_variables")
