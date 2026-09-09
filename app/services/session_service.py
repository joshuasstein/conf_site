"""Session service: program-chair session and slot management."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.session import Session
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.errors import InvalidOperation, NotFound, PermissionDenied
from app.schemas.session import (
    NO_SLOT_SESSION_TYPES,
    SessionCreate,
    SessionUpdate,
    SlotAssign,
)
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

    max_slots = 0 if payload.session_type in NO_SLOT_SESSION_TYPES else (payload.max_slots or 10)

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

    # Determine effective date/time/room for overlap check
    check_date = updates.get("session_date", session.session_date)
    check_start = updates.get("start_time", session.start_time)
    check_end = updates.get("end_time", session.end_time)
    check_room = updates.get("room", session.room)

    if any(k in updates for k in ("session_date", "start_time", "end_time", "room")):
        await _check_overlap(db, check_date, check_start, check_end, check_room, exclude_id=session_id)

    # If type changes to a no-slot type, enforce max_slots = 0
    new_type = updates.get("session_type", session.session_type)
    if new_type in NO_SLOT_SESSION_TYPES:
        updates["max_slots"] = 0

    for field, value in updates.items():
        setattr(session, field, value)
    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def get_program(db: AsyncSession) -> list[dict]:
    """Return published sessions with slot details for the public program page."""
    result = await db.execute(
        select(Session)
        .where(Session.is_published == True)  # noqa: E712
        .options(
            selectinload(Session.slots)
            .selectinload(SessionSlot.submission)
            .selectinload(Submission.presenting_author)
        )
        .order_by(Session.session_date, Session.start_time)
    )
    sessions = list(result.scalars().all())

    program = []
    for session in sessions:
        slots = sorted(session.slots, key=lambda s: s.slot_order)
        program.append({
            "id": session.id,
            "title": session.title,
            "description": session.description,
            "session_type": session.session_type,
            "session_date": session.session_date,
            "start_time": session.start_time,
            "end_time": session.end_time,
            "room": session.room,
            "chair_name": session.chair_name,
            "slots": [
                {
                    "slot_order": slot.slot_order,
                    "slot_type": slot.slot_type,
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
        })
    return program


async def list_sessions(actor: User, db: AsyncSession) -> list[Session]:
    result = await db.execute(select(Session).options(selectinload(Session.slots)))
    return list(result.scalars().all())


async def remove_slot(session_id: uuid.UUID, slot_id: uuid.UUID, actor: User, db: AsyncSession) -> Session:
    """Remove a slot from a session. Submission slots return the submission to 'decided' status."""
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
        if sub and sub.status == SubmissionStatus.ASSIGNED_TO_SESSION:
            sub.status = SubmissionStatus.DECIDED
            from datetime import datetime, timezone
            sub.updated_at = datetime.now(timezone.utc)

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

    if session.session_type in NO_SLOT_SESSION_TYPES:
        raise InvalidOperation(f"Cannot add slots to a {session.session_type} session")

    slot_count = await db.scalar(select(func.count()).where(SessionSlot.session_id == session_id))
    if slot_count >= session.max_slots:
        raise InvalidOperation("Session is full")

    if payload.submission_id:
        result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
        sub = result.scalar_one_or_none()
        if not sub:
            raise NotFound("Submission not found")
        if sub.status != SubmissionStatus.DECIDED:
            raise InvalidOperation("Submission must be in 'decided' state")

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
