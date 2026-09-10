"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  submissions as submissionsApi,
  reviews as reviewsApi,
  admin,
  type Submission,
  type Review,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/submission/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ClipboardCheck, Loader2 } from "lucide-react";

// Statuses at which a reviewer can be newly assigned (mirrors the backend rule
// in services/review.assign_reviewer). Existing assignments can always be
// removed regardless of status.
const ASSIGNABLE = new Set(["submitted", "under_review"]);

// Submissions with no reviews to show and no ability to assign are hidden.
const HIDDEN_STATUSES = new Set(["draft"]);

type CellState = "own" | "completed" | "pending" | "assignable" | "locked";

const cellKey = (submissionId: string, reviewerId: string) => `${submissionId}:${reviewerId}`;

export default function AssignReviewersPage() {
  const { user } = useAuth();
  const [subs, setSubs] = useState<Submission[]>([]);
  const [reviewers, setReviewers] = useState<User[]>([]);
  const [reviewList, setReviewList] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      submissionsApi.list(),
      admin.getReviewers().catch(() => [] as User[]),
      reviewsApi.listAll().catch(() => [] as Review[]),
    ])
      .then(([subList, reviewerList, allReviews]) => {
        setSubs(subList);
        setReviewers(reviewerList);
        setReviewList(allReviews);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const reviewByPair = useMemo(() => {
    const m = new Map<string, Review>();
    for (const r of reviewList) m.set(cellKey(r.submission_id, r.reviewer_id), r);
    return m;
  }, [reviewList]);

  const rows = useMemo(
    () => subs.filter((s) => !HIDDEN_STATUSES.has(s.status)),
    [subs],
  );

  const cellState = (sub: Submission, reviewer: User): CellState => {
    if (reviewer.id === sub.presenting_author_id) return "own";
    const rev = reviewByPair.get(cellKey(sub.id, reviewer.id));
    if (rev) return rev.submitted_at ? "completed" : "pending";
    return ASSIGNABLE.has(sub.status) ? "assignable" : "locked";
  };

  const toggle = async (sub: Submission, reviewer: User) => {
    const key = cellKey(sub.id, reviewer.id);
    if (busy.has(key)) return;
    const state = cellState(sub, reviewer);
    if (state === "own" || state === "locked") return;

    const setBusyFor = (on: boolean) =>
      setBusy((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });

    setBusyFor(true);
    try {
      if (state === "assignable") {
        const rev = await reviewsApi.assign({ submission_id: sub.id, reviewer_id: reviewer.id });
        setReviewList((prev) => [...prev, rev]);
        // Assigning moves a submitted abstract to under_review on the backend.
        if (sub.status === "submitted") {
          setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, status: "under_review" } : s)));
        }
      } else {
        const rev = reviewByPair.get(key);
        if (!rev) return;
        if (rev.submitted_at && !confirm(
          `${reviewer.full_name} already submitted this review. Unassigning permanently deletes their feedback. Continue?`,
        )) {
          return;
        }
        await reviewsApi.unassign(rev.id);
        setReviewList((prev) => prev.filter((r) => r.id !== rev.id));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusyFor(false);
    }
  };

  if (user?.role !== "admin" && user?.role !== "program_chair") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins and program chairs can assign reviewers.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assign Reviewers</h1>
          <p className="text-sm text-slate-500">
            Toggle a cell to assign or unassign a reviewer for each submission.
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><Swatch cls="bg-white border-slate-300" /> Unassigned</span>
        <span className="flex items-center gap-1.5"><Swatch cls="bg-amber-400 border-amber-500" /> Assigned — waiting</span>
        <span className="flex items-center gap-1.5"><Swatch cls="bg-green-500 border-green-600" /> Review completed</span>
        <span className="flex items-center gap-1.5"><Swatch cls="bg-slate-100 border-slate-200" /> Own submission / not open</span>
      </div>

      {loading ? (
        <div className="h-72 rounded-lg bg-slate-200 animate-pulse" />
      ) : reviewers.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-500">
          No users have reviewer privileges yet. Grant them on the{" "}
          <Link href="/admin/users" className="text-indigo-600 underline">Users</Link> page.
        </CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-slate-500">
          No submissions to assign yet.
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left font-semibold text-slate-600 min-w-[16rem]">
                  Submission
                </th>
                {reviewers.map((r) => (
                  <th
                    key={r.id}
                    className="border-b border-slate-200 px-2 py-2 align-bottom text-center font-medium text-slate-600 min-w-[3.5rem]"
                    title={`${r.full_name} (@${r.username})`}
                  >
                    <div className="mx-auto max-w-[6rem] truncate">{r.full_name}</div>
                    <div className="text-[10px] font-normal text-slate-400 truncate">@{r.username}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((sub) => (
                <tr key={sub.id} className="even:bg-slate-50/40">
                  <td className="sticky left-0 z-10 bg-inherit border-r border-slate-200 px-3 py-2 min-w-[16rem]">
                    <Link
                      href={`/admin/abstracts/${sub.id}`}
                      className="font-medium text-slate-800 hover:text-indigo-600 line-clamp-2"
                    >
                      {sub.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={sub.status} />
                      <span className="text-xs text-slate-400 truncate">
                        {sub.presenting_author.full_name}
                      </span>
                    </div>
                  </td>
                  {reviewers.map((r) => {
                    const key = cellKey(sub.id, r.id);
                    const state = cellState(sub, r);
                    return (
                      <td key={r.id} className="border-b border-slate-100 text-center px-2 py-2">
                        <ReviewCell
                          state={state}
                          busy={busy.has(key)}
                          onClick={() => toggle(sub, r)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Swatch({ cls }: { cls: string }) {
  return <span className={`inline-block h-3.5 w-3.5 rounded border ${cls}`} />;
}

function ReviewCell({
  state,
  busy,
  onClick,
}: {
  state: CellState;
  busy: boolean;
  onClick: () => void;
}) {
  const disabled = state === "own" || state === "locked" || busy;

  const base = "inline-flex h-6 w-6 items-center justify-center rounded border transition-colors";
  const styles: Record<CellState, string> = {
    completed: "bg-green-500 border-green-600 text-white hover:bg-green-600",
    pending: "bg-amber-400 border-amber-500 text-white hover:bg-amber-500",
    assignable: "bg-white border-slate-300 hover:border-indigo-400 hover:bg-indigo-50",
    own: "bg-slate-100 border-slate-200 cursor-not-allowed",
    locked: "bg-slate-100 border-slate-200 cursor-not-allowed",
  };

  const label =
    state === "completed" ? "Review completed — click to unassign"
    : state === "pending" ? "Assigned, waiting for review — click to unassign"
    : state === "assignable" ? "Click to assign reviewer"
    : state === "own" ? "Reviewer's own submission"
    : "Submission not open for new assignments";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`${base} ${styles[state]}`}
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
      ) : state === "completed" || state === "pending" ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.29 6.8-6.8a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      ) : null}
    </button>
  );
}
