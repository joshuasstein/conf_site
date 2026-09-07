"""Email template registry.

Each renderer takes a template_model dict and returns (subject, html, text).
The worker calls render(template_alias, template_model, db) before sending.

When a row exists in the email_templates table for the alias, that content is
used instead of the Python renderer.  Variables are substituted using
{variable_name} placeholders; unknown placeholders render as an empty string.
"""
from __future__ import annotations

import html as _html
import re

from app.config import get_settings


def _submission_url(submission_id: str) -> str:
    settings = get_settings()
    return f"{settings.frontend_url}submissions/{submission_id}"


def _program_url() -> str:
    settings = get_settings()
    return f"{settings.frontend_url}program"


def _slot_label(m: dict) -> str:
    parts = []
    if m.get("session_title"):
        parts.append(m["session_title"])
    if m.get("session_date"):
        parts.append(m["session_date"])
    if m.get("session_start_time"):
        parts.append(f"starting {m['session_start_time']}")
    if m.get("slot_order"):
        parts.append(f"slot {m['slot_order']}")
    return ", ".join(parts)


def _augment(m: dict) -> dict:
    """Add computed URL / slot fields so DB templates can reference them."""
    extra: dict = {}
    if m.get("submission_id"):
        extra["submission_url"] = _submission_url(m["submission_id"])
    extra["program_url"] = _program_url()
    extra["slot"] = _slot_label(m)
    return {**extra, **m}


def _conf_footer_html(m: dict) -> str:
    name = m.get("conference_name", "")
    location = m.get("conference_location", "")
    dates = m.get("conference_dates", "")
    parts = [p for p in [name, location, dates] if p]
    if not parts:
        return ""
    return (
        '\n<hr style="margin-top:2em;border:none;border-top:1px solid #e2e8f0">'
        f'\n<p style="font-size:0.85em;color:#64748b">{"<br>".join(parts)}</p>'
    )


def _conf_footer_text(m: dict) -> str:
    name = m.get("conference_name", "")
    location = m.get("conference_location", "")
    dates = m.get("conference_dates", "")
    parts = [p for p in [name, location, dates] if p]
    if not parts:
        return ""
    return "\n\n---\n" + "\n".join(parts)


def _substitute(template: str, model: dict) -> str:
    return re.sub(r"\{(\w+)\}", lambda hit: str(model.get(hit.group(1), "")), template)


# ── Python renderers (fallback) ────────────────────────────────────────────────

def _render_submission_confirmation(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]
    url = _submission_url(m["submission_id"])

    subject = f"Abstract received: {title}"
    html = f"""<p>Hi {name},</p>
<p>We've received your abstract <strong>{title}</strong>. You can view it at any time here:</p>
<p><a href="{url}">{url}</a></p>
<p>We'll be in touch once the review process is complete.</p>
<p>Thank you for submitting!</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"We've received your abstract \"{title}\". You can view it here:\n{url}\n\n"
        "We'll be in touch once the review process is complete.\n\nThank you for submitting!"
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_decision_accepted(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]
    outcome = m["outcome"].capitalize()
    url = _submission_url(m["submission_id"])
    program = _program_url()
    slot = _slot_label(m)

    subject = f"Your abstract has been accepted: {title}"
    session_block_html = f"<p><strong>Session:</strong> {slot}</p>" if slot else ""
    session_block_text = f"Session: {slot}\n" if slot else ""

    html = f"""<p>Hi {name},</p>
<p>We're pleased to let you know that your abstract <strong>{title}</strong> has been accepted for presentation as a <strong>{outcome}</strong>.</p>
{session_block_html}
<p>Please log in to confirm your participation:</p>
<p><a href="{url}">{url}</a></p>
<p>You can also view the full program here:</p>
<p><a href="{program}">{program}</a></p>
<p>Congratulations, and we look forward to seeing you at the conference!</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"We're pleased to let you know that your abstract \"{title}\" has been accepted for presentation as a {outcome}.\n\n"
        f"{session_block_text}"
        f"Please log in to confirm your participation:\n{url}\n\n"
        f"You can also view the full program here:\n{program}\n\n"
        "Congratulations, and we look forward to seeing you at the conference!"
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_decision_rejected(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]

    subject = f"Update on your abstract: {title}"
    html = f"""<p>Hi {name},</p>
<p>Thank you for submitting your abstract <strong>{title}</strong> to the conference.</p>
<p>After careful review, we regret to inform you that your abstract was not selected for this year's program. We received many strong submissions and the selection process was highly competitive.</p>
<p>We hope you'll consider submitting again in the future. Thank you for your interest in the conference.</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"Thank you for submitting your abstract \"{title}\" to the conference.\n\n"
        "After careful review, we regret to inform you that your abstract was not selected for "
        "this year's program. We received many strong submissions and the selection process was "
        "highly competitive.\n\n"
        "We hope you'll consider submitting again in the future. Thank you for your interest in the conference."
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_review_assignment(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]
    url = _submission_url(m["submission_id"])

    subject = f"Review assignment: {title}"
    html = f"""<p>Hi {name},</p>
