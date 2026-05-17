"""Auth service: registration, login, email verification, token refresh."""
import uuid
from datetime import datetime, timezone

from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies.auth import create_access_token, create_password_reset_token, create_refresh_token, create_verification_token
from app.errors import Conflict, InvalidOperation, NotFound, Unauthorized
from app.models.email_job import EmailJob, EmailTemplate
from app.models.user import User
from app.schemas.user import UserCreate

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


async def register_user(payload: UserCreate, db: AsyncSession) -> User:
    """Create a new user and queue a verification email. Raises 409 if username taken."""
    result = await db.execute(select(User).where(User.username == payload.username))
    if result.scalar_one_or_none():
        raise Conflict("Username already taken")

    user = User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        institution=payload.institution,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()

    # Queue verification email
    from app.config import get_settings
    settings = get_settings()
    verify_token = create_verification_token(user.id)
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


async def login_user(username: str, password: str, db: AsyncSession) -> tuple[str, str]:
    """Authenticate and return (access_token, refresh_token). Raises 401 on failure."""
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise Unauthorized("Invalid credentials")
    return create_access_token(user.id), create_refresh_token(user.id)


async def verify_email(token: str, db: AsyncSession) -> User:
    """Mark the user's email as verified. Raises 400 if already verified."""
    from app.dependencies.auth import _decode_token
    user_id = _decode_token(token, "verify")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise InvalidOperation("Invalid token")
    if user.email_verified:
        raise InvalidOperation("Email already verified")
    user.email_verified = True
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


async def resend_verification_email(user: User, db: AsyncSession) -> None:
    """Queue a fresh verification email. Raises if already verified."""
    if user.email_verified:
        raise InvalidOperation("Email is already verified")
    from app.config import get_settings
    settings = get_settings()
    verify_token = create_verification_token(user.id)
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


async def forgot_username(email: str, db: AsyncSession) -> None:
    """Queue a username-reminder email if any accounts exist for this email. Always silent."""
    from app.config import get_settings
    result = await db.execute(select(User).where(User.email == email))
    users = result.scalars().all()
    if not users:
        return
    usernames_html = "".join(f"<li><strong>{u.username}</strong></li>" for u in users)
    usernames_plain = "\n".join(f"  - {u.username}" for u in users)
    db.add(EmailJob(
        recipient_email=email,
        recipient_name=users[0].full_name,
        template_alias=EmailTemplate.USERNAME_REMINDER,
        template_model={
            "full_name": users[0].full_name,
            "usernames_html": f"<ul>{usernames_html}</ul>",
            "usernames_plain": usernames_plain,
        },
    ))
    await db.commit()


async def forgot_password(username: str, db: AsyncSession) -> None:
    """Queue a password-reset email for the given username. Always silent."""
    from app.config import get_settings
    settings = get_settings()
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        return
    reset_token = create_password_reset_token(user.id)
    db.add(EmailJob(
        recipient_email=user.email,
        recipient_name=user.full_name,
        template_alias=EmailTemplate.PASSWORD_RESET,
        template_model={
            "full_name": user.full_name,
            "username": user.username,
            "reset_url": f"{settings.frontend_url}reset-password?token={reset_token}",
        },
    ))
    await db.commit()


async def reset_password(token: str, new_password: str, db: AsyncSession) -> None:
    """Set a new password using a password-reset token. Raises on invalid/expired token."""
    from app.dependencies.auth import _decode_token
    if len(new_password) < 8:
        raise InvalidOperation("Password must be at least 8 characters")
    user_id = _decode_token(token, "password-reset")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise InvalidOperation("Invalid token")
    user.password_hash = hash_password(new_password)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
