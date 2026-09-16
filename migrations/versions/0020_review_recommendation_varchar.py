"""Reviewer recommendation tracks configurable session types.

Converts ``reviews.recommendation`` from a native Postgres enum
(oral/poster/reject/na) to a plain varchar, so a recommendation can be any
configured submission session type key plus the fixed "reject" option. Existing
values are preserved as text.

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-16
"""
import sqlalchemy as sa
from alembic import op

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None

_REVIEW_RECOMMENDATION_ENUM = sa.Enum(
    "oral", "poster", "reject", "na", name="review_recommendation"
)


def upgrade() -> None:
    op.alter_column(
        "reviews",
        "recommendation",
        existing_type=_REVIEW_RECOMMENDATION_ENUM,
        type_=sa.String(length=50),
        existing_nullable=True,
        postgresql_using="recommendation::text",
    )
    op.execute("DROP TYPE IF EXISTS review_recommendation")


def downgrade() -> None:
    bind = op.get_bind()
    # Rows holding a custom session-type key would not fit the old enum; map any
    # value outside the original set to NULL before restoring the enum type.
    op.execute(
        "UPDATE reviews SET recommendation = NULL "
        "WHERE recommendation NOT IN ('oral', 'poster', 'reject', 'na')"
    )
    _REVIEW_RECOMMENDATION_ENUM.create(bind, checkfirst=True)
    op.alter_column(
        "reviews",
        "recommendation",
        existing_type=sa.String(length=50),
        type_=_REVIEW_RECOMMENDATION_ENUM,
        existing_nullable=True,
        postgresql_using="recommendation::review_recommendation",
    )
