"""add conference_settings table

Revision ID: 0002
Revises: 0001
Create Date: 2025-01-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS conference_settings (
            id                      INTEGER PRIMARY KEY DEFAULT 1,
            conference_name         VARCHAR(255) NOT NULL DEFAULT '',
            location                VARCHAR(255),
            conference_start_date   TIMESTAMPTZ,
            conference_end_date     TIMESTAMPTZ,
            submission_deadline     TIMESTAMPTZ,
            confirmation_deadline   TIMESTAMPTZ,
            file_submission_deadline TIMESTAMPTZ,
            double_blind_review     BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT ck_single_row CHECK (id = 1)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS conference_settings")
