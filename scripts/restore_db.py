#!/usr/bin/env python3
"""Restore a backup from R2 into a THROWAWAY database, to prove backups work.

Guardrails: refuses to run unless RESTORE_TARGET_URL is set and is different from
the app's DATABASE_URL — so it can never overwrite production. Restore into a
fresh, empty Postgres (create a temporary one), never over live data.

Env vars:
    RESTORE_TARGET_URL      the throwaway DB to restore INTO (required; must NOT
                            equal DATABASE_URL)
    RESTORE_BACKUP_KEY      the backup object key to restore, e.g.
                            backups/conf_site-20260906-212008Z.sql.gz (required)
    BACKUP_S3_BUCKET_NAME   the backup bucket (e.g. pvpmc-backups)
    S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION  (R2 creds)
    DATABASE_URL            the app DB — only read to refuse restoring onto it
"""
from __future__ import annotations

import gzip
import os
import shutil
import subprocess
import sys
import tempfile

import boto3
from botocore.config import Config
from sqlalchemy.engine import make_url


def _require(name: str) -> str:
    val = os.environ.get(name)
    if not val:
        print(f"ERROR: {name} is not set.", file=sys.stderr)
        raise SystemExit(2)
    return val


def conn_parts(database_url: str) -> dict[str, str]:
    url = make_url(database_url)
    return {
        "host": url.host or "localhost",
        "port": str(url.port or 5432),
        "user": url.username or "postgres",
        "password": url.password or "",
        "dbname": url.database or "postgres",
    }


def _s3_client():
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


def _same_database(a: str, b: str) -> bool:
    try:
        ua, ub = make_url(a), make_url(b)
        return (ua.host, ua.port, ua.database) == (ub.host, ub.port, ub.database)
    except Exception:  # noqa: BLE001
        return a == b


def _psql(parts: dict[str, str], args: list[str]) -> subprocess.CompletedProcess:
    env = {**os.environ, "PGPASSWORD": parts["password"]}
    return subprocess.run(
        ["psql", "--host", parts["host"], "--port", parts["port"],
         "--username", parts["user"], "--dbname", parts["dbname"], *args],
        capture_output=True, text=True, env=env,
    )


def main() -> int:
    target = _require("RESTORE_TARGET_URL")
    key = _require("RESTORE_BACKUP_KEY")
    bucket = _require("BACKUP_S3_BUCKET_NAME")

    prod = os.environ.get("DATABASE_URL")
    if prod and _same_database(target, prod):
        print("ERROR: RESTORE_TARGET_URL points at the same database as DATABASE_URL. "
              "Restore into a SEPARATE throwaway database.", file=sys.stderr)
        return 2

    parts = conn_parts(target)
    print(f"[restore] target: {parts['host']}:{parts['port']}/{parts['dbname']}")
    print(f"[restore] source: s3://{bucket}/{key}")

    with tempfile.TemporaryDirectory() as tmp:
        gz_path = os.path.join(tmp, "dump.sql.gz")
        sql_path = os.path.join(tmp, "dump.sql")
        _s3_client().download_file(bucket, key, gz_path)
        with gzip.open(gz_path, "rb") as f_in, open(sql_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)

        print("[restore] loading dump with psql (ON_ERROR_STOP) ...")
        result = _psql(parts, ["-v", "ON_ERROR_STOP=1", "-f", sql_path])
        if result.returncode != 0:
            print(result.stderr.strip(), file=sys.stderr)
            raise RuntimeError(f"psql restore failed (exit {result.returncode})")

    # Verify by counting a couple of core tables.
    check = _psql(parts, ["-tAc",
                          "SELECT (SELECT count(*) FROM users)||' users, '||"
                          "(SELECT count(*) FROM submissions)||' submissions'"])
    counts = check.stdout.strip() if check.returncode == 0 else "(verification query failed)"
    print(f"[restore] done. Restored data: {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
