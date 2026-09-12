import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.decision import DecisionCreate, DecisionListItem, DecisionOverride, DecisionRead
from app.services.decision import get_decision, list_decisions, override_decision, record_decision

router = APIRouter(prefix="/decisions", tags=["decisions"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/", response_model=list[DecisionListItem])
async def list_(current_user: CurrentUser, db: DB):
    """Submissions at 'decided' or beyond (admins & program chairs)."""
    return await list_decisions(current_user, db)


@router.post("/", response_model=DecisionRead, status_code=201)
async def create_decision(payload: DecisionCreate, current_user: CurrentUser, db: DB):
    return await record_decision(payload, current_user, db)


@router.put("/{submission_id}", response_model=DecisionRead)
async def override(submission_id: uuid.UUID, payload: DecisionOverride, current_user: CurrentUser, db: DB):
    """Override the recorded decision (admins & program chairs). Audit-logged."""
    return await override_decision(submission_id, payload, current_user, db)


@router.get("/{submission_id}", response_model=DecisionRead)
async def get(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await get_decision(submission_id, current_user, db)
