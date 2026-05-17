"""Add email_templates table with seeded defaults.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime, timezone

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_NOW = datetime.now(timezone.utc)

_SEEDS = [
    {
        "alias": "submission-confirmation",
        "subject": "Abstract received: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>We've received your abstract <strong>{submission_title}</strong>. "
            "You can view it at any time here:</p>\n"
            "<p><a href=\"{submission_url}\">{submission_url}</a></p>\n"
            "<p>We'll be in touch once the review process is complete.</p>\n"
            "<p>Thank you for submitting!</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "We've received your abstract \"{submission_title}\". You can view it here:\n"
            "{submission_url}\n\n"
            "We'll be in touch once the review process is complete.\n\n"
            "Thank you for submitting!"
        ),
    },
    {
        "alias": "decision-accepted",
        "subject": "Your abstract has been accepted: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>We're pleased to let you know that your abstract <strong>{submission_title}</strong> "
            "has been accepted for presentation as a <strong>{outcome}</strong>.</p>\n"
            "<p><strong>Session:</strong> {slot}</p>\n"
            "<p>Please log in to confirm your participation:</p>\n"
            "<p><a href=\"{submission_url}\">{submission_url}</a></p>\n"
            "<p>You can also view the full program here:</p>\n"
            "<p><a href=\"{program_url}\">{program_url}</a></p>\n"
            "<p>Congratulations, and we look forward to seeing you at the conference!</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "We're pleased to let you know that your abstract \"{submission_title}\" "
            "has been accepted for presentation as a {outcome}.\n\n"
            "Session: {slot}\n\n"
            "Please log in to confirm your participation:\n{submission_url}\n\n"
            "You can also view the full program here:\n{program_url}\n\n"
            "Congratulations, and we look forward to seeing you at the conference!"
        ),
    },
    {
        "alias": "decision-rejected",
        "subject": "Update on your abstract: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>Thank you for submitting your abstract <strong>{submission_title}</strong> "
            "to the conference.</p>\n"
            "<p>After careful review, we regret to inform you that your abstract was not selected "
            "for this year's program. We received many strong submissions and the selection process "
            "was highly competitive.</p>\n"
            "<p>We hope you'll consider submitting again in the future. "
            "Thank you for your interest in the conference.</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "Thank you for submitting your abstract \"{submission_title}\" to the conference.\n\n"
            "After careful review, we regret to inform you that your abstract was not selected for "
            "this year's program. We received many strong submissions and the selection process was "
            "highly competitive.\n\n"
            "We hope you'll consider submitting again in the future. "
            "Thank you for your interest in the conference."
        ),
    },
    {
        "alias": "review-assignment",
        "subject": "Review assignment: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>You've been assigned to review the abstract <strong>{submission_title}</strong>.</p>\n"
            "<p>Please log in to read the abstract and submit your review:</p>\n"
            "<p><a href=\"{submission_url}\">{submission_url}</a></p>\n"
            "<p>Thank you for your service to the program committee.</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "You've been assigned to review the abstract \"{submission_title}\".\n\n"
            "Please log in to read the abstract and submit your review:\n{submission_url}\n\n"
            "Thank you for your service to the program committee."
        ),
    },
    {
        "alias": "file-submission-reminder",
        "subject": "File submission requested: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>The program chair has requested an updated file submission for your abstract "
            "<strong>{submission_title}</strong>.</p>\n"
            "<p><strong>Session:</strong> {slot}</p>\n"
            "<p>Please log in and upload your revised file:</p>\n"
            "<p><a href=\"{submission_url}\">{submission_url}</a></p>\n"
            "<p>You can also view the full program here:</p>\n"
            "<p><a href=\"{program_url}\">{program_url}</a></p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "The program chair has requested an updated file submission for your abstract "
            "\"{submission_title}\".\n\n"
            "Session: {slot}\n\n"
            "Please log in and upload your revised file:\n{submission_url}\n\n"
            "You can also view the full program here:\n{program_url}"
        ),
    },
    {
        "alias": "email-verification",
        "subject": "Verify your email address",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>Please verify your email address by clicking the link below:</p>\n"
            "<p><a href=\"{verify_url}\">{verify_url}</a></p>\n"
            "<p>This link expires in 15 minutes. "
            "If you did not create an account, you can ignore this email.</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "Please verify your email address by visiting:\n{verify_url}\n\n"
            "This link expires in 15 minutes. "
            "If you did not create an account, you can ignore this email."
        ),
    },
    {
        "alias": "confirmation-reminder",
        "subject": "Please confirm your participation: {submission_title}",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>This is a reminder to confirm your participation for your abstract "
            "<strong>{submission_title}</strong>.</p>\n"
            "<p><strong>Session:</strong> {slot}</p>\n"
            "<p>Please confirm by <strong>{confirmation_deadline}</strong>.</p>\n"
            "<p>Please log in to confirm:</p>\n"
            "<p><a href=\"{submission_url}\">{submission_url}</a></p>\n"
            "<p>You can also view the full program here:</p>\n"
            "<p><a href=\"{program_url}\">{program_url}</a></p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "This is a reminder to confirm your participation for your abstract "
            "\"{submission_title}\".\n\n"
            "Session: {slot}\n\n"
            "Please confirm by {confirmation_deadline}.\n\n"
            "Please log in to confirm:\n{submission_url}\n\n"
            "You can also view the full program here:\n{program_url}"
        ),
    },
    {
        "alias": "admin-reset-otp",
        "subject": "Your database reset confirmation code",
        "html": (
            "<p>Hi {full_name},</p>\n"
            "<p>A request was made to reset the conference database. "
            "Your confirmation code is:</p>\n"
            "<p style=\"font-size:2em;font-weight:bold;letter-spacing:0.2em\">{otp_code}</p>\n"
            "<p>This code expires in <strong>10 minutes</strong>.</p>\n"
            "<p>If you did not request this reset, you can ignore this email — "
            "no action will be taken without the code.</p>"
        ),
        "text": (
            "Hi {full_name},\n\n"
            "A request was made to reset the conference database.\n\n"
            "Your confirmation code is: {otp_code}\n\n"
            "This code expires in 10 minutes.\n\n"
            "If you did not request this reset, you can ignore this email — "
            "no action will be taken without the code."
        ),
    },
]


def upgrade() -> None:
    op.create_table(
        "email_templates",
        sa.Column("alias", sa.String(100), primary_key=True),
        sa.Column("subject", sa.Text, nullable=False),
        sa.Column("html", sa.Text, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.bulk_insert(
        sa.table(
            "email_templates",
            sa.column("alias", sa.String),
            sa.column("subject", sa.Text),
            sa.column("html", sa.Text),
            sa.column("text", sa.Text),
            sa.column("updated_at", sa.DateTime(timezone=True)),
        ),
        [{**row, "updated_at": _NOW} for row in _SEEDS],
    )


def downgrade() -> None:
    op.drop_table("email_templates")
