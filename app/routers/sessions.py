import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.session import (
    AddColumnRequest,
    ParallelBlockCreate,
    ProgramRow,
    SessionCreate,
    SessionDeletionImpact,
    ProgramCheckResult,
    SessionGroupRead,
    SessionGroupSummary,
    SessionGroupUpdate,
    SessionRead,
    SessionSlotRead,
    SessionUpdate,
    SlotAssign,
    SlotUpdate,
)
from app.services.conference_settings import get_conference_settings
from app.services import type_config
from app.services import session_group_service
from app.services.session_service import (
    _get_session_with_slots,
    assign_submission_to_session,
    check_program,
    create_session,
    delete_session,
    get_deletion_impact,
    get_program,
    list_sessions,
    remove_slot,
    update_slot,
    update_session,
)

router = APIRouter(prefix="/sessions", tags=["sessions"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/conference-info", tags=["program"])
async def conference_info(db: DB) -> dict:
    """Public endpoint — returns conference name, location, and tracks (for the
    program page and the submission form's track dropdown)."""
    settings = await get_conference_settings(db)
    return {
        "conference_name": settings.conference_name,
        "location": settings.location,
        "tracks": settings.tracks or [],
        "session_types": type_config.session_types(settings),
        "slot_types": type_config.slot_types(settings),
        "decision_outcomes": type_config.decision_outcomes(settings),
    }


@router.get("/program", response_model=list[ProgramRow], tags=["program"])
async def program(db: DB):
    """Public conference program — no authentication required. Returns time-ordered
    rows; a parallel block is one row with several columns."""
    return await get_program(db)


# ── Parallel session blocks ──────────────────────────────────────────────────
# Declared before the "/{session_id}" routes so "/groups" isn't parsed as a UUID.

@router.get("/groups", response_model=list[SessionGroupSummary])
async def list_parallel_blocks(current_user: CurrentUser, db: DB):
    return await session_group_service.list_groups(current_user, db)


@router.post("/groups", response_model=SessionGroupRead, status_code=201)
async def create_parallel_block(payload: ParallelBlockCreate, current_user: CurrentUser, db: DB):
    return await session_group_service.create_parallel_block(payload, current_user, db)


@router.get("/groups/{group_id}", response_model=SessionGroupRead)
async def get_parallel_block(group_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await session_group_service.get_group(group_id, current_user, db)


@router.patch("/groups/{group_id}", response_model=SessionGroupRead)
async def update_parallel_block(group_id: uuid.UUID, payload: SessionGroupUpdate, current_user: CurrentUser, db: DB):
    return await session_group_service.update_group(group_id, payload, current_user, db)


@router.post("/groups/{group_id}/columns", response_model=SessionGroupRead, status_code=201)
async def add_parallel_column(group_id: uuid.UUID, payload: AddColumnRequest, current_user: CurrentUser, db: DB):
    return await session_group_service.add_column(group_id, payload, current_user, db)


@router.get("/groups/{group_id}/deletion-impact", response_model=SessionDeletionImpact)
async def parallel_block_deletion_impact(group_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await session_group_service.get_group_deletion_impact(group_id, current_user, db)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_parallel_block(
    group_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    advanced_status: str = "decided",
) -> None:
    await session_group_service.delete_group(group_id, current_user, db, advanced_status=advanced_status)


@router.get("/program-check", response_model=ProgramCheckResult)
async def program_check(current_user: CurrentUser, db: DB):
    """Report unscheduled gaps within each day and time overlaps between sessions
    that are not part of the same parallel block."""
    return await check_program(current_user, db)


@router.get("/", response_model=list[SessionRead])
async def list_(current_user: CurrentUser, db: DB):
    return await list_sessions(current_user, db)


@router.get("/{session_id}", response_model=SessionRead)
async def get(session_id: uuid.UUID, current_user: CurrentUser, db: DB):
    session = await _get_session_with_slots(session_id, db)
    if not session:
        from app.errors import NotFound
        raise NotFound("Session not found")
    return session


@router.post("/", response_model=SessionRead, status_code=201)
async def create(payload: SessionCreate, current_user: CurrentUser, db: DB):
    return await create_session(payload, current_user, db)


@router.patch("/{session_id}", response_model=SessionRead)
async def update(session_id: uuid.UUID, payload: SessionUpdate, current_user: CurrentUser, db: DB):
    return await update_session(session_id, payload, current_user, db)


@router.get("/{session_id}/deletion-impact", response_model=SessionDeletionImpact)
async def deletion_impact(session_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await get_deletion_impact(session_id, current_user, db)


@router.delete("/{session_id}", status_code=204)
async def delete(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    advanced_status: str = "decided",
) -> None:
    await delete_session(session_id, current_user, db, advanced_status=advanced_status)


@router.post("/{session_id}/slots", response_model=SessionSlotRead, status_code=201)
async def add_slot(session_id: uuid.UUID, payload: SlotAssign, current_user: CurrentUser, db: DB):
    return await assign_submission_to_session(session_id, payload, current_user, db)


@router.delete("/{session_id}/slots/{slot_id}", response_model=SessionRead)
async def delete_slot(session_id: uuid.UUID, slot_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await remove_slot(session_id, slot_id, current_user, db)


@router.patch("/{session_id}/slots/{slot_id}", response_model=SessionRead)
async def patch_slot(session_id: uuid.UUID, slot_id: uuid.UUID, payload: SlotUpdate, current_user: CurrentUser, db: DB):
    return await update_slot(session_id, slot_id, payload, current_user, db)
