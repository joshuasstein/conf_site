import csv
import io
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies.auth import get_current_user, require_admin
from app.models.audit_log import AuditLog
from app.models.review import Review
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User
from app.schemas.admin import (
    AuditLogRead,
    BulkNotifyRequest,
    BulkNotifyResponse,
    ConferenceSettingsRead,
    ConferenceSettingsUpdate,
)
from app.schemas.submission import SubmissionRead, SubmissionStatusOverride
from app.schemas.user import AdminUserUpdate, UserRead
from app.errors import InvalidOperation, NotFound
from app.services.conference_settings import get_conference_settings, update_conference_settings
from app.services.notifications import bulk_notify_decisions
from app.services.submission import transition_submission

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(require_admin)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/users", response_model=list[UserRead])
async def list_users(current_user: AdminUser, db: DB):
    result = await db.execute(select(User))
    return list(result.scalars().all())


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(user_id: uuid.UUID, payload: AdminUserUpdate, current_user: AdminUser, db: DB):
    from datetime import datetime, timezone
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFound("User not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: uuid.UUID, current_user: AdminUser, db: DB) -> None:
    if user_id == current_user.id:
        raise InvalidOperation("You cannot delete your own account")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFound("User not found")

    # Block if the user has any submissions — deleting them would destroy academic records
    sub_result = await db.execute(select(Submission).where(Submission.presenting_author_id == user_id).limit(1))
    if sub_result.scalar_one_or_none():
        raise InvalidOperation("Cannot delete a user who has submissions. Delete their abstracts first.")

    # Block if the user has submitted reviews — those are part of the programme record
    submitted_review = await db.execute(
        select(Review).where(Review.reviewer_id == user_id, Review.submitted_at.isnot(None)).limit(1)
    )
    if submitted_review.scalar_one_or_none():
        raise InvalidOperation("Cannot delete a user who has submitted reviews.")

    # Remove unsubmitted review assignments (pending reviewer assignments, no academic data lost)
    pending_reviews = await db.execute(
        select(Review).where(Review.reviewer_id == user_id, Review.submitted_at.is_(None))
    )
    for review in pending_reviews.scalars().all():
        await db.delete(review)

    await db.delete(user)
    await db.commit()


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


@router.get("/conference-settings", response_model=ConferenceSettingsRead)
async def get_settings(current_user: AdminUser, db: DB):
    return await get_conference_settings(db)


@router.patch("/conference-settings", response_model=ConferenceSettingsRead)
async def patch_settings(payload: ConferenceSettingsUpdate, current_user: AdminUser, db: DB):
    return await update_conference_settings(db, **payload.model_dump(exclude_none=True))


@router.get("/presenters.csv")
async def presenter_list_csv(current_user: AdminUser, db: DB):
    """CSV of all presenters for confirmed or files_submitted abstracts."""
    result = await db.execute(
        select(Submission)
        .where(Submission.status.in_([SubmissionStatus.CONFIRMED, SubmissionStatus.FILES_SUBMITTED]))
        .options(selectinload(Submission.presenting_author))
        .order_by(Submission.title)
    )
    submissions = list(result.scalars().all())

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["abstract_title", "presenter_name", "presenter_email", "presenter_institution", "status"])
    for sub in submissions:
        author = sub.presenting_author
        writer.writerow([
            sub.title,
            author.full_name,
            author.email,
            author.institution or "",
            sub.status,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=presenters.csv"},
    )
