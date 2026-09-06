# Database backups

The app's data lives in Railway Postgres. `scripts/backup_db.py` takes a logical
backup (`pg_dump`), gzips it, and uploads it to a **dedicated R2 bucket** so you
can restore after a bad migration, a bug, or an accidental admin "reset all data".

> An untested backup is not a backup. Do a trial restore (below) at least once
> before the conference, and take a manual snapshot right before each deadline.

## Why a separate bucket

The admin **reset all data** feature deletes every object under the `submissions/`
prefix of the app's file bucket. Backups therefore go to a **different bucket**
(`BACKUP_S3_BUCKET_NAME`) that the app never deletes from. Do **not** point
`BACKUP_S3_BUCKET_NAME` at the same bucket as `S3_BUCKET_NAME`.

## One-time setup

1. **Create a second R2 bucket**, e.g. `pvpmc-backups`, in the same Cloudflare
   account. (You can reuse the existing R2 API keys.)
2. Backups are written under the `backups/` prefix, named
   `conf_site-YYYYMMDD-HHMMSSZ.sql.gz`.

## Environment variables

The script reads only these (a subset of the app's env), so a scheduled job needs
just this much:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Same as the app. `+asyncpg` is stripped automatically. |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2 credentials. |
| `S3_REGION` | Optional, default `auto`. |
| `BACKUP_S3_BUCKET_NAME` | The dedicated backup bucket. Required. |
| `BACKUP_RETENTION_DAYS` | Optional, default `30`. Older backups are pruned. |

## Run a backup manually (pre-deadline snapshot)

From the Railway backend service shell (recommended — correct `pg_dump` version and
network), or any host with `postgresql-client` installed and the env vars set:

```bash
python scripts/backup_db.py
```

Expected output ends with:

```
[backup] done: uploaded backups/conf_site-20260906-1830Z.sql.gz; pruned 0 backup(s) older than 30 days.
```

## Schedule it (Railway cron)

Run it automatically as a **separate Railway service** in the `conf_site` project,
built from this same repo (so it already has `pg_dump` and the script):

1. New service → deploy from the `conf_site` repo (root directory `/`).
2. **Settings → Deploy**:
   - **Custom Start Command:** `python scripts/backup_db.py`
   - **Cron Schedule:** `0 6 * * *` (daily at 06:00 UTC — adjust as you like)
3. **Variables:** set the ones in the table above. The simplest way is to reference
   the backend service's values and add `BACKUP_S3_BUCKET_NAME` +
   `BACKUP_RETENTION_DAYS`.
4. Railway runs the container on schedule; it exits when the backup finishes.

Check **Deployments → Logs** after the first scheduled run to confirm the
`[backup] done:` line.

## Restore

Restore into a **fresh, empty database** (never over live data). Create a new
Postgres, then:

```bash
# 1. Download the backup from R2 (Cloudflare dashboard, or aws/rclone CLI).
# 2. Decompress and load it into the target DB (plain postgresql:// URL, no +asyncpg):
gunzip -c conf_site-YYYYMMDD-HHMMSSZ.sql.gz | psql "postgresql://user:pass@host:port/dbname"
```

Then point the app's `DATABASE_URL` at the restored database and redeploy.

For a partial/point-in-time recovery, or to promote a restored DB in place, see
Railway's Postgres docs. Consider also enabling Railway's own managed backups as a
second, independent safety net.
