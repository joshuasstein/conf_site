FROM python:3.12-slim

WORKDIR /app

# postgresql-client provides pg_dump for scripts/backup_db.py (run as a Railway
# cron job from this same image). Railway's managed Postgres is v18, and pg_dump
# cannot dump a newer server than itself, so pull the v18 client from the official
# PostgreSQL apt repo for trixie (python:3.12-slim is Debian 13 "trixie"; using the
# matching codename is what makes the dependencies resolve).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
         https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt trixie-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-18 \
    && pg_dump --version \
    && apt-get purge -y curl gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install -e .

COPY . .

# Migrations run in Railway's preDeployCommand (see railway.toml), not here.
# exec form + `exec` so uvicorn becomes PID 1 and receives SIGTERM for a graceful
# shutdown on deploys/restarts (shell-form CMD would swallow the signal).
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
