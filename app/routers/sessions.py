import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.session import ProgramSessionRead, SessionCreate, SessionRead, SessionSlotRead, SessionUpdate, SlotAssign
from app.services.session_service import (
    assign_submission_to_session,
    create_session,
    get_program,
    list_sessions,
    update_session,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/program", response_model=list[ProgramSessionRead], tags=["program"])
async def program(db: DB):
    """Public conference program — no authentication required."""
    return await get_program(db)


@router.get("/", response_model=list[SessionRead])
async def list_(current_user: CurrentUser, db: DB):
    return await list_sessions(current_user, db)


@router.post("/", response_model=SessionRead, status_code=201)
async def create(payload: SessionCreate, current_user: CurrentUser, db: DB):
    return await create_session(payload, current_user, db)


@router.patch("/{session_id}", response_model=SessionRead)
async def update(session_id: uuid.UUID, payload: SessionUpdate, current_user: CurrentUser, db: DB):
    return await update_session(session_id, payload, current_user, db)


@router.post("/{session_id}/slots", response_model=SessionSlotRead, status_code=201)
async def add_slot(session_id: uuid.UUID, payload: SlotAssign, current_user: CurrentUser, db: DB):
    return await assign_submission_to_session(session_id, payload, current_user, db)
