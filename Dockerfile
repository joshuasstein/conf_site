FROM python:3.12-slim

WORKDIR /app

# postgresql-client provides pg_dump for scripts/backup_db.py (run as a Railway
# cron job from this same image). python:3.12-slim is currently Debian 13 "trixie",
# whose own repo ships the PostgreSQL 17 client — sufficient for Railway's managed
# Postgres (pg_dump can dump servers of the same or older major version).
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install -e .

COPY . .

# Migrations run in Railway's preDeployCommand (see railway.toml), not here.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
