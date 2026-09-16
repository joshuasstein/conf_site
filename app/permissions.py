"""Pure permission predicates shared by the FastAPI guards (dependencies/auth)
and the service layer's read-scoping.

These describe *read* visibility. The Admin Viewer privilege (is_admin_viewer)
grants admin-level read access to any user while leaving write/action
permissions governed solely by the base ``role`` — so these helpers are used
only to widen what a caller may see, never what they may change.

This module deliberately has no FastAPI dependency so services can import it
without pulling in web-layer code.
"""
from app.models.user import User, UserRole


def can_view_all(user: User) -> bool:
    """May read chair/admin-level surfaces (all submissions, reviews, decisions,
    files, presenters). True for program chairs, admins, and admin viewers."""
    return user.is_admin_viewer or user.role in (UserRole.PROGRAM_CHAIR, UserRole.ADMIN)


def can_view_admin(user: User) -> bool:
    """May read admin-only surfaces (users, audit log, conference settings,
    email/program templates). True for admins and admin viewers."""
    return user.is_admin_viewer or user.role == UserRole.ADMIN