<p>You've been assigned to review the abstract <strong>{title}</strong>.</p>
<p>Please log in to read the abstract and submit your review:</p>
<p><a href="{url}">{url}</a></p>
<p>Thank you for your service to the program committee.</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"You've been assigned to review the abstract \"{title}\".\n\n"
        f"Please log in to read the abstract and submit your review:\n{url}\n\n"
        "Thank you for your service to the program committee."
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_file_submission_reminder(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]
    url = _submission_url(m["submission_id"])
    program = _program_url()
    slot = _slot_label(m)

    subject = f"File submission requested: {title}"
    session_block_html = f"<p><strong>Session:</strong> {slot}</p>" if slot else ""
    session_block_text = f"Session: {slot}\n" if slot else ""

    html = f"""<p>Hi {name},</p>
<p>The program chair has requested an updated file submission for your abstract <strong>{title}</strong>.</p>
{session_block_html}
<p>Please log in and upload your revised file:</p>
<p><a href="{url}">{url}</a></p>
<p>You can also view the full program here:</p>
<p><a href="{program}">{program}</a></p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"The program chair has requested an updated file submission for your abstract \"{title}\".\n\n"
        f"{session_block_text}"
        f"Please log in and upload your revised file:\n{url}\n\n"
        f"You can also view the full program here:\n{program}"
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_email_verification(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    url = m["verify_url"]

    subject = "Verify your email address"
    html = f"""<p>Hi {name},</p>
