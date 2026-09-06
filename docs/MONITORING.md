# Monitoring & alerting

Three layers so you find out about problems before your users do:

1. **Sentry** — captures backend exceptions (API 500s and email-worker failures)
2. **Uptime check** — pings `/health` and alerts if the app goes down
3. **Failed-email alerts** — permanently-failed email jobs are sent to Sentry

## 1. Sentry (error tracking)

Wired into the backend: unhandled request errors and permanently-failed email
jobs are reported automatically. It's a **no-op until `SENTRY_DSN` is set**, so
local/dev and tests are unaffected.

**Setup:**

1. Create a free account at [sentry.io](https://sentry.io) → **Create Project** →
   platform **Python / FastAPI**. Copy the **DSN** it shows.
2. In Railway → **backend** service → Variables:
   ```
   SENTRY_DSN=<the DSN from Sentry>
   SENTRY_ENVIRONMENT=production
   ```
   (Add the same to the `backup-cron` service if you want backup-job errors
   captured too — optional.)
3. Redeploy. On boot the logs show `Sentry error tracking enabled`.
4. In Sentry, set up an **alert rule** (e.g. email/Slack on any new issue) so you
   get notified, and optionally invite teammates.

Errors-only is configured (`traces_sample_rate=0`), so there's no performance
overhead or cost from tracing, and `send_default_pii=False` avoids sending user data.

**Test it:** trigger any backend error (or temporarily add a throwaway route that
raises) and confirm the issue appears in Sentry.

## 2. Uptime check on /health

The app exposes `GET /health` returning `{"status":"ok"}`. Point an external
uptime monitor at it so you're alerted if the site is unreachable:

- **UptimeRobot** (free) or **Better Stack / Cronitor** etc.
- Monitor type: **HTTPS**, URL: `https://<your-backend-domain>/health`
- Interval: 1–5 minutes; alert by email/SMS/Slack.
- Optionally also monitor the frontend URL.

This catches outages the app can't report itself (crash, bad deploy, DB
unreachable — `/health` will fail or time out).

## 3. Failed-email alerts

When an email job exhausts its retries it's marked `failed`, logged, **and sent to
Sentry** with the recipient, template, and retry count (see
`_report_to_sentry` in `app/workers/email_worker.py`). So a Sentry alert rule
doubles as your "email isn't going out" alarm.

You can also see email delivery status in-app at **Admin → Notifications → Recent
Email Jobs**, and every send attempt in Postmark's **Activity** view.

## What to watch during the conference

- Sentry issues (especially around the submission and decision deadlines)
- The uptime monitor
- Postmark Activity + Admin → Notifications for bounces/failures
