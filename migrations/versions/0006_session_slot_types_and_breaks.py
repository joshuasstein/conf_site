"""Add networking_break/lunch/happy_hour session types; add slot_type, board_number, poster_number to session_slots; make submission_id nullable."""

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Add new session type values to the Postgres enum
    op.execute("ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'networking_break'")
    op.execute("ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'lunch'")
    op.execute("ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'happy_hour'")

    # Make submission_id nullable (Q&A / Discussion slots have no submission)
    op.alter_column("session_slots", "submission_id", nullable=True)

    # Replace the table-level unique constraint with a partial index
    # (only enforce uniqueness when submission_id is not null)
    op.drop_constraint("uq_slot_submission", "session_slots", type_="unique")
    op.execute(
        """
        CREATE UNIQUE INDEX uq_slot_submission
        ON session_slots (submission_id)
        WHERE submission_id IS NOT NULL
        """
    )

    # Add slot_type (default 'talk' for existing rows)
    op.add_column(
        "session_slots",
        sa.Column("slot_type", sa.String(50), nullable=False, server_default="talk"),
    )

    # Add poster-specific columns
    op.add_column("session_slots", sa.Column("board_number", sa.String(50), nullable=True))
    op.add_column("session_slots", sa.Column("poster_number", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("session_slots", "poster_number")
    op.drop_column("session_slots", "board_number")
    op.drop_column("session_slots", "slot_type")
    op.execute("DROP INDEX IF EXISTS uq_slot_submission")
    # Restore rows that would violate NOT NULL before re-adding it
    op.execute("DELETE FROM session_slots WHERE submission_id IS NULL")
    op.alter_column("session_slots", "submission_id", nullable=False)
    op.create_unique_constraint("uq_slot_submission", "session_slots", ["submission_id"])
    # Cannot remove enum values in Postgres without recreating the type
