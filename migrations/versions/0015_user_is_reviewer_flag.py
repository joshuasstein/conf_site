"""Add is_reviewer flag so any user can be granted reviewer privileges.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-10
"""
import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_reviewer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Existing dedicated reviewer-role accounts also get the flag, so the
    # capability is consistent regardless of which mechanism granted it.
    op.execute("UPDATE users SET is_reviewer = true WHERE role = 'reviewer'")


def downgrade() -> None:
    op.drop_column("users", "is_reviewer")
