"""Per-submission presenter name/affiliation overrides for the program.

Admins and program chairs can override how a submission's presenter is shown in
the program without editing the presenting author's user account. Null means fall
back to the account's full_name / institution.

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-17
"""
import sqlalchemy as sa
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("submissions", sa.Column("presenter_name_override", sa.String(length=255), nullable=True))
    op.add_column("submissions", sa.Column("presenter_institution_override", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("submissions", "presenter_institution_override")
    op.drop_column("submissions", "presenter_name_override")
