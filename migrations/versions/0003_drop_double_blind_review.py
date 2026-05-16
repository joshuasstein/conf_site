"""drop double_blind_review from conference_settings

Revision ID: 0003
Revises: 0002
Create Date: 2025-01-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE conference_settings DROP COLUMN IF EXISTS double_blind_review")


def downgrade() -> None:
    op.execute("ALTER TABLE conference_settings ADD COLUMN IF NOT EXISTS double_blind_review BOOLEAN NOT NULL DEFAULT TRUE")
