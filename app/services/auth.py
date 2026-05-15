"""Auth service: registration, login, email verification, token refresh."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import create_access_token, create_refresh_token
from app.models.email_job import EmailJob, EmailTemplate
from app.models.user import User
from app.schemas.user import UserCreate

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


async def register_user(payload: UserCreate, db: AsyncSession) -> User:
    """Create a new user and queue a verification email. Raises 409 if email taken."""
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        institution=payload.institution,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()

    # Queue verification email
    from app.dependencies.auth import create_access_token as _tok
    import uuid as _uuid
    from app.config import get_settings
    settings = get_settings()
    verify_token = create_access_token(user.id)
    db.add(EmailJob(
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_alias=EmailTemplate.EMAIL_VERIFICATION,
        template_model={
            "full_name": user.full_name,
            "verify_url": f"{settings.frontend_url}verify-email?token={verify_token}",
        },
    ))

    await db.commit()
    await db.refresh(user)
    return user


async def login_user(email: str, password: str, db: AsyncSession) -> tuple[str, str]:
    """Authenticate and return (access_token, refresh_token). Raises 401 on failure."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    return create_access_token(user.id), create_refresh_token(user.id)


async def verify_email(token: str, db: AsyncSession) -> User:
    """Mark the user's email as verified. Raises 400 if already verified."""
    from app.dependencies.auth import _decode_token
    user_id = _decode_token(token, "access")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")
    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already verified")
    user.email_verified = True
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user
