from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Also returned in the body so browsers that block the cross-site refresh
    # cookie (Safari, third-party cookie blocking) can persist it client-side.
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    # Optional: the refresh token may instead arrive via the refresh_token cookie.
    refresh_token: str | None = None


class VerifyEmailRequest(BaseModel):
    token: str


class MessageResponse(BaseModel):
    message: str


class ForgotUsernameRequest(BaseModel):
    email: str


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
