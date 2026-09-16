"""Add is_admin_viewer flag granting admin-level read access to any user.

The flag lets a user see everything an admin sees while keeping write/action
permissions at their base role. It coexists with any role, mirroring is_reviewer.

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_admin_viewer", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("users", "is_admin_viewer", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_admin_viewer")
