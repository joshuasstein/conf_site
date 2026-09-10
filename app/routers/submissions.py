import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.schemas.submission import SubmissionCreate, SubmissionRead, SubmissionUpdate
from app.services.submission import (
    create_submission,
    delete_submission,
    get_submission_for_actor,
    list_submissions,
    request_file_replacement,
    transition_submission,
    update_submission,
)

router = APIRouter(prefix="/submissions", tags=["submissions"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/", response_model=list[SubmissionRead])
async def list_(current_user: CurrentUser, db: DB):
    return await list_submissions(current_user, db)


@router.post("/", response_model=SubmissionRead, status_code=201)
async def create(payload: SubmissionCreate, current_user: CurrentUser, db: DB):
    return await create_submission(payload, current_user, db)


@router.get("/{submission_id}", response_model=SubmissionRead)
async def get_one(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await get_submission_for_actor(submission_id, current_user, db)


@router.patch("/{submission_id}", response_model=SubmissionRead)
async def update(submission_id: uuid.UUID, payload: SubmissionUpdate, current_user: CurrentUser, db: DB):
    return await update_submission(submission_id, payload, current_user, db)


@router.delete("/{submission_id}", status_code=204)
async def delete(submission_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    await delete_submission(submission_id, current_user, db)


@router.post("/{submission_id}/submit", response_model=SubmissionRead)
async def submit(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await transition_submission(submission_id, "submitted", current_user, db)


@router.post("/{submission_id}/confirm", response_model=SubmissionRead)
async def confirm(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await transition_submission(submission_id, "confirmed", current_user, db)


@router.post("/{submission_id}/withdraw", response_model=SubmissionRead)
async def withdraw(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await transition_submission(submission_id, "withdrawn", current_user, db)


@router.post("/{submission_id}/request-file-replacement", response_model=SubmissionRead)
async def request_replacement(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await request_file_replacement(submission_id, current_user, db)


@router.post("/{submission_id}/submit-files", response_model=SubmissionRead)
async def submit_files(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await transition_submission(submission_id, "files_submitted", current_user, db)
