#!/usr/bin/env python3
"""Database backup: pg_dump -> gzip -> upload to a dedicated R2 backup bucket.

Run manually for a pre-deadline snapshot, or on a schedule (Railway cron):

    python scripts/backup_db.py

Requires ``pg_dump`` (postgresql-client) on PATH and these environment variables:

    DATABASE_URL            (the app's DB URL; +asyncpg is stripped automatically)
    S3_ENDPOINT_URL         (R2 S3 endpoint)
    S3_ACCESS_KEY_ID
    S3_SECRET_ACCESS_KEY
    BACKUP_S3_BUCKET_NAME   a SEPARATE bucket from the app's file bucket, so an
                            admin data-reset can never delete the backups
    S3_REGION               (optional, default "auto")
    BACKUP_RETENTION_DAYS   (optional, default 30)

Reads only these vars (not the app's full settings) so it can run as a small,
standalone scheduled job.
"""
from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from sqlalchemy.engine import make_url

_BACKUP_PREFIX = "backups/"


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"ERROR: {name} is not set.", file=sys.stderr)
        raise SystemExit(2)
    return val


def conn_parts(database_url: str) -> dict[str, str]:
    """Split the app's DATABASE_URL into pg_dump connection fields.

    Uses SQLAlchemy's parser (the same one the app connects with) so it handles the
    +asyncpg driver prefix and percent-decoding identically. Fields are passed to
    pg_dump as explicit flags + PGPASSWORD env, never as a URI — so special
    characters in the password can't break libpq's stricter URI parsing.
    """
    url = make_url(database_url)
    return {
        "host": url.host or "localhost",
        "port": str(url.port or 5432),
        "user": url.username or "postgres",
        "password": url.password or "",
        "dbname": url.database or "postgres",
    }


def _s3_client():
    # Cloudflare R2 rejects botocore's newer default integrity checksums, which
    # breaks calls like list_objects_v2; restrict checksums to when required.
    return boto3.client(
        "s3",
        endpoint_url=_require("S3_ENDPOINT_URL"),
        aws_access_key_id=_require("S3_ACCESS_KEY_ID"),
        aws_secret_access_key=_require("S3_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("S3_REGION", "auto"),
        config=Config(
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def create_dump(parts: dict[str, str], out_path: str) -> None:
    """Run pg_dump into out_path. --no-owner/--no-acl keep the dump portable.

    Connection fields are passed as explicit flags; the password goes through
    PGPASSWORD so it never has to survive URL escaping.
    """
    env = {**os.environ, "PGPASSWORD": parts["password"]}
    result = subprocess.run(
        [
            "pg_dump",
            "--no-owner",
            "--no-acl",
            "--host", parts["host"],
            "--port", parts["port"],
            "--username", parts["user"],
            "--dbname", parts["dbname"],
            "--file", out_path,
        ],
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pg_dump failed (exit {result.returncode}):\n{result.stderr.strip()}")


def main() -> int:
    bucket = os.environ.get("BACKUP_S3_BUCKET_NAME")
    if not bucket:
        print(
            "ERROR: BACKUP_S3_BUCKET_NAME is not set. Create a SEPARATE R2 bucket for "
            "backups (not your file bucket) and set BACKUP_S3_BUCKET_NAME to it.",
            file=sys.stderr,
        )
        return 2

    parts = conn_parts(_require("DATABASE_URL"))
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
    key = f"{_BACKUP_PREFIX}conf_site-{ts}.sql.gz"

    with tempfile.TemporaryDirectory() as tmp:
        sql_path = os.path.join(tmp, "dump.sql")
        gz_path = os.path.join(tmp, "dump.sql.gz")

        print(f"[backup] running pg_dump against {parts['host']}:{parts['port']}/{parts['dbname']} ...")
        create_dump(parts, sql_path)
        raw = os.path.getsize(sql_path)

        with open(sql_path, "rb") as f_in, gzip.open(gz_path, "wb", compresslevel=6) as f_out:
            shutil.copyfileobj(f_in, f_out)
        size = os.path.getsize(gz_path)

        print(f"[backup] dumped {raw / 1e6:.2f} MB -> {size / 1e6:.2f} MB gz; uploading s3://{bucket}/{key}")
        s3 = _s3_client()
        s3.upload_file(gz_path, bucket, key)
        # Verify the object is actually retrievable — a PUT that "succeeds" but
        # doesn't persist is worse than a loud failure.
        head = s3.head_object(Bucket=bucket, Key=key)
        print(f"[backup] verified in bucket: {head['ContentLength']} bytes at {key}")

    # Retention (deleting old backups) is handled by an R2 bucket lifecycle rule,
    # not from here — see docs/BACKUPS.md. Lifecycle rules are the reliable way to
    # expire objects and avoid depending on R2's list_objects_v2 quirks.
    print(f"[backup] done: uploaded {key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
