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
from app.dependencies.auth import generate_reset_otp, get_current_user, require_admin, require_program_chair, verify_reset_otp
from app.models.audit_log import AuditLog
from app.models.email_job import EmailJob, EmailTemplate
from app.models.email_template import EmailTemplateRecord
from app.models.decision import Decision
from app.models.review import Review
from app.models.session import Session
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.admin import (
    AuditLogRead,
    BulkNotifyRequest,
    BulkNotifyResponse,
    ConferenceSettingsRead,
    ConferenceSettingsUpdate,
    EmailTemplateRead,
    EmailTemplateUpdate,
    ResetOTPResponse,
    ResetRequest,
)
from app.schemas.submission import SubmissionRead, SubmissionStatusOverride
from app.schemas.user import AdminUserUpdate, UserRead
from app.errors import InvalidOperation, NotFound
from app.services.conference_settings import get_conference_settings, update_conference_settings
from app.services.notifications import bulk_notify_decisions
from app.services.submission import transition_submission

router = APIRouter(prefix="/admin", tags=["admin"])

AdminUser = Annotated[User, Depends(require_admin)]
# Admins and program chairs (used for actions chairs share, e.g. bulk notify).
ChairUser = Annotated[User, Depends(require_program_chair)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/users", response_model=list[UserRead])
async def list_users(current_user: AdminUser, db: DB):
    result = await db.execute(select(User))
    return list(result.scalars().all())


@router.get("/reviewers", response_model=list[UserRead])
async def list_reviewers(current_user: ChairUser, db: DB):
    """Accounts eligible to be assigned as reviewers — anyone granted the reviewer
    privilege (is_reviewer), plus program chairs and admins. Available to admins and
    program chairs (unlike the full user list, which is admin-only)."""
    result = await db.execute(
        select(User)
        .where(
            (User.is_reviewer.is_(True))
            | (User.role.in_([UserRole.REVIEWER, UserRole.PROGRAM_CHAIR, UserRole.ADMIN]))
        )
        .order_by(User.full_name)
    )
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
async def bulk_notify(payload: BulkNotifyRequest, current_user: ChairUser, db: DB):
    return await bulk_notify_decisions(current_user, db, dry_run=payload.dry_run)


@router.get("/conference-settings", response_model=ConferenceSettingsRead)
async def get_settings(current_user: AdminUser, db: DB):
    return await get_conference_settings(db)


@router.patch("/conference-settings", response_model=ConferenceSettingsRead)
async def patch_settings(payload: ConferenceSettingsUpdate, current_user: AdminUser, db: DB):
    updates = payload.model_dump(exclude_none=True)
    if "session_types" in updates:
        await _guard_type_removal(
            db, Session.session_type, {t["key"] for t in updates["session_types"]}, "session type"
        )
    if "slot_types" in updates:
        await _guard_type_removal(
            db, SessionSlot.slot_type, {t["key"] for t in updates["slot_types"]}, "slot type"
        )
    if "decision_outcomes" in updates:
        await _guard_type_removal(
            db, Decision.outcome, {o["key"] for o in updates["decision_outcomes"]}, "decision outcome"
        )
    return await update_conference_settings(db, **updates)


async def _guard_type_removal(db: DB, column, new_keys: set[str], label: str) -> None:
    """Reject dropping a type key that existing sessions/slots still reference."""
    result = await db.execute(select(column).distinct())
    in_use = {v for (v,) in result.all() if v is not None}
    removed = in_use - new_keys
    if removed:
        raise InvalidOperation(
            f"Cannot remove {label}(s) still in use: {', '.join(sorted(removed))}"
        )


@router.post("/reset/request-otp", response_model=ResetOTPResponse)
async def request_reset_otp(current_user: AdminUser, db: DB) -> ResetOTPResponse:
    """Send a one-time code to the admin's email. Required before calling /reset."""
    otp_code, otp_token = generate_reset_otp()
    db.add(EmailJob(
        recipient_email=current_user.email,
        recipient_name=current_user.full_name,
        template_alias=EmailTemplate.RESET_OTP,
        template_model={"full_name": current_user.full_name, "otp_code": otp_code},
        created_by_id=current_user.id,
    ))
    await db.commit()
    return ResetOTPResponse(otp_token=otp_token)


@router.post("/reset", status_code=204)
async def reset_all_data(payload: ResetRequest, current_user: AdminUser, db: DB) -> None:
    """Delete all data and R2 objects. Requires a valid OTP from /reset/request-otp."""
    import asyncio
    import logging
    from sqlalchemy import text
    from app.services.files import _s3_client
    from app.config import get_settings

    verify_reset_otp(payload.otp_token, payload.otp_code)

    # Delete DB rows first (atomic, important) — preserve the calling admin
    for stmt in [
        text("DELETE FROM reviews"),
        text("DELETE FROM session_slots"),
        text("DELETE FROM decisions"),
        text("DELETE FROM attachments"),
        text("DELETE FROM audit_logs"),
        text("DELETE FROM email_jobs"),
        text("DELETE FROM submissions"),
        text("DELETE FROM sessions"),
        text("DELETE FROM users WHERE id != :admin_id"),
    ]:
        await db.execute(stmt, {"admin_id": current_user.id})
    await db.commit()

    # Delete R2 objects best-effort — run synchronous boto3 in a thread.
    # Scope to the "submissions/" prefix (where uploads live) so this can never
    # delete anything else in the bucket — e.g. backups stored under another prefix.
    def _delete_all_s3_objects() -> None:
        settings = get_settings()
        s3 = _s3_client()
        kwargs: dict = {"Bucket": settings.s3_bucket_name, "Prefix": "submissions/"}
        while True:
            resp = s3.list_objects_v2(**kwargs)
            objects = resp.get("Contents", [])
            if objects:
                s3.delete_objects(
                    Bucket=settings.s3_bucket_name,
                    Delete={"Objects": [{"Key": o["Key"]} for o in objects]},
                )
            if not resp.get("IsTruncated"):
                break
            kwargs["ContinuationToken"] = resp["NextContinuationToken"]

    try:
        await asyncio.get_event_loop().run_in_executor(None, _delete_all_s3_objects)
    except Exception:
        logging.getLogger(__name__).exception("R2 cleanup failed after reset — manual deletion may be required")


@router.get("/presenters.csv")
async def presenter_list_csv(current_user: ChairUser, db: DB):
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


@router.get("/email-templates", response_model=list[EmailTemplateRead])
async def list_email_templates(current_user: AdminUser, db: DB):
    result = await db.execute(select(EmailTemplateRecord).order_by(EmailTemplateRecord.alias))
    return list(result.scalars().all())


@router.put("/email-templates/{alias}", response_model=EmailTemplateRead)
async def update_email_template(
    alias: str, payload: EmailTemplateUpdate, current_user: AdminUser, db: DB
):
    from datetime import datetime, timezone

    result = await db.execute(
        select(EmailTemplateRecord).where(EmailTemplateRecord.alias == alias)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise NotFound("Email template not found")
    record.subject = payload.subject
    record.html = payload.html
    record.text = payload.text
    record.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record
