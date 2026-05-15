# Conference Abstract Management System

FastAPI/PostgreSQL backend managing the full lifecycle of a technical conference.

## Quick start

```bash
cp .env.example .env  # fill in secrets
make install
make migrate
make dev
```

## Architecture

```
app/
  main.py           # FastAPI app factory + worker startup
  config.py         # pydantic-settings (all secrets from env)
  database.py       # async SQLAlchemy engine + get_db dependency
  models/           # ORM models — one file per table
  schemas/          # Pydantic request/response schemas
  routers/          # Thin route handlers — one file per route group
  services/         # All business logic
  dependencies/     # FastAPI Depends() — auth, role guards
  workers/          # email_worker.py — async background loop
migrations/
  env.py            # Alembic async env
  versions/         # Migration files
tests/
  conftest.py       # SQLite in-memory fixtures
```

## Non-negotiable rules

- **Async only**: `async def` for all handlers and service functions; async SQLAlchemy sessions everywhere.
- **No hardcoded secrets**: everything via pydantic-settings / env vars.
- **State machine in service layer**: transitions enforced in `services/submission.py`, not routers.
- **Admin overrides always logged**: any forced status change must create an `AuditLog` entry.
- **No file URLs in DB**: store only `storage_key`; generate pre-signed URLs on demand (30-min expiry).
- **Emails are async**: queue an `EmailJob` row; the worker sends it. Never `httpx.post` in a request handler.
- **Routers are thin**: handlers call one service function and return its result.
- **No raw SQL**: SQLAlchemy ORM only — no string interpolation into queries.
- **Every model change needs a migration**.

## Submission state machine

```
draft → submitted → under_review → decided → assigned_to_session → notified → confirmed → files_submitted
                                                                               notified → withdrawn
```

Admins can force any transition — always audit-logged.

## Roles

| Role | Permissions |
|------|-------------|
| submitter | CRUD own drafts (before deadline), confirm/withdraw, upload final files |
| reviewer | View assigned submissions, submit reviews (cannot self-review) |
| program_chair | Create sessions, assign decided submissions, view all reviews |
| admin | Everything — users, deadlines, bulk notify, status overrides |

## Running tests

```bash
make test
```

Tests use SQLite in-memory — no PostgreSQL required.
