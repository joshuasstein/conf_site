"""Pure unit tests for the Abstract state machine.

No database. No HTTP. No async. Just values in, values out.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.conference_settings import ConferenceSettings
from app.models.email_job import EmailTemplate
from app.models.submission import SubmissionStatus
from app.models.user import UserRole
from app.services.abstract_state_machine import (
    RejectionKind,
    TransitionAccepted,
    TransitionRejected,
    validate,
)

NOW = datetime.now(timezone.utc)
PAST = NOW - timedelta(hours=1)
FUTURE = NOW + timedelta(hours=1)

S = SubmissionStatus


def conf(*, submission_deadline=None, file_submission_deadline=None) -> ConferenceSettings:
    return ConferenceSettings(
        id=1,
        submission_deadline=submission_deadline,
        file_submission_deadline=file_submission_deadline,
    )


# ── draft → submitted ────────────────────────────────────────────────────────

def test_submitter_can_submit_before_deadline():
    result = validate(S.DRAFT, S.SUBMITTED, UserRole.SUBMITTER, conf(submission_deadline=FUTURE), NOW)
    assert isinstance(result, TransitionAccepted)
    assert result.new_status == S.SUBMITTED
    assert not result.release_slot


def test_submission_queues_confirmation_email():
    result = validate(S.DRAFT, S.SUBMITTED, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionAccepted)
    assert len(result.emails) == 1
    assert result.emails[0].template == EmailTemplate.SUBMISSION_CONFIRMATION
    assert result.emails[0].recipient == "presenter"


def test_submitter_blocked_after_deadline():
    result = validate(S.DRAFT, S.SUBMITTED, UserRole.SUBMITTER, conf(submission_deadline=PAST), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.INVALID


def test_non_submitter_cannot_submit():
    for role in (UserRole.REVIEWER, UserRole.PROGRAM_CHAIR, UserRole.ADMIN):
        result = validate(S.DRAFT, S.SUBMITTED, role, conf(), NOW)
        assert isinstance(result, TransitionRejected)
        assert result.kind == RejectionKind.FORBIDDEN


def test_no_deadline_means_open():
    result = validate(S.DRAFT, S.SUBMITTED, UserRole.SUBMITTER, conf(submission_deadline=None), NOW)
    assert isinstance(result, TransitionAccepted)


# ── notified → confirmed / withdrawn ────────────────────────────────────────

def test_submitter_can_confirm():
    result = validate(S.NOTIFIED, S.CONFIRMED, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionAccepted)
    assert not result.release_slot


def test_submitter_can_withdraw_and_releases_slot():
    result = validate(S.NOTIFIED, S.WITHDRAWN, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionAccepted)
    assert result.release_slot is True
    assert result.emails == []


def test_non_submitter_cannot_confirm():
    result = validate(S.NOTIFIED, S.CONFIRMED, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.FORBIDDEN


def test_non_submitter_cannot_withdraw():
    result = validate(S.NOTIFIED, S.WITHDRAWN, UserRole.PROGRAM_CHAIR, conf(), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.FORBIDDEN


# ── confirmed → files_submitted ──────────────────────────────────────────────

def test_submitter_can_submit_files_before_deadline():
    result = validate(S.CONFIRMED, S.FILES_SUBMITTED, UserRole.SUBMITTER, conf(file_submission_deadline=FUTURE), NOW)
    assert isinstance(result, TransitionAccepted)
    assert result.emails == []


def test_file_submission_blocked_after_deadline():
    result = validate(S.CONFIRMED, S.FILES_SUBMITTED, UserRole.SUBMITTER, conf(file_submission_deadline=PAST), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.INVALID


# ── admin-only edges ─────────────────────────────────────────────────────────

def test_only_admin_can_open_review():
    result = validate(S.SUBMITTED, S.UNDER_REVIEW, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionAccepted)

    result = validate(S.SUBMITTED, S.UNDER_REVIEW, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.FORBIDDEN


def test_only_admin_can_record_decision():
    result = validate(S.UNDER_REVIEW, S.DECIDED, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionAccepted)

    result = validate(S.UNDER_REVIEW, S.DECIDED, UserRole.REVIEWER, conf(), NOW)
    assert isinstance(result, TransitionRejected)


def test_only_admin_can_trigger_notifications():
    result = validate(S.ASSIGNED_TO_SESSION, S.NOTIFIED, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionAccepted)

    result = validate(S.ASSIGNED_TO_SESSION, S.NOTIFIED, UserRole.PROGRAM_CHAIR, conf(), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.FORBIDDEN


# ── program chair edges ──────────────────────────────────────────────────────

def test_program_chair_can_assign_to_session():
    result = validate(S.DECIDED, S.ASSIGNED_TO_SESSION, UserRole.PROGRAM_CHAIR, conf(), NOW)
    assert isinstance(result, TransitionAccepted)

    result = validate(S.DECIDED, S.ASSIGNED_TO_SESSION, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionAccepted)

    result = validate(S.DECIDED, S.ASSIGNED_TO_SESSION, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionRejected)


# ── invalid edges ────────────────────────────────────────────────────────────

def test_invalid_transition_rejected():
    result = validate(S.DRAFT, S.NOTIFIED, UserRole.ADMIN, conf(), NOW)
    assert isinstance(result, TransitionRejected)
    assert result.kind == RejectionKind.INVALID


def test_terminal_states_have_no_successors():
    for terminal in (S.FILES_SUBMITTED, S.WITHDRAWN):
        result = validate(terminal, S.DRAFT, UserRole.ADMIN, conf(), NOW)
        assert isinstance(result, TransitionRejected)
        assert result.kind == RejectionKind.INVALID


def test_withdrawal_no_emails_queued():
    result = validate(S.NOTIFIED, S.WITHDRAWN, UserRole.SUBMITTER, conf(), NOW)
    assert isinstance(result, TransitionAccepted)
    assert result.emails == []
