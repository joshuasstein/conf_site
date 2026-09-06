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

Retention (deleting old backups) is handled by an R2 lifecycle rule, not by the
script — see "Retention" below.

## Run a backup manually (pre-deadline snapshot)

From the Railway backend service shell (recommended — correct `pg_dump` version and
network), or any host with `postgresql-client` installed and the env vars set:

```bash
python scripts/backup_db.py
```

Expected output ends with:

```
[backup] verified in bucket: 11843 bytes at backups/conf_site-20260906-1830Z.sql.gz
[backup] done: uploaded backups/conf_site-20260906-1830Z.sql.gz
```

## Schedule it (Railway cron)

Run it automatically as a **separate Railway service** in the `conf_site` project,
built from this same repo (so it already has `pg_dump` and the script):

1. New service → deploy from the `conf_site` repo (root directory `/`).
2. **Settings → Deploy**:
   - **Custom Start Command:** `python scripts/backup_db.py`
   - **Cron Schedule:** `0 6 * * *` (daily at 06:00 UTC — adjust as you like)
3. **Variables:** set the ones in the table above. The simplest way is to reference
   the backend service's values and add `BACKUP_S3_BUCKET_NAME`.
4. Railway runs the container on schedule; it exits when the backup finishes.

Check **Deployments → Logs** after the first scheduled run to confirm the
`[backup] done:` line.

## Retention (auto-delete old backups)

Set an **R2 lifecycle rule** on the backup bucket — the reliable, storage-native
way to expire old objects (no API calls, no cleanup code to fail):

1. Cloudflare dashboard → **R2 → `pvpmc-backups` → Settings → Object lifecycle rules**.
2. **Add rule:** apply to prefix `backups/`, action **Delete objects** **N days after
   creation** (e.g. 30).
3. Save. R2 deletes backups older than N days automatically.

(The backup script no longer prunes — R2 handles it.)

## Restore

Always restore into a **fresh, empty database** — never over live data.
`scripts/restore_db.py` downloads a backup from R2 and loads it with `psql`, and
**refuses to run if the target is the same DB as `DATABASE_URL`**.

### Test restore (recommended before the conference)

Do this on Railway so you get the right `psql` version (18) and network — reusing
the backup image, which already has `postgresql-client`:

1. **Create a throwaway Postgres.** In the `conf_site` project → **Add → Database →
   PostgreSQL** (e.g. name it `restore-test`). Copy its **`DATABASE_PUBLIC_URL`**.
2. **Find the backup key** to restore — in R2 → `pvpmc-backups` → `backups/`, e.g.
   `backups/conf_site-20260906-212008Z.sql.gz`.
3. **On the `backup-cron` service** (it has `psql` + R2 access), set these
   variables temporarily and change the start command:
   ```
   RESTORE_TARGET_URL   = <the restore-test DATABASE_PUBLIC_URL>
   RESTORE_BACKUP_KEY   = backups/conf_site-YYYYMMDD-HHMMSSZ.sql.gz
   ```
   Start command: `python scripts/restore_db.py` (temporarily; also clear the cron
   schedule so it runs once), then **Deploy**.
4. **Read the logs.** Success ends with:
   ```
   [restore] done. Restored data: N users, M submissions
   ```
   That non-zero row count is your proof the backup is real and loadable.
5. **Clean up:** restore the cron service's start command (`python scripts/backup_db.py`)
   and schedule (`0 6 * * *`), remove the `RESTORE_*` vars, and **delete the
   `restore-test` Postgres**.

### Real disaster recovery

Same as above, but restore into a new production-grade Postgres, then point the
app's `DATABASE_URL` at it and redeploy. Consider also enabling Railway's own
managed Postgres backups as a second, independent safety net.

### Manual alternative

If you have `psql` locally (matching the server major version):

```bash
gunzip -c conf_site-YYYYMMDD-HHMMSSZ.sql.gz | psql "postgresql://user:pass@host:port/dbname"
```
