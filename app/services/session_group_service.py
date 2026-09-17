"""Parallel-session-block service: create/manage blocks of concurrent sessions.

A block (SessionGroup) owns the shared date + start time; each member session is
a normal, fully-featured Session (its own title, type, room, chair, slots) that
starts with the block but keeps its own end time so durations can differ.
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.errors import InvalidOperation, NotFound, PermissionDenied
from app.models.session import Session
from app.models.session_group import SessionGroup
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.permissions import can_view_all
from app.schemas.session import (
    AddColumnRequest,
    ParallelBlockCreate,
    SessionGroupRead,
    SessionGroupSummary,
    SessionGroupUpdate,
)
from app.services import type_config
from app.services.conference_settings import get_conference_settings
from app.services.session_service import (
    ADVANCED_DELETE_TARGETS,
    _check_overlap,
    _revert_submissions_for_session,
)


def _require_chair(actor: User) -> None:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")


def _require_view(actor: User) -> None:
    """Read guard: chairs, admins, and Admin Viewers may view parallel blocks."""
    if not can_view_all(actor):
        raise PermissionDenied("Insufficient permissions")


def _add_minutes(start: time, minutes: int) -> time:
    """Add minutes to a time-of-day (clamped within the same day)."""
    base = datetime.combine(date(2000, 1, 1), start) + timedelta(minutes=minutes)
    # Clamp so a duration can't roll past midnight into the next day.
    if base.date() != date(2000, 1, 1):
        return time(23, 59)
    return base.time()


def _default_max_slots(conf, session_type: str) -> int:
    return 0 if session_type in type_config.no_slot_session_type_keys(conf) else 10


async def _load_group(group_id: uuid.UUID, db: AsyncSession) -> SessionGroup | None:
    result = await db.execute(
        select(SessionGroup)
        .where(SessionGroup.id == group_id)
        .options(selectinload(SessionGroup.sessions).selectinload(Session.slots))
        # Refresh collections even if this group is already in the identity map
        # (e.g. re-loading after add_column in the same request).
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


def _to_read(group: SessionGroup) -> SessionGroupRead:
    columns = sorted(group.sessions, key=lambda s: s.column_order)
    end_time = max((s.end_time for s in columns), default=None)
    return SessionGroupRead.model_validate({
        "id": group.id,
        "title": group.title,
        "session_date": group.session_date,
        "start_time": group.start_time,
        "end_time": end_time,
        "is_published": group.is_published,
        "created_at": group.created_at,
        "updated_at": group.updated_at,
        "columns": columns,
    })


async def create_parallel_block(
    payload: ParallelBlockCreate, actor: User, db: AsyncSession
) -> SessionGroupRead:
    _require_chair(actor)
    conf = await get_conference_settings(db)
    if payload.session_type not in type_config.session_type_keys(conf):
        raise InvalidOperation(f"Unknown session type '{payload.session_type}'")

    end_time = _add_minutes(payload.start_time, payload.default_duration_minutes)
    if end_time <= payload.start_time:
        raise InvalidOperation("default_duration_minutes is too short")

    group = SessionGroup(
        title=payload.title,
        session_date=payload.session_date,
        start_time=payload.start_time,
        is_published=False,
        created_by_id=actor.id,
    )
    db.add(group)
    await db.flush()

    max_slots = _default_max_slots(conf, payload.session_type)
    for i in range(payload.count):
        db.add(Session(
            title=f"Track {i + 1}",
            session_type=payload.session_type,
            session_date=payload.session_date,
            start_time=payload.start_time,
            end_time=end_time,
            max_slots=max_slots,
            is_published=False,
            group_id=group.id,
            column_order=i,
            created_by_id=actor.id,
        ))
    await db.commit()
    return _to_read(await _load_group(group.id, db))


async def get_group(group_id: uuid.UUID, actor: User, db: AsyncSession) -> SessionGroupRead:
    _require_view(actor)
    group = await _load_group(group_id, db)
    if not group:
        raise NotFound("Parallel block not found")
    return _to_read(group)


async def list_groups(actor: User, db: AsyncSession) -> list[SessionGroupSummary]:
    _require_view(actor)
    result = await db.execute(
        select(SessionGroup)
        .options(selectinload(SessionGroup.sessions))
        .order_by(SessionGroup.session_date, SessionGroup.start_time)
    )
    summaries = []
    for group in result.scalars().all():
        end_time = max((s.end_time for s in group.sessions), default=None)
        summaries.append(SessionGroupSummary(
            id=group.id,
            title=group.title,
            session_date=group.session_date,
            start_time=group.start_time,
            end_time=end_time,
            is_published=group.is_published,
            column_count=len(group.sessions),
        ))
    return summaries


async def update_group(
    group_id: uuid.UUID, payload: SessionGroupUpdate, actor: User, db: AsyncSession
) -> SessionGroupRead:
    _require_chair(actor)
    group = await _load_group(group_id, db)
    if not group:
        raise NotFound("Parallel block not found")

    updates = payload.model_dump(exclude_none=True)
    columns = list(group.sessions)

    new_date = updates.get("session_date", group.session_date)
    new_start = updates.get("start_time", group.start_time)
    date_or_time_changed = "session_date" in updates or "start_time" in updates

    # Moving the block's start shifts every column's end by the same delta so each
    # column keeps its own duration.
    delta_min = 0
    if "start_time" in updates:
        d0 = date(2000, 1, 1)
        delta_min = int(
            (datetime.combine(d0, new_start) - datetime.combine(d0, group.start_time)).total_seconds() // 60
        )

    if date_or_time_changed:
        # Re-validate room overlaps for each column at its new date/time before applying.
        for col in columns:
            col_end = _add_minutes(col.end_time, delta_min) if delta_min else col.end_time
            await _check_overlap(db, new_date, new_start, col_end, col.room, exclude_id=col.id)

    if "title" in updates:
        group.title = updates["title"]
    if date_or_time_changed:
        group.session_date = new_date
        group.start_time = new_start
        for col in columns:
            col.session_date = new_date
            col.start_time = new_start
            if delta_min:
                col.end_time = _add_minutes(col.end_time, delta_min)
    if "is_published" in updates:
        group.is_published = updates["is_published"]
        for col in columns:
            col.is_published = updates["is_published"]

    group.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return _to_read(await _load_group(group_id, db))


async def add_column(
    group_id: uuid.UUID, payload: AddColumnRequest, actor: User, db: AsyncSession
) -> SessionGroupRead:
    _require_chair(actor)
    group = await _load_group(group_id, db)
    if not group:
        raise NotFound("Parallel block not found")

    conf = await get_conference_settings(db)
    columns = sorted(group.sessions, key=lambda s: s.column_order)
    session_type = payload.session_type or (columns[0].session_type if columns else "oral")
    if session_type not in type_config.session_type_keys(conf):
        raise InvalidOperation(f"Unknown session type '{session_type}'")

    duration = payload.duration_minutes or 60
    end_time = _add_minutes(group.start_time, duration)
    next_order = (max((c.column_order for c in columns), default=-1)) + 1

    db.add(Session(
        title=payload.title or f"Track {len(columns) + 1}",
        session_type=session_type,
        session_date=group.session_date,
        start_time=group.start_time,
        end_time=end_time,
        max_slots=_default_max_slots(conf, session_type),
        is_published=group.is_published,
        group_id=group.id,
        column_order=next_order,
        created_by_id=actor.id,
    ))
    await db.commit()
    return _to_read(await _load_group(group_id, db))


async def get_group_deletion_impact(group_id: uuid.UUID, actor: User, db: AsyncSession):
    """Aggregate deletion impact across every column of the block."""
    _require_view(actor)
    from app.schemas.session import AffectedSubmission, SessionDeletionImpact

    group = await _load_group(group_id, db)
    if not group:
        raise NotFound("Parallel block not found")

    submission_ids = [
        slot.submission_id
        for col in group.sessions
        for slot in col.slots
        if slot.submission_id
    ]
    slot_count = sum(len(col.slots) for col in group.sessions)
    assigned_count = 0
    advanced: list = []
    if submission_ids:
        result = await db.execute(
            select(Submission)
            .where(Submission.id.in_(submission_ids))
            .options(selectinload(Submission.presenting_author))
        )
        for sub in result.scalars().all():
            if sub.status == SubmissionStatus.ASSIGNED_TO_SESSION:
                assigned_count += 1
            elif sub.status in (
                SubmissionStatus.NOTIFIED,
                SubmissionStatus.CONFIRMED,
                SubmissionStatus.FILES_SUBMITTED,
            ):
                advanced.append(AffectedSubmission(
                    id=sub.id,
                    title=sub.title,
                    status=sub.status,
                    presenter_name=sub.presenting_author.full_name if sub.presenting_author else None,
                ))

    return SessionDeletionImpact(
        slot_count=slot_count,
        assigned_count=assigned_count,
        advanced=advanced,
    )


async def delete_group(
    group_id: uuid.UUID,
    actor: User,
    db: AsyncSession,
    advanced_status: str = SubmissionStatus.DECIDED,
) -> None:
    """Delete an entire parallel block: every column session (freeing its
    submissions per advanced_status) and the block itself."""
    _require_chair(actor)
    if advanced_status not in ADVANCED_DELETE_TARGETS:
        raise InvalidOperation(
            f"advanced_status must be one of: {', '.join(ADVANCED_DELETE_TARGETS)}"
        )

    group = await _load_group(group_id, db)
    if not group:
        raise NotFound("Parallel block not found")

    now = datetime.now(timezone.utc)
    for col in list(group.sessions):
        await _revert_submissions_for_session(col, actor, db, advanced_status, now)
        await db.delete(col)
    await db.delete(group)
    await db.commit()
