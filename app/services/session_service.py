"""Session service: program-chair session and slot management."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditLog
from app.models.session import Session
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import InvalidOperation, NotFound, PermissionDenied
from app.schemas.session import (
    SessionCreate,
    SessionUpdate,
    SlotAssign,
)
from app.services.conference_settings import get_conference_settings
from app.services import type_config
from app.services.submission import transition_submission


async def _get_session_with_slots(session_id: uuid.UUID, db: AsyncSession) -> Session | None:
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.slots))
    )
    return result.scalar_one_or_none()


async def _check_overlap(
    db: AsyncSession,
    session_date,
    start_time,
    end_time,
    room: str | None,
    exclude_id: uuid.UUID | None = None,
) -> None:
    """Raise InvalidOperation if another session in the same room overlaps the given time range."""
    if not room:
        return
    q = (
        select(Session)
        .where(
            Session.session_date == session_date,
            Session.room == room,
            Session.start_time < end_time,
            Session.end_time > start_time,
        )
    )
    if exclude_id:
        q = q.where(Session.id != exclude_id)
    result = await db.execute(q)
    conflict = result.scalar_one_or_none()
    if conflict:
        raise InvalidOperation(
            f"Session time conflicts with '{conflict.title}' "
            f"({conflict.start_time.strftime('%H:%M')}–{conflict.end_time.strftime('%H:%M')}) "
            f"in room '{room}'"
        )


async def create_session(payload: SessionCreate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    conf = await get_conference_settings(db)
    if payload.session_type not in type_config.session_type_keys(conf):
        raise InvalidOperation(f"Unknown session type '{payload.session_type}'")
    no_slot_types = type_config.no_slot_session_type_keys(conf)

    max_slots = 0 if payload.session_type in no_slot_types else (payload.max_slots or 10)

    await _check_overlap(db, payload.session_date, payload.start_time, payload.end_time, payload.room)

    data = payload.model_dump()
    data["max_slots"] = max_slots
    session = Session(**data, created_by_id=actor.id)
    db.add(session)
    await db.commit()
    return await _get_session_with_slots(session.id, db)


async def update_session(session_id: uuid.UUID, payload: SessionUpdate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    session = await _get_session_with_slots(session_id, db)
    if not session:
        raise NotFound("Session not found")

    updates = payload.model_dump(exclude_none=True)

    # A parallel-block column's date and start time are owned by the block (all
    # columns start together) — those are changed via the group, not per column.
    # end_time stays editable so each column's duration can differ.
    if session.group_id is not None:
        updates.pop("session_date", None)
        updates.pop("start_time", None)

    # Determine effective date/time/room for overlap check
    check_date = updates.get("session_date", session.session_date)
    check_start = updates.get("start_time", session.start_time)
    check_end = updates.get("end_time", session.end_time)
    check_room = updates.get("room", session.room)

    if any(k in updates for k in ("session_date", "start_time", "end_time", "room")):
        await _check_overlap(db, check_date, check_start, check_end, check_room, exclude_id=session_id)

    # If type changes to a no-slot type, enforce max_slots = 0
    new_type = updates.get("session_type", session.session_type)
    if "session_type" in updates:
        conf = await get_conference_settings(db)
        if new_type not in type_config.session_type_keys(conf):
            raise InvalidOperation(f"Unknown session type '{new_type}'")
        if new_type in type_config.no_slot_session_type_keys(conf):
            updates["max_slots"] = 0

    for field, value in updates.items():
        setattr(session, field, value)
    await db.commit()
    return await _get_session_with_slots(session_id, db)


# Submissions whose status is past 'assigned_to_session' need an explicit outcome
# when their session is deleted (they don't just revert like an assigned slot).
_ADVANCED_STATUSES = (
    SubmissionStatus.NOTIFIED,
    SubmissionStatus.CONFIRMED,
    SubmissionStatus.FILES_SUBMITTED,
)
# The outcomes the user may pick for those advanced submissions.
ADVANCED_DELETE_TARGETS = (SubmissionStatus.DECIDED, SubmissionStatus.WITHDRAWN)


async def get_deletion_impact(session_id: uuid.UUID, actor: User, db: AsyncSession):
    """Preview the effect of deleting a session: how many slots, how many
    submissions auto-revert to 'decided', and which advanced submissions
    (notified/confirmed/files_submitted) need an explicit new status."""
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    from app.schemas.session import AffectedSubmission, SessionDeletionImpact

    session = await _get_session_with_slots(session_id, db)
    if not session:
        raise NotFound("Session not found")

    submission_ids = [slot.submission_id for slot in session.slots if slot.submission_id]
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
            elif sub.status in _ADVANCED_STATUSES:
                advanced.append(AffectedSubmission(
                    id=sub.id,
                    title=sub.title,
                    status=sub.status,
                    presenter_name=sub.presenting_author.full_name if sub.presenting_author else None,
                ))

    return SessionDeletionImpact(
        slot_count=len(session.slots),
        assigned_count=assigned_count,
        advanced=advanced,
    )


async def _revert_submissions_for_session(
    session: Session, actor: User, db: AsyncSession, advanced_status: str, now
) -> None:
    """Free up a session's submissions before the session is deleted.

    Assigned submissions return to 'decided'; submissions past that point
    (notified/confirmed/files_submitted) are forced to ``advanced_status`` and
    the change is audit-logged. Does not commit.
    """
    submission_ids = [slot.submission_id for slot in session.slots if slot.submission_id]
    if not submission_ids:
        return
    result = await db.execute(select(Submission).where(Submission.id.in_(submission_ids)))
    for sub in result.scalars().all():
        if sub.status == SubmissionStatus.ASSIGNED_TO_SESSION:
            sub.status = SubmissionStatus.DECIDED
            sub.updated_at = now
        elif sub.status in _ADVANCED_STATUSES:
            old_status = sub.status
            sub.status = advanced_status
            sub.updated_at = now
            db.add(AuditLog(
                actor_id=actor.id,
                action="session_deleted_status_change",
                target_type="submission",
                target_id=sub.id,
                detail={
                    "from": old_status,
                    "to": advanced_status,
                    "session_id": str(session.id),
                    "session_title": session.title,
                },
            ))


async def delete_session(
    session_id: uuid.UUID,
    actor: User,
    db: AsyncSession,
    advanced_status: str = SubmissionStatus.DECIDED,
) -> None:
    """Delete a session and its slots.

    - Submissions in ASSIGNED_TO_SESSION are returned to 'decided' so they can be
      re-slotted, mirroring remove_slot.
    - Submissions past that point (notified/confirmed/files_submitted) are set to
      ``advanced_status`` (the caller's choice: 'decided' or 'withdrawn'). Each such
      forced change is audit-logged.
    - The slots themselves are removed by the delete-orphan cascade on Session.slots.
    - If the session is the last (or second-last) column of a parallel block, the
      block is dissolved so it never has a single lonely column.
    """
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    if advanced_status not in ADVANCED_DELETE_TARGETS:
        raise InvalidOperation(
            f"advanced_status must be one of: {', '.join(ADVANCED_DELETE_TARGETS)}"
        )

    from datetime import datetime, timezone

    session = await _get_session_with_slots(session_id, db)
    if not session:
        raise NotFound("Session not found")

    group_id = session.group_id
    await _revert_submissions_for_session(session, actor, db, advanced_status, datetime.now(timezone.utc))
    await db.delete(session)
    await db.flush()

    # Auto-dissolve a block that would be left with a single column.
    if group_id is not None:
        await _dissolve_group_if_orphaned(group_id, db)

    await db.commit()


async def _dissolve_group_if_orphaned(group_id: uuid.UUID, db: AsyncSession) -> None:
    """If a parallel block has 1 or 0 remaining columns, unlink them and delete
    the block — a block only makes sense with 2+ columns."""
    from app.models.session_group import SessionGroup

    result = await db.execute(select(Session).where(Session.group_id == group_id))
    remaining = list(result.scalars().all())
    if len(remaining) <= 1:
        for s in remaining:
            s.group_id = None
            s.column_order = 0
        group = await db.get(SessionGroup, group_id)
        if group:
            await db.delete(group)


def _program_session_dict(session: Session, type_display: dict, slot_labels: dict) -> dict:
    slots = sorted(session.slots, key=lambda s: s.slot_order)
    display = type_display.get(session.session_type, {})
    return {
        "id": session.id,
        "title": session.title,
        "description": session.description,
        "session_type": session.session_type,
        "session_type_label": display.get("label", session.session_type),
        "session_type_color": display.get("color", "indigo"),
        "session_type_has_slots": display.get("has_slots", True),
        "session_date": session.session_date,
        "start_time": session.start_time,
        "end_time": session.end_time,
        "room": session.room,
        "chair_name": session.chair_name,
        "slots": [
            {
                "slot_order": slot.slot_order,
                "slot_type": slot.slot_type,
                "slot_type_label": slot_labels.get(slot.slot_type, slot.slot_type),
                "duration_minutes": slot.duration_minutes,
                "abstract_title": slot.submission.title if slot.submission else None,
                "abstract_text": slot.submission.abstract_text if slot.submission else None,
                "presenter_name": slot.submission.presenting_author.full_name if slot.submission else None,
                "presenter_institution": slot.submission.presenting_author.institution if slot.submission else None,
                "board_number": slot.board_number,
                "poster_number": slot.poster_number,
            }
            for slot in slots
        ],
    }


async def get_program(db: AsyncSession) -> list[dict]:
    """Return the published program as time-ordered rows. A normal session is a
    single-column row; a parallel block is a multi-column row (columns ordered
    left-to-right, sharing a start time)."""
    from app.models.session_group import SessionGroup

    result = await db.execute(
        select(Session)
        .where(Session.is_published == True)  # noqa: E712
        .options(
            selectinload(Session.slots)
            .selectinload(SessionSlot.submission)
            .selectinload(Submission.presenting_author)
        )
        .order_by(Session.session_date, Session.start_time, Session.column_order)
    )
    sessions = list(result.scalars().all())

    conf = await get_conference_settings(db)
    type_display = type_config.session_type_display(conf)
    slot_labels = type_config.slot_type_labels(conf)

    # Group titles for parallel blocks.
    group_titles: dict = {}
    group_ids = {s.group_id for s in sessions if s.group_id}
    if group_ids:
        gresult = await db.execute(select(SessionGroup).where(SessionGroup.id.in_(group_ids)))
        group_titles = {g.id: g.title for g in gresult.scalars().all()}

    # Bucket sessions into rows: one row per standalone session, one row per group.
    rows: list[dict] = []
    grouped: dict = {}  # group_id -> row dict
    for session in sessions:
        col = _program_session_dict(session, type_display, slot_labels)
        if session.group_id is None:
            rows.append({
                "session_date": session.session_date,
                "start_time": session.start_time,
                "end_time": session.end_time,
                "is_parallel": False,
                "group_title": None,
                "columns": [col],
            })
        else:
            row = grouped.get(session.group_id)
            if row is None:
                row = {
                    "session_date": session.session_date,
                    "start_time": session.start_time,
                    "end_time": session.end_time,
                    "is_parallel": True,
                    "group_title": group_titles.get(session.group_id),
                    "columns": [],
                }
                grouped[session.group_id] = row
                rows.append(row)
            row["columns"].append(col)
            # The block's overall end is the latest column end.
            if session.end_time > row["end_time"]:
                row["end_time"] = session.end_time

    rows.sort(key=lambda r: (r["session_date"], r["start_time"]))
    return rows


def _minutes_between(a, b) -> int:
    """Whole minutes between two time-of-day values (b - a), same day."""
    from datetime import date as _date, datetime as _dt

    d0 = _date(2000, 1, 1)
    return int((_dt.combine(d0, b) - _dt.combine(d0, a)).total_seconds() // 60)


async def check_program(actor: User, db: AsyncSession):
    """Scan every session, per day, for unscheduled gaps and for time overlaps
    between sessions that are not part of the same parallel block."""
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    from app.schemas.session import ProgramCheckResult, ProgramGap, ProgramOverlap

    result = await db.execute(
        select(Session).order_by(Session.session_date, Session.start_time, Session.end_time)
    )
    sessions = list(result.scalars().all())

    by_day: dict = {}
    for s in sessions:
        by_day.setdefault(s.session_date, []).append(s)

    gaps: list[ProgramGap] = []
    overlaps: list[ProgramOverlap] = []

    for day, day_sessions in by_day.items():
        day_sessions.sort(key=lambda s: (s.start_time, s.end_time))

        # Gaps: merge all session intervals into covered spans, then report the
        # uncovered stretches between them. Overlapping/parallel sessions merge
        # naturally, so a day fully covered by parallel tracks shows no gap.
        merged: list[list] = []
        for s in day_sessions:
            if merged and s.start_time <= merged[-1][1]:
                if s.end_time > merged[-1][1]:
                    merged[-1][1] = s.end_time
            else:
                merged.append([s.start_time, s.end_time])
        for prev, nxt in zip(merged, merged[1:]):
            gaps.append(ProgramGap(
                session_date=day,
                start=prev[1],
                end=nxt[0],
                minutes=_minutes_between(prev[1], nxt[0]),
            ))

        # Overlaps: any pair whose times intersect and that aren't the same block.
        for i in range(len(day_sessions)):
            a = day_sessions[i]
            for b in day_sessions[i + 1:]:
                if b.start_time >= a.end_time:
                    break  # sorted by start; no later session can overlap a
                same_block = a.group_id is not None and a.group_id == b.group_id
                if same_block:
                    continue
                ov_start = b.start_time  # b starts at/after a
                ov_end = min(a.end_time, b.end_time)
                if ov_end <= ov_start:
                    continue
                overlaps.append(ProgramOverlap(
                    session_date=day,
                    session_a_id=a.id,
                    session_a_title=a.title,
                    session_b_id=b.id,
                    session_b_title=b.title,
                    start=ov_start,
                    end=ov_end,
                    minutes=_minutes_between(ov_start, ov_end),
                ))

    gaps.sort(key=lambda g: (g.session_date, g.start))
    overlaps.sort(key=lambda o: (o.session_date, o.start))
    return ProgramCheckResult(
        checked_sessions=len(sessions),
        days_checked=len(by_day),
        gaps=gaps,
        overlaps=overlaps,
    )


async def list_sessions(actor: User, db: AsyncSession) -> list[Session]:
    """All sessions, ordered by date then start time (earliest first)."""
    result = await db.execute(
        select(Session)
        .options(selectinload(Session.slots))
        .order_by(Session.session_date, Session.start_time)
    )
    return list(result.scalars().all())


async def remove_slot(session_id: uuid.UUID, slot_id: uuid.UUID, actor: User, db: AsyncSession) -> Session:
    """Remove a slot from a session.

    Any submission that had advanced through session assignment
    (assigned_to_session, notified, confirmed, or files_submitted) returns to
    'decided' so it can be scheduled again; the revert of an already-notified
    submission is audit-logged.
    """
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(SessionSlot).where(SessionSlot.id == slot_id, SessionSlot.session_id == session_id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFound("Slot not found")

    if slot.submission_id:
        sub_result = await db.execute(select(Submission).where(Submission.id == slot.submission_id))
        sub = sub_result.scalar_one_or_none()
        if sub:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            if sub.status == SubmissionStatus.ASSIGNED_TO_SESSION:
                # Not yet notified — a plain revert.
                sub.status = SubmissionStatus.DECIDED
                sub.updated_at = now
            elif sub.status in _ADVANCED_STATUSES:
                # Notified/confirmed/files: removing the slot un-schedules the
                # submission, so it returns to 'decided' (and becomes assignable
                # again). Otherwise it lingers session-less at an advanced status
                # and can never be re-added. This is a forced status change, so
                # audit-log it — matching the session-delete path.
                old_status = sub.status
                sub.status = SubmissionStatus.DECIDED
                sub.updated_at = now
                db.add(AuditLog(
                    actor_id=actor.id,
                    action="slot_removed_status_change",
                    target_type="submission",
                    target_id=sub.id,
                    detail={
                        "from": old_status,
                        "to": SubmissionStatus.DECIDED,
                        "session_id": str(session_id),
                        "slot_id": str(slot_id),
                    },
                ))

    removed_order = slot.slot_order
    await db.delete(slot)
    await db.flush()

    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(SessionSlot)
        .where(SessionSlot.session_id == session_id, SessionSlot.slot_order > removed_order)
        .values(slot_order=SessionSlot.slot_order - 1)
    )
    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def update_slot(
    session_id: uuid.UUID,
    slot_id: uuid.UUID,
    payload: "SlotUpdate",
    actor: User,
    db: AsyncSession,
) -> Session:
    """Update a slot's order, duration, board_number, or poster_number."""
    from sqlalchemy import update as sa_update
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(SessionSlot).where(SessionSlot.id == slot_id, SessionSlot.session_id == session_id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFound("Slot not found")

    if payload.slot_order is not None and payload.slot_order != slot.slot_order:
        old_order = slot.slot_order
        new_order = payload.slot_order
        if new_order < old_order:
            await db.execute(
                sa_update(SessionSlot)
                .where(
                    SessionSlot.session_id == session_id,
                    SessionSlot.slot_order >= new_order,
                    SessionSlot.slot_order < old_order,
                    SessionSlot.id != slot_id,
                )
                .values(slot_order=SessionSlot.slot_order + 1)
            )
        else:
            await db.execute(
                sa_update(SessionSlot)
                .where(
                    SessionSlot.session_id == session_id,
                    SessionSlot.slot_order > old_order,
                    SessionSlot.slot_order <= new_order,
                    SessionSlot.id != slot_id,
                )
                .values(slot_order=SessionSlot.slot_order - 1)
            )
        slot.slot_order = new_order

    if payload.duration_minutes is not None:
        slot.duration_minutes = payload.duration_minutes
    if payload.board_number is not None:
        slot.board_number = payload.board_number
    if payload.poster_number is not None:
        slot.poster_number = payload.poster_number

    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def assign_submission_to_session(
    session_id: uuid.UUID, payload: SlotAssign, actor: User, db: AsyncSession
) -> SessionSlot:
    """Add a slot to a session.

    - talk/poster slots require a decided submission.
    - qa/discussion slots have no submission.
    - Raises 422 if the session is full, the submission is already assigned,
      or (for talk/poster) the submission is not in 'decided' state.
    """
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.slots))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFound("Session not found")

    conf = await get_conference_settings(db)
    if session.session_type in type_config.no_slot_session_type_keys(conf):
        raise InvalidOperation(f"Cannot add slots to a {session.session_type} session")

    if payload.slot_type not in type_config.slot_type_keys(conf):
        raise InvalidOperation(f"Unknown slot type '{payload.slot_type}'")

    requires_submission = type_config.slot_requires_submission(conf, payload.slot_type)
    if requires_submission and payload.submission_id is None:
        raise InvalidOperation(f"submission_id is required for slot type '{payload.slot_type}'")
    if not requires_submission and payload.submission_id is not None:
        raise InvalidOperation(f"submission_id must be omitted for slot type '{payload.slot_type}'")

    slot_count = await db.scalar(select(func.count()).where(SessionSlot.session_id == session_id))
    if slot_count >= session.max_slots:
        raise InvalidOperation("Session is full")

    if payload.submission_id:
        result = await db.execute(
            select(Submission)
            .where(Submission.id == payload.submission_id)
            .options(selectinload(Submission.decision))
        )
        sub = result.scalar_one_or_none()
        if not sub:
            raise NotFound("Submission not found")
        if sub.status != SubmissionStatus.DECIDED:
            raise InvalidOperation("Submission must be in 'decided' state")
        # A slot may only hold a submission whose decision outcome matches the
        # session's type (e.g. an 'oral' session takes only 'oral'-decided
        # submissions). This also keeps rejected submissions out of every session.
        outcome = sub.decision.outcome if sub.decision else None
        if outcome != session.session_type:
            raise InvalidOperation(
                f"Submission decided '{outcome or 'none'}' cannot be assigned to a "
                f"'{session.session_type}' session"
            )

        existing = await db.execute(
            select(SessionSlot).where(SessionSlot.submission_id == payload.submission_id)
        )
        if existing.scalar_one_or_none():
            raise InvalidOperation("Submission is already assigned to a session")

    from sqlalchemy import update as sa_update
    await db.execute(
        sa_update(SessionSlot)
        .where(SessionSlot.session_id == session_id, SessionSlot.slot_order >= payload.slot_order)
        .values(slot_order=SessionSlot.slot_order + 1)
    )

    slot = SessionSlot(
        session_id=session_id,
        submission_id=payload.submission_id,
        slot_type=payload.slot_type,
        slot_order=payload.slot_order,
        duration_minutes=payload.duration_minutes,
        board_number=payload.board_number,
        poster_number=payload.poster_number,
    )
    db.add(slot)
    await db.flush()

    if payload.submission_id:
        await transition_submission(payload.submission_id, SubmissionStatus.ASSIGNED_TO_SESSION, actor, db)
    else:
        await db.commit()

    await db.refresh(slot)
    return slot
