"""Add username column; make email non-unique.

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add username, temporarily nullable so we can backfill.
    op.add_column("users", sa.Column("username", sa.String(50), nullable=True))

    # Backfill: use email as username for existing rows.
    op.execute("UPDATE users SET username = email")

    # Now enforce not-null and unique.
    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("uq_users_username", "users", ["username"])
    op.create_index("ix_users_username", "users", ["username"])

    # Drop the unique constraint on email (index stays for lookup speed).
    op.drop_constraint("users_email_key", "users", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("users_email_key", "users", ["email"])
    op.drop_index("ix_users_username", table_name="users")
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "username")
