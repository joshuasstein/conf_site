"""Configurable session & slot types.

Adds ``session_types`` and ``slot_types`` JSON config to conference_settings
(seeded with the previous built-ins) and converts ``sessions.session_type`` from a
native Postgres enum to a plain varchar so custom type keys are allowed.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-12
"""
import json

import sqlalchemy as sa
from alembic import op

from app.services.type_config import DEFAULT_SESSION_TYPES, DEFAULT_SLOT_TYPES

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

_SESSION_TYPES_JSON = json.dumps(DEFAULT_SESSION_TYPES)
_SLOT_TYPES_JSON = json.dumps(DEFAULT_SLOT_TYPES)

# Original native enum values, for downgrade.
_SESSION_TYPE_ENUM = sa.Enum(
    "oral", "poster", "keynote", "workshop", "networking_break", "lunch", "happy_hour",
    name="session_type",
)


def upgrade() -> None:
    # 1. New JSON config columns, seeded with the built-in defaults.
    op.add_column(
        "conference_settings",
        sa.Column("session_types", sa.JSON(), nullable=False, server_default=sa.text(f"'{_SESSION_TYPES_JSON}'")),
    )
    op.add_column(
        "conference_settings",
        sa.Column("slot_types", sa.JSON(), nullable=False, server_default=sa.text(f"'{_SLOT_TYPES_JSON}'")),
    )
    # Drop the server_default; the app supplies these going forward.
    op.alter_column("conference_settings", "session_types", server_default=None)
    op.alter_column("conference_settings", "slot_types", server_default=None)

    # 2. sessions.session_type: native enum -> varchar (allows custom keys).
    op.alter_column(
        "sessions",
        "session_type",
        existing_type=_SESSION_TYPE_ENUM,
        type_=sa.String(length=50),
        existing_nullable=False,
        postgresql_using="session_type::text",
    )
    op.execute("DROP TYPE IF EXISTS session_type")


def downgrade() -> None:
    bind = op.get_bind()
    _SESSION_TYPE_ENUM.create(bind, checkfirst=True)
    op.alter_column(
        "sessions",
        "session_type",
        existing_type=sa.String(length=50),
        type_=_SESSION_TYPE_ENUM,
        existing_nullable=False,
        postgresql_using="session_type::session_type",
    )
    op.drop_column("conference_settings", "slot_types")
    op.drop_column("conference_settings", "session_types")
