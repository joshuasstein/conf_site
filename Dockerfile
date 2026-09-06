FROM python:3.12-slim

WORKDIR /app

# postgresql-client provides pg_dump for scripts/backup_db.py (run as a Railway
# cron job from this same image). Pulled from the official PostgreSQL apt repo so
# the client major version is >= the managed Postgres server (pg_dump cannot dump
# a newer server than itself). python:3.12-slim is Debian 12 "bookworm".
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-17 \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install -e .

COPY . .

# Migrations run in Railway's preDeployCommand (see railway.toml), not here.
CMD uvicorn app.main:app --host 0.0.0.0 --port $PORT
