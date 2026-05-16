# Conference settings stored in database, not environment variables

Deadlines (submission, confirmation, file submission) and the review visibility toggle are stored in a single-row `conference_settings` table rather than as environment variables. Deadline extensions are common during a live conference and requiring a Railway redeploy to change them is impractical. Secrets (DATABASE_URL, SECRET_KEY, API keys) remain in env vars; only runtime-adjustable operational settings move to the database.
