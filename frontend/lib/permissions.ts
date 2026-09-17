// Client-side permission helpers, mirroring app/permissions.py on the backend.
//
// The Admin Viewer privilege (is_admin_viewer) grants admin-level *read* access
// to any user. It never grants the ability to act — write/action controls stay
// gated by the base role. So use the canView* helpers to decide what to *show*,
// and the canAct* helpers to decide what to *enable*.
import type { User } from "@/lib/api";

type U = Pick<User, "role" | "is_admin_viewer" | "is_reviewer"> | null | undefined;

// ── Acting (write) permissions — base role only ──────────────────────────────
export const canActAdmin = (u: U): boolean => u?.role === "admin";
export const canActChair = (u: U): boolean => u?.role === "admin" || u?.role === "program_chair";

// ── Viewing (read) permissions — base role OR the Admin Viewer flag ───────────
export const canViewAdmin = (u: U): boolean => !!u && (canActAdmin(u) || !!u.is_admin_viewer);
export const canViewAll = (u: U): boolean => !!u && (canActChair(u) || !!u.is_admin_viewer);

// True when the user is in the admin area purely as a read-only Admin Viewer for
// a given surface — i.e. they can see it but cannot act on it. Used to show the
// read-only banner and to disable controls.
export const isReadOnlyAdmin = (u: U): boolean => !canActChair(u) && !!u?.is_admin_viewer;

// May enter the /admin area at all (staff, reviewers, or admin viewers).
export const canEnterAdmin = (u: U): boolean =>
  !!u && (canViewAll(u) || u.role === "reviewer" || !!u.is_reviewer || !!u.is_admin_viewer);
