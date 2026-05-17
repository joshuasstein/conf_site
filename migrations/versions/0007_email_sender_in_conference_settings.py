"""Add email_from_address and email_from_name to conference_settings.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conference_settings", sa.Column("email_from_address", sa.String(320), nullable=True))
    op.add_column("conference_settings", sa.Column("email_from_name", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("conference_settings", "email_from_name")
    op.drop_column("conference_settings", "email_from_address")
