"""Add conference name/location/dates footer to all email templates.

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

_FOOTER_HTML = (
    '\n<hr style="margin-top:2em;border:none;border-top:1px solid #e2e8f0">'
    '\n<p style="font-size:0.85em;color:#64748b">'
    "{conference_name}<br>{conference_location}<br>{conference_dates}</p>"
)

_FOOTER_TEXT = "\n\n---\n{conference_name}\n{conference_location}\n{conference_dates}"

_table = sa.table(
    "email_templates",
    sa.column("alias", sa.String),
    sa.column("html", sa.Text),
    sa.column("text", sa.Text),
)


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.select(_table.c.alias, _table.c.html, _table.c.text)).fetchall()
    for alias, html, text in rows:
        conn.execute(
            _table.update()
            .where(_table.c.alias == alias)
            .values(html=html + _FOOTER_HTML, text=text + _FOOTER_TEXT)
        )


def downgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.select(_table.c.alias, _table.c.html, _table.c.text)).fetchall()
    for alias, html, text in rows:
        conn.execute(
            _table.update()
            .where(_table.c.alias == alias)
            .values(
                html=html.replace(_FOOTER_HTML, ""),
                text=text.replace(_FOOTER_TEXT, ""),
            )
        )
