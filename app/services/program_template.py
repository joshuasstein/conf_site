"""Program template service: save / export / import / apply the empty program
structure so organizers can recreate it year to year.

Admin-only (feature is scoped to admins per the product requirement). Templates
live in their own table so they survive the admin "reset all data" wipe.
"""
import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.errors import InvalidOperation, NotFound, PermissionDenied
from app.models.audit_log import AuditLog
from app.models.program_template import ProgramTemplate
from app.models.session import Session
from app.models.user import User, UserRole
from app.schemas.program_template import (
    EXPORT_FORMAT,
    ApplyTemplateRequest,
    ApplyTemplateResponse,
    ProgramTemplateExport,
    ProgramTemplateImport,
    ProgramTemplateRead,
    ProgramTemplateSummary,
    SaveCurrentRequest,
    TemplateSessionEntry,
)
from app.services import type_config
from app.services.conference_settings import get_conference_settings


def _require_admin(actor: User) -> None:
    if actor.role != UserRole.ADMIN:
        raise PermissionDenied("Only admins can manage program templates")


def _entries(template: ProgramTemplate) -> list[TemplateSessionEntry]:
    return [TemplateSessionEntry.model_validate(s) for s in template.sessions]


def _to_summary(template: ProgramTemplate) -> ProgramTemplateSummary:
    return ProgramTemplateSummary(
        id=template.id,
        name=template.name,
        description=template.description,
        session_count=len(template.sessions),
        created_by_id=template.created_by_id,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


def _to_read(template: ProgramTemplate) -> ProgramTemplateRead:
    return ProgramTemplateRead(
        **_to_summary(template).model_dump(),
        sessions=_entries(template),
    )


async def _get_or_404(template_id: uuid.UUID, db: AsyncSession) -> ProgramTemplate:
    result = await db.execute(select(ProgramTemplate).where(ProgramTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise NotFound("Program template not found")
    return template


def _serialize_entries(entries: list[TemplateSessionEntry]) -> list[dict]:
    # mode="json" keeps date/time as ISO strings so the JSON column is portable.
    return [e.model_dump(mode="json") for e in entries]


async def list_templates(actor: User, db: AsyncSession) -> list[ProgramTemplateSummary]:
    _require_admin(actor)
    result = await db.execute(select(ProgramTemplate).order_by(ProgramTemplate.created_at.desc()))
    return [_to_summary(t) for t in result.scalars().all()]


async def get_template(template_id: uuid.UUID, actor: User, db: AsyncSession) -> ProgramTemplateRead:
    _require_admin(actor)
    return _to_read(await _get_or_404(template_id, db))


async def export_template(template_id: uuid.UUID, actor: User, db: AsyncSession) -> ProgramTemplateExport:
    _require_admin(actor)
    template = await _get_or_404(template_id, db)
    return ProgramTemplateExport(
        name=template.name,
        description=template.description,
        sessions=_entries(template),
    )


async def save_from_current(
    payload: SaveCurrentRequest, actor: User, db: AsyncSession
) -> ProgramTemplateRead:
    """Snapshot the current sessions (minus their slots) into a new template."""
    _require_admin(actor)

    result = await db.execute(select(Session).order_by(Session.session_date, Session.start_time))
    sessions = list(result.scalars().all())
    if not sessions:
        raise InvalidOperation("There are no sessions to save as a template")

    entries = [
        TemplateSessionEntry(
            title=s.title,
            description=s.description,
            session_type=s.session_type,
            session_date=s.session_date,
            start_time=s.start_time,
            end_time=s.end_time,
            room=s.room,
            chair_name=s.chair_name,
            max_slots=s.max_slots,
        )
        for s in sessions
    ]
    return await _create(payload.name, payload.description, entries, actor, db)


async def import_template(
    payload: ProgramTemplateImport, actor: User, db: AsyncSession
) -> ProgramTemplateRead:
    """Create a template from an exported file."""
    _require_admin(actor)
    if payload.format is not None and payload.format != EXPORT_FORMAT:
        raise InvalidOperation(f"Unrecognized template file format '{payload.format}'")
    if not payload.sessions:
        raise InvalidOperation("Template file contains no sessions")
    return await _create(payload.name, payload.description, payload.sessions, actor, db)


async def _create(
    name: str,
    description: str | None,
    entries: list[TemplateSessionEntry],
    actor: User,
    db: AsyncSession,
) -> ProgramTemplateRead:
    template = ProgramTemplate(
        name=name,
        description=description,
        sessions=_serialize_entries(entries),
        created_by_id=actor.id,
    )
    db.add(template)
    await db.flush()
    db.add(AuditLog(
        actor_id=actor.id,
        action="program_template_created",
        target_type="program_template",
        target_id=template.id,
        detail={"name": name, "session_count": len(entries)},
    ))
    await db.commit()
    await db.refresh(template)
    return _to_read(template)


async def delete_template(template_id: uuid.UUID, actor: User, db: AsyncSession) -> None:
    _require_admin(actor)
    template = await _get_or_404(template_id, db)
    db.add(AuditLog(
        actor_id=actor.id,
        action="program_template_deleted",
        target_type="program_template",
        target_id=template.id,
        detail={"name": template.name},
    ))
    await db.delete(template)
    await db.commit()


async def apply_template(
    template_id: uuid.UUID, payload: ApplyTemplateRequest, actor: User, db: AsyncSession
) -> ApplyTemplateResponse:
    """Recreate the template's empty sessions as live Session rows."""
    _require_admin(actor)
    template = await _get_or_404(template_id, db)
    entries = _entries(template)
    if not entries:
        raise InvalidOperation("Template has no sessions to apply")

    # Reject unknown session types up front (e.g. a template imported from another
    # instance whose configurable types differ from this conference's).
    conf = await get_conference_settings(db)
    known = set(type_config.session_type_keys(conf))
    unknown = sorted({e.session_type for e in entries if e.session_type not in known})
    if unknown:
        raise InvalidOperation(
            "Template references session type(s) not configured for this conference: "
            + ", ".join(unknown)
        )

    offset: timedelta | None = None
    if payload.new_start_date is not None:
        base = min(e.session_date for e in entries)
        offset = payload.new_start_date - base

    for e in entries:
        session_date = e.session_date + offset if offset is not None else e.session_date
        db.add(Session(
            title=e.title,
            description=e.description,
            session_type=e.session_type,
            session_date=session_date,
            start_time=e.start_time,
            end_time=e.end_time,
            room=e.room,
            chair_name=e.chair_name,
            max_slots=e.max_slots,
            is_published=payload.publish,
            created_by_id=actor.id,
        ))

    db.add(AuditLog(
        actor_id=actor.id,
        action="program_template_applied",
        target_type="program_template",
        target_id=template.id,
        detail={
            "name": template.name,
            "created": len(entries),
            "new_start_date": payload.new_start_date.isoformat() if payload.new_start_date else None,
            "published": payload.publish,
        },
    ))
    await db.commit()
    return ApplyTemplateResponse(created=len(entries), new_start_date=payload.new_start_date)
