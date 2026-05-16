"""set nullable + SET NULL on who-did-this FK columns

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table, col, fkey in [
        ("audit_logs", "actor_id", "audit_logs_actor_id_fkey"),
        ("attachments", "uploaded_by_id", "attachments_uploaded_by_id_fkey"),
        ("sessions", "created_by_id", "sessions_created_by_id_fkey"),
        ("decisions", "decided_by_id", "decisions_decided_by_id_fkey"),
    ]:
        op.drop_constraint(fkey, table, type_="foreignkey")
        op.alter_column(table, col, nullable=True)
        op.create_foreign_key(fkey, table, "users", [col], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    for table, col, fkey in [
        ("audit_logs", "actor_id", "audit_logs_actor_id_fkey"),
        ("attachments", "uploaded_by_id", "attachments_uploaded_by_id_fkey"),
        ("sessions", "created_by_id", "sessions_created_by_id_fkey"),
        ("decisions", "decided_by_id", "decisions_decided_by_id_fkey"),
    ]:
        op.drop_constraint(fkey, table, type_="foreignkey")
        op.alter_column(table, col, nullable=False)
        op.create_foreign_key(fkey, table, "users", [col], ["id"], ondelete="RESTRICT")
