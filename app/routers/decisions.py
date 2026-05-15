import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.decision import DecisionCreate, DecisionRead
from app.services.decision import get_decision, record_decision

router = APIRouter(prefix="/decisions", tags=["decisions"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/", response_model=DecisionRead, status_code=201)
async def create_decision(payload: DecisionCreate, current_user: CurrentUser, db: DB):
    return await record_decision(payload, current_user, db)


@router.get("/{submission_id}", response_model=DecisionRead)
async def get(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await get_decision(submission_id, current_user, db)
