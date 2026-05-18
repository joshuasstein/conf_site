"""Make ix_users_email non-unique to allow multiple accounts per email.

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-17
"""
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the unique index on email (migration 0011 only dropped the constraint).
    op.drop_index("ix_users_email", table_name="users")
    # Recreate as non-unique so the column stays indexed for lookup speed.
    op.create_index("ix_users_email", "users", ["email"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_email", table_name="users")
    op.create_index("ix_users_email", "users", ["email"], unique=True)
