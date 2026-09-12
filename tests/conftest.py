"""Shared fixtures for the test suite.

Uses an in-process SQLite database (via aiosqlite) so tests run without
a live PostgreSQL instance. JSONB/UUID columns are mapped to their
SQLite equivalents by SQLAlchemy automatically when using the ORM.
"""
import asyncio
import os
import uuid

# Set required env vars before any app modules are imported so pydantic-settings
# doesn't fail. These are all fake — no real services are contacted in tests.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production")
os.environ.setdefault("POSTMARK_API_TOKEN", "test-postmark-token")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ENDPOINT_URL", "https://s3.test.local")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-access-key")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret-key")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("RATELIMIT_ENABLED", "0")
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base, get_db
from app.dependencies.auth import create_access_token
from app.models.user import User, UserRole
from app.services.auth import hash_password

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    from app.main import create_app

    app = create_app()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── User factories ──────────────────────────────────────────────────────────

def _make_user(role: str, **kwargs) -> User:
    defaults = {
        "id": uuid.uuid4(),
        "username": f"{role}_{uuid.uuid4().hex[:8]}",
        "email": f"{role}_{uuid.uuid4().hex[:6]}@test.com",
        "full_name": f"Test {role.title()}",
        "password_hash": hash_password("password123"),
        "role": role,
        "email_verified": True,
    }
    defaults.update(kwargs)
    return User(**defaults)


@pytest_asyncio.fixture
async def submitter(db: AsyncSession) -> User:
    user = _make_user(UserRole.SUBMITTER)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def reviewer(db: AsyncSession) -> User:
    user = _make_user(UserRole.REVIEWER)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin(db: AsyncSession) -> User:
    user = _make_user(UserRole.ADMIN)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest_asyncio.fixture
async def program_chair(db: AsyncSession) -> User:
    user = _make_user(UserRole.PROGRAM_CHAIR)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def auth_header(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
