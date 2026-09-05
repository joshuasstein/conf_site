from functools import lru_cache

from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: str

    postmark_api_token: str
    postmark_message_stream: str = "outbound"

    s3_bucket_name: str
    s3_endpoint_url: str
    s3_access_key_id: str
    s3_secret_access_key: str
    s3_region: str = "auto"

    # Deadlines are managed in the database via ConferenceSettings, not here.

    frontend_url: AnyHttpUrl

    # JWT
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Rate limiting
    rate_limit_login: str = "5/minute"

    # Presigned URL expiry
    presigned_url_expiry_seconds: int = 1800  # 30 min

    # Email batch size
    email_batch_size: int = 50

    # Email worker poll interval
    email_worker_interval_seconds: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
