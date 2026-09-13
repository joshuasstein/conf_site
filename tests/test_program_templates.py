"""Program template feature: save / list / export / import / apply / delete."""
from datetime import date, time

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.models.conference_settings import ConferenceSettings
from app.models.program_template import ProgramTemplate
from app.models.session import Session
from app.services import type_config
from tests.conftest import auth_header

BASE = "/api/v1/admin/program-templates"


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables(db):
    """The test engine is a shared in-memory DB, so wipe the tables this suite
    touches before each test to keep counts deterministic."""
    for model in (Session, ProgramTemplate, ConferenceSettings):
        await db.execute(delete(model))
    await db.commit()
    yield


async def _seed_conf_types(db):
    conf = ConferenceSettings(
        id=1,
        conference_name="Test Conf",
        session_types=list(type_config.DEFAULT_SESSION_TYPES),
        slot_types=list(type_config.DEFAULT_SLOT_TYPES),
        decision_outcomes=[],
        tracks=[],
    )
    db.add(conf)
    await db.commit()


def _session_kwargs(**over):
    base = dict(
        title="Opening Session",
        session_type="oral",
        session_date=date(2026, 6, 1),
        start_time=time(9, 0),
        end_time=time(10, 0),
        room="Main Hall",
        max_slots=0,
    )
    base.update(over)
    return base


async def _add_session(db, created_by, **over):
    s = Session(**_session_kwargs(**over), created_by_id=created_by.id)
    db.add(s)
    await db.commit()
    return s


@pytest.mark.asyncio
async def test_save_from_current_and_list(client, db, admin):
    await _add_session(db, admin, title="Day 1 Keynote", session_date=date(2026, 6, 1))
    await _add_session(db, admin, title="Day 2 Oral", session_type="oral",
                       session_date=date(2026, 6, 2), start_time=time(11, 0), end_time=time(12, 0),
                       room="Room B", max_slots=5)

    resp = await client.post(
        f"{BASE}/save-current",
        json={"name": "PVPMC 2026", "description": "standard layout"},
        headers=auth_header(admin),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["session_count"] == 2
    assert len(body["sessions"]) == 2

    lst = await client.get(BASE, headers=auth_header(admin))
    assert lst.status_code == 200
    assert len(lst.json()) == 1
    assert lst.json()[0]["session_count"] == 2
    assert "sessions" not in lst.json()[0]  # summary omits the heavy payload


@pytest.mark.asyncio
async def test_save_with_no_sessions_errors(client, db, admin):
    resp = await client.post(
        f"{BASE}/save-current", json={"name": "Empty"}, headers=auth_header(admin),
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_non_admin_forbidden(client, db, program_chair):
    resp = await client.get(BASE, headers=auth_header(program_chair))
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_apply_with_date_shift(client, db, admin):
    await _seed_conf_types(db)
    await _add_session(db, admin, title="Kickoff", session_date=date(2026, 6, 1))
    await _add_session(db, admin, title="Closing", session_date=date(2026, 6, 3))

    save = await client.post(f"{BASE}/save-current", json={"name": "T"}, headers=auth_header(admin))
    template_id = save.json()["id"]

    # Wipe live sessions to simulate a next-year fresh DB
    await db.execute(delete(Session))
    await db.commit()

    resp = await client.post(
        f"{BASE}/{template_id}/apply",
        json={"new_start_date": "2027-06-07", "publish": True},
        headers=auth_header(admin),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["created"] == 2

    rows = (await db.execute(select(Session).order_by(Session.session_date))).scalars().all()
    # 2-day gap preserved, shifted onto the new start date
    assert [r.session_date for r in rows] == [date(2027, 6, 7), date(2027, 6, 9)]
    assert all(r.is_published for r in rows)
    assert rows[0].start_time == time(9, 0)


@pytest.mark.asyncio
async def test_apply_exact_dates(client, db, admin):
    await _seed_conf_types(db)
    await _add_session(db, admin, session_date=date(2026, 6, 1))
    save = await client.post(f"{BASE}/save-current", json={"name": "T"}, headers=auth_header(admin))
    template_id = save.json()["id"]

    resp = await client.post(f"{BASE}/{template_id}/apply", json={}, headers=auth_header(admin))
    assert resp.status_code == 200
    rows = (await db.execute(select(Session))).scalars().all()
    assert len(rows) == 2  # original 1 + applied 1
    assert any(r.session_date == date(2026, 6, 1) and not r.is_published for r in rows)


@pytest.mark.asyncio
async def test_export_import_round_trip(client, db, admin):
    await _add_session(db, admin, title="Roundtrip", session_date=date(2026, 6, 1))
    save = await client.post(
        f"{BASE}/save-current", json={"name": "Exported", "description": "d"},
        headers=auth_header(admin),
    )
    template_id = save.json()["id"]

    exp = await client.get(f"{BASE}/{template_id}/export", headers=auth_header(admin))
    assert exp.status_code == 200
    assert "attachment" in exp.headers["content-disposition"]
    payload = exp.json()
    assert payload["format"] == "conf-site.program-template"
    assert len(payload["sessions"]) == 1

    imp = await client.post(f"{BASE}/import", json=payload, headers=auth_header(admin))
    assert imp.status_code == 201, imp.text
    assert imp.json()["session_count"] == 1
    assert imp.json()["name"] == "Exported"


@pytest.mark.asyncio
async def test_import_bad_format_rejected(client, db, admin):
    resp = await client.post(
        f"{BASE}/import",
        json={"format": "something-else", "name": "X", "sessions": [
            {"title": "t", "session_type": "keynote", "session_date": "2026-06-01",
             "start_time": "09:00:00", "end_time": "10:00:00"}
        ]},
        headers=auth_header(admin),
    )
    assert resp.status_code == 422
    assert "format" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_apply_unknown_session_type_rejected(client, db, admin):
    await _seed_conf_types(db)
    imp = await client.post(
        f"{BASE}/import",
        json={"name": "Bad", "sessions": [
            {"title": "t", "session_type": "gala_dinner", "session_date": "2026-06-01",
             "start_time": "18:00:00", "end_time": "20:00:00"}
        ]},
        headers=auth_header(admin),
    )
    template_id = imp.json()["id"]
    resp = await client.post(f"{BASE}/{template_id}/apply", json={}, headers=auth_header(admin))
    assert resp.status_code == 422
    assert "gala_dinner" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_delete_template(client, db, admin):
    await _add_session(db, admin)
    save = await client.post(f"{BASE}/save-current", json={"name": "ToDelete"}, headers=auth_header(admin))
    template_id = save.json()["id"]
    d = await client.delete(f"{BASE}/{template_id}", headers=auth_header(admin))
    assert d.status_code == 204
    g = await client.get(f"{BASE}/{template_id}", headers=auth_header(admin))
    assert g.status_code == 404
