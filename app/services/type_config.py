"""Configurable session- and slot-type definitions.

Session and slot types used to be hardcoded (a Postgres enum for session_type
and a fixed tuple for slot_type). They are now editable from the Settings tab and
stored as JSON on the single ``conference_settings`` row.

Each type is identified by an immutable ``key`` (used everywhere in the DB and by
the decision/notification logic); ``label`` and ``color`` are display-only and may
be changed freely. ``has_slots`` (session types) and ``requires_submission`` /
``expects_file`` (slot types) carry the behaviour that the program page, slot
assignment, and final-file collection depend on.
"""
from app.models.attachment import FileType

# ─── Curated color palette ──────────────────────────────────────────────────────
# Session-type colors are chosen from this fixed set so the program page stays
# cohesive and the Tailwind classes survive purging (they are also safelisted in
# frontend/tailwind.config.ts). Keys are stored in the DB; the frontend maps the
# same keys to matching classes.
SESSION_COLORS = (
    "indigo",
    "emerald",
    "amber",
    "rose",
    "sky",
    "violet",
    "teal",
    "slate",
)

# ─── expects_file options for slot types ────────────────────────────────────────
# "none": no final file expected. Otherwise the final FileType a presenter in this
# slot is expected to upload.
EXPECTS_FILE_OPTIONS = ("none", "presentation", "poster")
_EXPECTS_FILE_TO_FILETYPE = {
    "presentation": FileType.FINAL_PRESENTATION,
    "poster": FileType.FINAL_POSTER,
}

# ─── Built-in defaults (seeded into new deployments and migrations) ───────────────
DEFAULT_SESSION_TYPES: list[dict] = [
    {"key": "oral", "label": "Oral", "color": "indigo", "has_slots": True},
    {"key": "poster", "label": "Poster", "color": "emerald", "has_slots": True},
    {"key": "networking_break", "label": "Networking Break", "color": "slate", "has_slots": False},
    {"key": "lunch", "label": "Lunch", "color": "amber", "has_slots": False},
    {"key": "happy_hour", "label": "Happy Hour", "color": "rose", "has_slots": False},
]

DEFAULT_SLOT_TYPES: list[dict] = [
    {"key": "talk", "label": "Talk", "requires_submission": True, "expects_file": "presentation"},
    {"key": "qa", "label": "Q&A", "requires_submission": False, "expects_file": "none"},
    {"key": "discussion", "label": "Discussion", "requires_submission": False, "expects_file": "none"},
    {"key": "poster", "label": "Poster", "requires_submission": True, "expects_file": "poster"},
]

# Decision outcomes. ``is_acceptance`` distinguishes accept vs reject outcomes and
# drives which notification email is sent (see app/services/notifications.py).
DEFAULT_DECISION_OUTCOMES: list[dict] = [
    {"key": "oral", "label": "Oral", "is_acceptance": True},
    {"key": "poster", "label": "Poster", "is_acceptance": True},
    {"key": "rejected", "label": "Rejected", "is_acceptance": False},
]


def session_types(settings) -> list[dict]:
    """Configured session types, falling back to built-in defaults if unset."""
    return settings.session_types or DEFAULT_SESSION_TYPES


def slot_types(settings) -> list[dict]:
    """Configured slot types, falling back to built-in defaults if unset."""
    return settings.slot_types or DEFAULT_SLOT_TYPES


def session_type_keys(settings) -> set[str]:
    return {t["key"] for t in session_types(settings)}


def slot_type_keys(settings) -> set[str]:
    return {t["key"] for t in slot_types(settings)}


def no_slot_session_type_keys(settings) -> set[str]:
    """Session types that are pure time blocks (no talk/poster slots)."""
    return {t["key"] for t in session_types(settings) if not t.get("has_slots", True)}


def slot_requires_submission(settings, slot_type: str) -> bool:
    for t in slot_types(settings):
        if t["key"] == slot_type:
            return bool(t.get("requires_submission", False))
    return False


def expected_file_by_slot_type(settings) -> dict[str, str]:
    """Map of slot_type -> expected final FileType, for slots that expect a file."""
    out: dict[str, str] = {}
    for t in slot_types(settings):
        ft = _EXPECTS_FILE_TO_FILETYPE.get(t.get("expects_file", "none"))
        if ft:
            out[t["key"]] = ft
    return out


def session_type_display(settings) -> dict[str, dict]:
    """Map of session_type key -> {label, color, has_slots} for the public program page."""
    return {
        t["key"]: {
            "label": t["label"],
            "color": t.get("color", "indigo"),
            "has_slots": t.get("has_slots", True),
        }
        for t in session_types(settings)
    }


def slot_type_labels(settings) -> dict[str, str]:
    """Map of slot_type key -> label for the public program page."""
    return {t["key"]: t["label"] for t in slot_types(settings)}


def decision_outcomes(settings) -> list[dict]:
    """Configured decision outcomes, falling back to built-in defaults if unset."""
    return settings.decision_outcomes or DEFAULT_DECISION_OUTCOMES


def decision_outcome_keys(settings) -> set[str]:
    return {o["key"] for o in decision_outcomes(settings)}


def decision_outcome_labels(settings) -> dict[str, str]:
    return {o["key"]: o["label"] for o in decision_outcomes(settings)}


def is_acceptance_outcome(settings, outcome: str) -> bool:
    for o in decision_outcomes(settings):
        if o["key"] == outcome:
            return bool(o.get("is_acceptance", False))
    return False