<p>Please verify your email address by clicking the link below:</p>
<p><a href="{url}">{url}</a></p>
<p>This link expires in 15 minutes. If you did not create an account, you can ignore this email.</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"Please verify your email address by visiting:\n{url}\n\n"
        "This link expires in 15 minutes. If you did not create an account, you can ignore this email."
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_confirmation_reminder(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    title = m["submission_title"]
    url = _submission_url(m["submission_id"])
    program = _program_url()
    slot = _slot_label(m)
    deadline = m.get("confirmation_deadline", "")

    subject = f"Please confirm your participation: {title}"
    deadline_block_html = f"<p>Please confirm by <strong>{deadline}</strong>.</p>" if deadline else ""
    deadline_block_text = f"Please confirm by {deadline}.\n\n" if deadline else ""
    session_block_html = f"<p><strong>Session:</strong> {slot}</p>" if slot else ""
    session_block_text = f"Session: {slot}\n" if slot else ""

    html = f"""<p>Hi {name},</p>
<p>This is a reminder to confirm your participation for your abstract <strong>{title}</strong>.</p>
{session_block_html}
{deadline_block_html}
<p>Please log in to confirm:</p>
<p><a href="{url}">{url}</a></p>
<p>You can also view the full program here:</p>
<p><a href="{program}">{program}</a></p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"This is a reminder to confirm your participation for your abstract \"{title}\".\n\n"
        f"{session_block_text}"
        f"{deadline_block_text}"
        f"Please log in to confirm:\n{url}\n\n"
        f"You can also view the full program here:\n{program}"
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_admin_reset_otp(m: dict) -> tuple[str, str, str]:
    name = m["full_name"]
    code = m["otp_code"]

    subject = "Your database reset confirmation code"
    html = f"""<p>Hi {name},</p>
<p>A request was made to reset the conference database. Your confirmation code is:</p>
<p style="font-size:2em;font-weight:bold;letter-spacing:0.2em">{code}</p>
<p>This code expires in <strong>10 minutes</strong>.</p>
<p>If you did not request this reset, you can ignore this email — no action will be taken without the code.</p>""" + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        "A request was made to reset the conference database.\n\n"
        f"Your confirmation code is: {code}\n\n"
        "This code expires in 10 minutes.\n\n"
        "If you did not request this reset, you can ignore this email — no action will be taken without the code."
        + _conf_footer_text(m)
    )
    return subject, html, text


def _render_username_reminder(m: dict) -> tuple[str, str, str]:
    name = m.get("full_name", "there")
    usernames_html = m.get("usernames_html", "")
    usernames_plain = m.get("usernames_plain", "")
    subject = f"Your {m.get('conference_name', 'conference')} account username(s)"
    html = (
        f"<p>Hi {name},</p>"
        f"<p>Here are the username(s) associated with your email address:</p>"
        f"{usernames_html}"
        f"<p>You can sign in at any time using your username and password.</p>"
    ) + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"Here are the username(s) associated with your email address:\n\n"
        f"{usernames_plain}\n\n"
        f"You can sign in at any time using your username and password."
    ) + _conf_footer_text(m)
    return subject, html, text


def _render_password_reset(m: dict) -> tuple[str, str, str]:
    name = m.get("full_name", "there")
    username = m.get("username", "")
    reset_url = m.get("reset_url", "#")
    subject = f"Reset your {m.get('conference_name', 'conference')} password"
    html = (
        f"<p>Hi {name},</p>"
        f"<p>A password reset was requested for the account <strong>{username}</strong>.</p>"
        f'<p><a href="{reset_url}" style="background:#4f46e5;color:white;padding:10px 20px;'
        f'border-radius:6px;text-decoration:none;display:inline-block;">Reset password</a></p>'
        f"<p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>"
    ) + _conf_footer_html(m)
    text = (
        f"Hi {name},\n\n"
        f"A password reset was requested for the account '{username}'.\n\n"
        f"Reset your password here:\n{reset_url}\n\n"
        f"This link expires in 1 hour. If you did not request a reset, you can ignore this email."
    ) + _conf_footer_text(m)
    return subject, html, text


def _plaintext_to_html(text: str) -> str:
    """Escape a plain-text body and turn blank-line-separated blocks into paragraphs."""
    blocks = re.split(r"\n\s*\n", text.strip())
    paras = []
    for block in blocks:
        escaped = _html.escape(block).replace("\n", "<br>")
        paras.append(f"<p>{escaped}</p>")
    return "\n".join(paras)


def _render_custom_broadcast(m: dict) -> tuple[str, str, str]:
    """Ad-hoc admin/chair broadcast. Body is plain text with {full_name} substitution."""
    subject = _substitute(m.get("subject", ""), m)
    body_text = _substitute(m.get("body", ""), m)
    text = body_text + _conf_footer_text(m)
    html = _plaintext_to_html(body_text) + _conf_footer_html(m)
    return subject, html, text


# ── Registry ──────────────────────────────────────────────────────────────────

_REGISTRY: dict[str, callable] = {
    "custom-broadcast": _render_custom_broadcast,
    "submission-confirmation": _render_submission_confirmation,
    "decision-accepted": _render_decision_accepted,
    "decision-rejected": _render_decision_rejected,
    "review-assignment": _render_review_assignment,
    "file-submission-reminder": _render_file_submission_reminder,
    "email-verification": _render_email_verification,
    "confirmation-reminder": _render_confirmation_reminder,
    "admin-reset-otp": _render_admin_reset_otp,
    "username-reminder": _render_username_reminder,
    "password-reset": _render_password_reset,
}


async def render(
    template_alias: str,
    template_model: dict,
    db=None,
) -> tuple[str, str, str]:
    """Return (subject, html, text) for the given template alias and model.

    If a DB session is provided and a row exists in email_templates for the
    alias, that content is used with {variable} substitution.  Otherwise falls
    back to the Python renderer.

    Raises KeyError if the alias is not registered.
    """
    if db is not None:
        from sqlalchemy import select
        from app.models.email_template import EmailTemplateRecord

        result = await db.execute(
            select(EmailTemplateRecord).where(EmailTemplateRecord.alias == template_alias)
        )
        row = result.scalar_one_or_none()
        if row is not None:
            model = _augment(template_model)
            return (
                _substitute(row.subject, model),
                _substitute(row.html, model),
                _substitute(row.text, model),
            )

    renderer = _REGISTRY[template_alias]
    return renderer(template_model)
