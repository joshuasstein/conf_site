"""Pure state machine for Abstract lifecycle transitions.

Validates a requested transition and returns a specification of what should
happen if accepted. Has no database access and no HTTP awareness — callers
translate the result into persistence and HTTP responses.

Admin overrides bypass this module entirely; the caller is responsible for
logging those via AuditLog.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Literal

from app.models.conference_settings import ConferenceSettings
from app.models.email_job import EmailTemplate
from app.models.submission import SubmissionStatus
from app.models.user import UserRole


class RejectionKind(Enum):
    FORBIDDEN = "forbidden"   # wrong role → 403
    INVALID = "invalid"       # wrong state or deadline passed → 422


@dataclass(frozen=True)
class EmailSpec:
    template: str
    recipient: Literal["presenter"]


@dataclass(frozen=True)
class TransitionAccepted:
    new_status: str
    emails: list[EmailSpec] = field(default_factory=list)
    release_slot: bool = False


@dataclass(frozen=True)
class TransitionRejected:
    kind: RejectionKind
    reason: str


def validate(
    from_status: str,
    to_status: str,
    actor_role: str,
    conf: ConferenceSettings,
    now: datetime,
) -> TransitionAccepted | TransitionRejected:
    """Validate a requested Abstract status transition.

    Returns TransitionAccepted (with email specs and slot-release flag) if the
    transition is permitted for this role and deadline state, or TransitionRejected
    with a kind and human-readable reason if not.
    """
    S = SubmissionStatus

    allowed = S.TRANSITIONS.get(from_status, [])
    if to_status not in allowed:
        return TransitionRejected(
            kind=RejectionKind.INVALID,
            reason=f"Cannot transition from '{from_status}' to '{to_status}'",
        )

    if from_status == S.DRAFT and to_status == S.SUBMITTED:
        if actor_role != UserRole.SUBMITTER:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only submitters can submit")
        if conf.submission_deadline and now > conf.submission_deadline:
            return TransitionRejected(RejectionKind.INVALID, "Submission deadline has passed")
        return TransitionAccepted(
            new_status=to_status,
            emails=[EmailSpec(template=EmailTemplate.SUBMISSION_CONFIRMATION, recipient="presenter")],
        )

    if from_status == S.SUBMITTED and to_status == S.UNDER_REVIEW:
        if actor_role != UserRole.ADMIN:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only admins can open review")
        return TransitionAccepted(new_status=to_status)

    if from_status == S.UNDER_REVIEW and to_status == S.DECIDED:
        if actor_role != UserRole.ADMIN:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only admins can record decisions")
        return TransitionAccepted(new_status=to_status)

    if from_status == S.DECIDED and to_status == S.ASSIGNED_TO_SESSION:
        if actor_role not in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only program chairs can assign sessions")
        return TransitionAccepted(new_status=to_status)

    if from_status == S.ASSIGNED_TO_SESSION and to_status == S.NOTIFIED:
        if actor_role != UserRole.ADMIN:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only admins can trigger notifications")
        return TransitionAccepted(new_status=to_status)

    if from_status == S.NOTIFIED and to_status == S.CONFIRMED:
        if actor_role != UserRole.SUBMITTER:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only submitters can confirm")
        return TransitionAccepted(new_status=to_status)

    if from_status == S.NOTIFIED and to_status == S.WITHDRAWN:
        if actor_role != UserRole.SUBMITTER:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only submitters can withdraw")
        return TransitionAccepted(new_status=to_status, release_slot=True)

    if from_status == S.CONFIRMED and to_status == S.FILES_SUBMITTED:
        if actor_role != UserRole.SUBMITTER:
            return TransitionRejected(RejectionKind.FORBIDDEN, "Only submitters can submit files")
        if conf.file_submission_deadline and now > conf.file_submission_deadline:
            return TransitionRejected(RejectionKind.INVALID, "File submission deadline has passed")
        return TransitionAccepted(new_status=to_status)

    # Should not be reachable: TRANSITIONS dict is the source of truth for valid edges.
    return TransitionRejected(
        kind=RejectionKind.INVALID,
        reason=f"Unhandled transition from '{from_status}' to '{to_status}'",
    )
