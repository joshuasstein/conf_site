import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    institution: str | None = None
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be at most 50 characters")
        if not re.fullmatch(r"[A-Za-z0-9_\-\.]+", v):
            raise ValueError("Username may only contain letters, numbers, underscores, hyphens, and dots")
        return v

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    username: str
    email: str
    full_name: str
    institution: str | None
    role: str
    email_verified: bool
    created_at: datetime


class UserUpdate(BaseModel):
    full_name: str | None = None
    institution: str | None = None


class AdminUserUpdate(BaseModel):
    username: str | None = None
    role: str | None = None
    email_verified: bool | None = None
