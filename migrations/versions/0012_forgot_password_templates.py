"""Add username-reminder and password-reset email templates.

Revision ID: 0012
Revises: 0011
Create Date: 2026-05-17
"""
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_NOW = datetime.now(timezone.utc)


def upgrade() -> None:
    email_templates = sa.table(
        "email_templates",
        sa.column("alias", sa.String),
        sa.column("subject", sa.Text),
        sa.column("html", sa.Text),
        sa.column("text", sa.Text),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )

    op.bulk_insert(email_templates, [
        {
            "alias": "username-reminder",
            "subject": "Your {conference_name} account username(s)",
            "html": (
                "<p>Hi {full_name},</p>"
                "<p>Here are the username(s) associated with your email address:</p>"
                "{usernames_html}"
                "<p>You can sign in at any time using your username and password.</p>"
                "{conf_footer_html}"
            ),
            "text": (
                "Hi {full_name},\n\n"
                "Here are the username(s) associated with your email address:\n\n"
                "{usernames_plain}\n\n"
                "You can sign in at any time using your username and password."
                "{conf_footer_text}"
            ),
            "updated_at": _NOW,
        },
        {
            "alias": "password-reset",
            "subject": "Reset your {conference_name} password",
            "html": (
                "<p>Hi {full_name},</p>"
                "<p>A password reset was requested for the account <strong>{username}</strong>.</p>"
                '<p><a href="{reset_url}" style="background:#4f46e5;color:white;padding:10px 20px;'
                'border-radius:6px;text-decoration:none;display:inline-block;">Reset password</a></p>'
                "<p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>"
                "{conf_footer_html}"
            ),
            "text": (
                "Hi {full_name},\n\n"
                "A password reset was requested for the account '{username}'.\n\n"
                "Reset your password here:\n{reset_url}\n\n"
                "This link expires in 1 hour. If you did not request a reset, you can ignore this email."
                "{conf_footer_text}"
            ),
            "updated_at": _NOW,
        },
    ])


def downgrade() -> None:
    op.execute("DELETE FROM email_templates WHERE alias IN ('username-reminder', 'password-reset')")
