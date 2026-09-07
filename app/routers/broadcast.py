from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import require_program_chair
from app.models.user import User
from app.schemas.broadcast import (
    AudienceFilter,
    BroadcastPreviewResponse,
    BroadcastRequest,
    BroadcastResponse,
)
from app.services.broadcast import preview_audience, send_broadcast

router = APIRouter(prefix="/broadcast", tags=["broadcast"])

# Admins and program chairs may email users.
ChairUser = Annotated[User, Depends(require_program_chair)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/preview", response_model=BroadcastPreviewResponse)
async def preview(filters: AudienceFilter, current_user: ChairUser, db: DB):
    """Count and sample the users a filter set would email."""
    return await preview_audience(filters, current_user, db)


@router.post("/send", response_model=BroadcastResponse)
async def send(payload: BroadcastRequest, current_user: ChairUser, db: DB):
    """Queue a custom email to every user matching the filters."""
    return await send_broadcast(payload.filters, payload.subject, payload.body, current_user, db)
