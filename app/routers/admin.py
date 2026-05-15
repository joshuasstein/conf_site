import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user, require_admin
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.admin import AuditLogRead, BulkNotifyRequest, BulkNotifyResponse
from app.schemas.submission import SubmissionRead, SubmissionStatusOverride
from app.schemas.user import AdminUserUpdate, UserRead
from app.services.notifications import bulk_notify_decisions
from app.services.submission import get_submission_or_404, transition_submission

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(require_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/users", response_model=list[UserRead])
async def list_users(current_user: AdminUser, db: DB):
    result = await db.execute(select(User))
    return list(result.scalars().all())


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, current_user: AdminUser, db: DB):
    from fastapi import HTTPException, status
    from datetime import datetime, timezone
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/submissions/{submission_id}/status", response_model=SubmissionRead)
async def override_status(
    submission_id: uuid.UUID,
    payload: SubmissionStatusOverride,
    current_user: AdminUser,
    db: DB,
):
    return await transition_submission(
        submission_id,
        payload.status,
        current_user,
        db,
        admin_override=True,
        override_reason=payload.reason,
    )


@router.get("/audit-log", response_model=list[AuditLogRead])
async def audit_log(current_user: AdminUser, db: DB, skip: int = 0, limit: int = 100):
    result = await db.execute(
        select(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.post("/notifications/bulk-notify", response_model=BulkNotifyResponse)
async def bulk_notify(payload: BulkNotifyRequest, current_user: AdminUser, db: DB):
    return await bulk_notify_decisions(current_user, db, dry_run=payload.dry_run)
