"""Widen review score to 1-10 and add 'na' recommendation.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-10
"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Score range 1-5 -> 1-10. The initial schema created an inline, auto-named
    # check (e.g. "reviews_score_check"), so drop whatever score CHECK exists
    # rather than a specific name, then add the named 1-10 constraint.
    op.execute(
        """
        DO $$
        DECLARE c text;
        BEGIN
          FOR c IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'reviews'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%score%'
          LOOP
            EXECUTE 'ALTER TABLE reviews DROP CONSTRAINT ' || quote_ident(c);
          END LOOP;
        END $$;
        """
    )
    op.create_check_constraint(
        "ck_review_score_range", "reviews", "score >= 1 AND score <= 10"
    )

    # Add 'na' to the recommendation enum. ADD VALUE cannot run inside a
    # transaction block, so use an autocommit block. IF NOT EXISTS makes it idempotent.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE review_recommendation ADD VALUE IF NOT EXISTS 'na'")


def downgrade() -> None:
    # Restore the 1-5 range (will fail if any row now has a score 6-10).
    op.execute("ALTER TABLE reviews DROP CONSTRAINT IF EXISTS ck_review_score_range")
    op.create_check_constraint(
        "ck_review_score_range", "reviews", "score >= 1 AND score <= 5"
    )
    # Postgres cannot drop an enum value, so 'na' remains in the type. Harmless.
