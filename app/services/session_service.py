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


async def create_session(payload: SessionCreate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    session = Session(**payload.model_dump(), created_by_id=actor.id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def update_session(session_id: uuid.UUID, payload: SessionUpdate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise PermissionDenied("Insufficient permissions")
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise NotFound("Session not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return session


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
