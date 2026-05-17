# Resend with Python-rendered email templates

Transactional email is sent via [Resend](https://resend.com) using HTML/text rendered by Python functions in the codebase, not server-side templates managed on an email provider's dashboard.

## Reason

The system was initially wired for Postmark's server-side template system (`TemplateAlias` + `TemplateModel` JSON). Postmark was never activated — sender domain, API key, and template content were all still placeholders at the point we chose Resend.

Two alternatives were considered for template content:

- **Postmark server-side templates**: content lives in the Postmark dashboard, not in the repo. Template changes are not version-controlled, not reviewable in PRs, and require a separate login to edit. Rejected.
- **React Email (TSX templates rendered server-side)**: produces polished output but requires a Node.js build step in a Python-only project. The emails here are simple transactional notifications, not marketing HTML. Rejected.

Python functions in `app/workers/email_templates.py` render each template by name, returning `(subject, html, text)`. The existing `template_alias` / `template_model` columns in `email_jobs` are preserved — `template_alias` becomes an internal key into that registry, and `template_model` supplies the variables. All email content is in the codebase, version-controlled, and testable without a live email provider.

`email_from_address` and `email_from_name` are stored in Conference Settings (database) so the sender identity can be updated at runtime without a redeploy.

## Consequence

Template changes require a code deployment. There is no preview UI. Both are acceptable given the conference's operational scale (one deployment, small team).
