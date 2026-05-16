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
from app.schemas.session import SessionCreate, SessionUpdate, SlotAssign
from app.services.submission import transition_submission


async def _get_session_with_slots(session_id: uuid.UUID, db: AsyncSession) -> Session | None:
    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.slots))
    )
    return result.scalar_one_or_none()


async def create_session(payload: SessionCreate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    session = Session(**payload.model_dump(), created_by_id=actor.id)
    db.add(session)
    await db.commit()
    return await _get_session_with_slots(session.id, db)


async def update_session(session_id: uuid.UUID, payload: SessionUpdate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    session = await _get_session_with_slots(session_id, db)
    if not session:
        raise NotFound("Session not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def get_program(db: AsyncSession) -> list[dict]:
    """Return published sessions with slot details for the public program page."""
    result = await db.execute(
        select(Session)
        .where(Session.is_published == True)  # noqa: E712
        .options(selectinload(Session.slots).selectinload(SessionSlot.submission).selectinload(Submission.presenting_author))
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
                    "duration_minutes": slot.duration_minutes,
                    "abstract_title": slot.submission.title,
                    "presenter_name": slot.submission.presenting_author.full_name,
                }
                for slot in slots
            ],
        })
    return program


async def list_sessions(actor: User, db: AsyncSession) -> list[Session]:
    result = await db.execute(select(Session).options(selectinload(Session.slots)))
    return list(result.scalars().all())


async def remove_slot(session_id: uuid.UUID, slot_id: uuid.UUID, actor: User, db: AsyncSession) -> Session:
    """Remove a slot from a session and return the submission to 'decided' status."""
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(SessionSlot).where(SessionSlot.id == slot_id, SessionSlot.session_id == session_id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFound("Slot not found")

    sub_result = await db.execute(select(Submission).where(Submission.id == slot.submission_id))
    sub = sub_result.scalar_one_or_none()
    if sub and sub.status == SubmissionStatus.ASSIGNED_TO_SESSION:
        sub.status = SubmissionStatus.DECIDED
        from datetime import datetime, timezone
        sub.updated_at = datetime.now(timezone.utc)

    await db.delete(slot)
    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def update_slot(session_id: uuid.UUID, slot_id: uuid.UUID, payload: "SlotUpdate", actor: User, db: AsyncSession) -> Session:
    """Update a slot's order and/or duration. When reordering, swaps with the displaced slot."""
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(SessionSlot).where(SessionSlot.id == slot_id, SessionSlot.session_id == session_id)
    )
    slot = result.scalar_one_or_none()
    if not slot:
        raise NotFound("Slot not found")

    if payload.slot_order is not None and payload.slot_order != slot.slot_order:
        displaced_result = await db.execute(
            select(SessionSlot).where(
                SessionSlot.session_id == session_id,
                SessionSlot.slot_order == payload.slot_order,
                SessionSlot.id != slot_id,
            )
        )
        displaced = displaced_result.scalar_one_or_none()
        if displaced:
            displaced.slot_order = slot.slot_order
        slot.slot_order = payload.slot_order

    if payload.duration_minutes is not None:
        slot.duration_minutes = payload.duration_minutes

    await db.commit()
    return await _get_session_with_slots(session_id, db)


async def assign_submission_to_session(
    session_id: uuid.UUID, payload: SlotAssign, actor: User, db: AsyncSession
) -> SessionSlot:
    """Assign a decided submission to a session slot and advance its status.

    Raises 422 if the session is full or the submission is not in 'decided' state.
    """
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.slots))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise NotFound("Session not found")

    slot_count = await db.scalar(select(func.count()).where(SessionSlot.session_id == session_id))
    if slot_count >= session.max_slots:
        raise InvalidOperation("Session is full")

    result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise NotFound("Submission not found")
    if sub.status != SubmissionStatus.DECIDED:
        raise InvalidOperation("Submission must be in 'decided' state")

    existing_slot = await db.execute(
        select(SessionSlot).where(SessionSlot.submission_id == payload.submission_id)
    )
    if existing_slot.scalar_one_or_none():
        raise InvalidOperation("Submission is already assigned to a session")

    slot = SessionSlot(
        session_id=session_id,
        submission_id=payload.submission_id,
        slot_order=payload.slot_order,
        duration_minutes=payload.duration_minutes,
    )
    db.add(slot)
    await db.flush()

    await transition_submission(payload.submission_id, SubmissionStatus.ASSIGNED_TO_SESSION, actor, db)
    await db.refresh(slot)
    return slot
