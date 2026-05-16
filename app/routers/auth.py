from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies.auth import create_access_token, create_refresh_token, get_current_user, get_current_user_from_refresh
from app.models.user import User
from app.schemas.auth import LoginRequest, MessageResponse, TokenResponse, VerifyEmailRequest
from app.schemas.user import UserCreate, UserRead
from app.services.auth import login_user, register_user, verify_email

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=201)
async def register(payload: UserCreate, db: Annotated[AsyncSession, Depends(get_db)]) -> User:
    return await register_user(payload, db)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, response: Response, db: Annotated[AsyncSession, Depends(get_db)]) -> TokenResponse:
    access_token, refresh_token = await login_user(payload.email, payload.password, db)
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
