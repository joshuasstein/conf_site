from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import create_access_token, create_refresh_token, get_current_user, get_current_user_from_refresh, require_role
from app.limiter import limiter
from app.models.user import User
from app.schemas.auth import ForgotPasswordRequest, ForgotUsernameRequest, LoginRequest, MessageResponse, ResetPasswordRequest, TokenResponse, VerifyEmailRequest
from app.schemas.user import UserCreate, UserRead
from app.services.auth import forgot_password, forgot_username, login_user, register_user, reset_password, resend_verification_email, verify_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=201)
@limiter.limit("3/minute")
async def register(request: Request, payload: UserCreate, db: Annotated[AsyncSession, Depends(get_db)]) -> User:
    return await register_user(payload, db)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, payload: LoginRequest, response: Response, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    access_token, refresh_token = await login_user(payload.username, payload.password, db)
    settings = get_settings()
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.refresh_token_expire_days * 86400,
        path="/api/v1/auth",
    )
    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(current_user: Annotated[User, Depends(get_current_user_from_refresh)]) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(current_user.id))


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response) -> MessageResponse:
    response.delete_cookie("refresh_token", path="/api/v1/auth")
    return MessageResponse(message="Logged out")


@router.get("/me", response_model=UserRead)
async def me(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    return current_user


@router.post("/verify-email", response_model=MessageResponse)
async def verify(payload: VerifyEmailRequest, db: Annotated[AsyncSession, Depends(get_db)]) -> MessageResponse:
    await verify_email(payload.token, db)
    return MessageResponse(message="Email verified")


@router.post("/resend-verification", response_model=MessageResponse)
@limiter.limit("3/minute")
async def resend_verification(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    await resend_verification_email(current_user, db)
    return MessageResponse(message="Verification email sent")


@router.post("/forgot-username", response_model=MessageResponse)
@limiter.limit("3/minute")
async def forgot_username_endpoint(
    request: Request,
    payload: ForgotUsernameRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    await forgot_username(payload.email, db)
    return MessageResponse(message="If an account exists for that email, you will receive a reminder shortly.")


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("3/minute")
async def forgot_password_endpoint(
    request: Request,
    payload: ForgotPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    await forgot_password(payload.username, db)
    return MessageResponse(message="If that username exists, a reset link has been sent to the associated email.")


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def reset_password_endpoint(
    request: Request,
    payload: ResetPasswordRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MessageResponse:
    await reset_password(payload.token, payload.new_password, db)
    return MessageResponse(message="Password updated. You can now sign in with your new password.")
