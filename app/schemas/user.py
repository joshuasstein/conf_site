import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    institution: str | None = None
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
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
    role: str | None = None
    email_verified: bool | None = None
