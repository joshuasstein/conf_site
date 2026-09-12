"""Configurable decision outcomes.

Adds ``decision_outcomes`` JSON config to conference_settings (seeded with the
built-in oral/poster/rejected) and converts ``decisions.outcome`` from a native
Postgres enum to a plain varchar so custom outcomes are allowed.

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-12
"""
import json

import sqlalchemy as sa
from alembic import op

from app.services.type_config import DEFAULT_DECISION_OUTCOMES

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

_OUTCOMES_JSON = json.dumps(DEFAULT_DECISION_OUTCOMES)
_DECISION_OUTCOME_ENUM = sa.Enum("oral", "poster", "rejected", name="decision_outcome")


def upgrade() -> None:
    op.add_column(
        "conference_settings",
        sa.Column("decision_outcomes", sa.JSON(), nullable=False, server_default=sa.text(f"'{_OUTCOMES_JSON}'")),
    )
    op.alter_column("conference_settings", "decision_outcomes", server_default=None)

    op.alter_column(
        "decisions",
        "outcome",
        existing_type=_DECISION_OUTCOME_ENUM,
        type_=sa.String(length=50),
        existing_nullable=False,
        postgresql_using="outcome::text",
    )
    op.execute("DROP TYPE IF EXISTS decision_outcome")


def downgrade() -> None:
    bind = op.get_bind()
    _DECISION_OUTCOME_ENUM.create(bind, checkfirst=True)
    op.alter_column(
        "decisions",
        "outcome",
        existing_type=sa.String(length=50),
        type_=_DECISION_OUTCOME_ENUM,
        existing_nullable=False,
        postgresql_using="outcome::decision_outcome",
    )
    op.drop_column("conference_settings", "decision_outcomes")
