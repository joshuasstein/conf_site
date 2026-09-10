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
    # Score range 1-5 -> 1-10.
    op.drop_constraint("ck_review_score_range", "reviews", type_="check")
    op.create_check_constraint(
        "ck_review_score_range", "reviews", "score >= 1 AND score <= 10"
    )

    # Add 'na' to the recommendation enum. ADD VALUE cannot run inside a
    # transaction block, so use an autocommit block. IF NOT EXISTS makes it idempotent.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE review_recommendation ADD VALUE IF NOT EXISTS 'na'")


def downgrade() -> None:
    # Restore the 1-5 range (will fail if any row now has a score 6-10).
    op.drop_constraint("ck_review_score_range", "reviews", type_="check")
    op.create_check_constraint(
        "ck_review_score_range", "reviews", "score >= 1 AND score <= 5"
    )
    # Postgres cannot drop an enum value, so 'na' remains in the type. Harmless.
