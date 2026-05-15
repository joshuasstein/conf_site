"""Session service: program-chair session and slot management."""
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.session import Session
from app.models.session_slot import SessionSlot
from app.models.submission import Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.schemas.session import SessionCreate, SessionUpdate, SlotAssign
from app.services.submission import transition_submission


async def create_session(payload: SessionCreate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    session = Session(**payload.model_dump(), created_by_id=actor.id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def update_session(session_id: uuid.UUID, payload: SessionUpdate, actor: User, db: AsyncSession) -> Session:
    if actor.role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return session


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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    result = await db.execute(
        select(Session).where(Session.id == session_id).options(selectinload(Session.slots))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    slot_count = await db.scalar(select(func.count()).where(SessionSlot.session_id == session_id))
    if slot_count >= session.max_slots:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Session is full")

    result = await db.execute(select(Submission).where(Submission.id == payload.submission_id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    if sub.status != SubmissionStatus.DECIDED:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Submission must be in 'decided' state")

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
