import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies.auth import get_current_user, require_reviewer
from app.models.user import User
from app.schemas.review import ReviewCreate, ReviewRead, ReviewSubmit, ReviewWithSubmission
from app.services.review import (
    assign_reviewer,
    list_my_reviews,
    list_reviews_for_submission,
    submit_review,
    unassign_reviewer,
)

router = APIRouter(prefix="/reviews", tags=["reviews"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/mine", response_model=list[ReviewWithSubmission])
async def my_reviews(current_user: CurrentUser, db: DB):
    return await list_my_reviews(current_user, db)


@router.post("/", response_model=ReviewRead, status_code=201)
async def assign(payload: ReviewCreate, current_user: CurrentUser, db: DB):
    return await assign_reviewer(payload.submission_id, payload.reviewer_id, current_user, db)


@router.delete("/{review_id}", status_code=204)
async def unassign(review_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    """Remove a reviewer assignment (admins & program chairs)."""
    await unassign_reviewer(review_id, current_user, db)


@router.get("/submission/{submission_id}", response_model=list[ReviewRead])
async def list_for_submission(submission_id: uuid.UUID, current_user: CurrentUser, db: DB):
    return await list_reviews_for_submission(submission_id, current_user, db)


@router.post("/{review_id}/submit", response_model=ReviewRead)
async def submit(review_id: uuid.UUID, payload: ReviewSubmit, current_user: CurrentUser, db: DB):
    return await submit_review(review_id, payload, current_user, db)
