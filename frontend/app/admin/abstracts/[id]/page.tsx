"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  submissions,
  admin,
  reviews as reviewsApi,
  sessionApi,
  type Submission,
  type Review,
  type Session,
  type SubmissionStatus,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/submission/status-badge";
import { ActionButtons } from "@/components/submission/action-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, User, Star } from "lucide-react";

const STATUSES: SubmissionStatus[] = [
  "draft", "submitted", "under_review", "decided",
  "assigned_to_session", "notified", "confirmed", "files_submitted", "withdrawn",
];

const overrideSchema = z.object({
  status: z.enum(STATUSES as [SubmissionStatus, ...SubmissionStatus[]]),
  reason: z.string().optional(),
});

type OverrideForm = z.infer<typeof overrideSchema>;

const assignSchema = z.object({
  session_id: z.string().min(1, "Select a session"),
  slot_order: z.coerce.number().min(1),
  duration_minutes: z.coerce.number().min(5).optional(),
});

type AssignForm = z.infer<typeof assignSchema>;

export default function AdminAbstractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionReviews, setSubmissionReviews] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const {
    register: regOverride,
    handleSubmit: handleOverride,
    control: controlOverride,
    formState: { isSubmitting: overriding },
  } = useForm<OverrideForm>({ resolver: zodResolver(overrideSchema) });

  const {
    register: regAssign,
    handleSubmit: handleAssign,
    control: controlAssign,
    formState: { isSubmitting: assigning },
  } = useForm<AssignForm>({ resolver: zodResolver(assignSchema), defaultValues: { slot_order: 1 } });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      submissions.get(id),
      reviewsApi.forSubmission(id).catch(() => [] as Review[]),
      sessionApi.list().catch(() => [] as Session[]),
    ])
      .then(([sub, revs, sess]) => {
        setSubmission(sub);
        setSubmissionReviews(revs);
        setSessions(sess);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const onOverride = async (data: OverrideForm) => {
    if (!id) return;
    try {
      const updated = await admin.overrideStatus(id, {
        status: data.status,
        reason: data.reason,
      });
      setSubmission(updated);
      toast({ title: "Status updated", description: `Status changed to ${data.status}.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const onAssign = async (data: AssignForm) => {
    try {
      await sessionApi.addSlot(data.session_id, {
        submission_id: id,
        slot_order: data.slot_order,
        duration_minutes: data.duration_minutes,
      });
      toast({ title: "Assigned", description: "Submission added to session." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-slate-200 animate-pulse" />
        <div className="h-64 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Abstract not found.</p>
        <Button asChild className="mt-4"><Link href="/admin/abstracts">Back</Link></Button>
      </div>
    );
  }

  const canOverride = user?.role === "admin";
  const canAssign = user?.role === "admin" || user?.role === "program_chair";

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin/abstracts">
          <ArrowLeft className="h-4 w-4" />
          Back to abstracts
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{submission.title}</h1>
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge status={submission.status} />
            {submission.track && (
              <span className="text-xs text-slate-500">Track: {submission.track}</span>
            )}
          </div>
        </div>
        {user && (
          <ActionButtons
            submission={submission}
            userRole={user.role}
            userId={user.id}
            onUpdate={setSubmission}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Abstract text */}
          <Card>
            <CardHeader>
              <CardTitle>Abstract</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {submission.abstract_text}
              </p>
            </CardContent>
          </Card>

          {/* Reviews */}
          <Card>
            <CardHeader>
              <CardTitle>Reviews ({submissionReviews.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {submissionReviews.length === 0 ? (
                <p className="text-sm text-slate-500">No reviews yet.</p>
              ) : (
                <div className="space-y-4">
                  {submissionReviews.map((rev) => (
                    <div key={rev.id} className="border border-slate-200 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <User className="h-4 w-4" />
                          <span>{`Reviewer ${rev.reviewer_id}`}</span>
                        </div>
                        {rev.score !== undefined && (
                          <div className="flex items-center gap-1 text-sm font-medium">
                            <Star className="h-4 w-4 text-yellow-500" />
                            {rev.score}/10
                          </div>
                        )}
                      </div>
                      {rev.recommendation && (
                        <p className="text-sm font-medium text-slate-700">
                          Recommendation: {rev.recommendation}
                        </p>
                      )}
                      {rev.comments && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase mb-1">Comments</p>
                          <p className="text-sm text-slate-700">{rev.comments}</p>
                        </div>
                      )}
                      {rev.comments_for_author && (
                        <div>
                          <p className="text-xs text-slate-400 uppercase mb-1">For author</p>
                          <p className="text-sm text-slate-700">{rev.comments_for_author}</p>
                        </div>
                      )}
                      {rev.submitted_at && (
                        <p className="text-xs text-slate-400">
                          Submitted {format(new Date(rev.submitted_at), "MMM d, yyyy")}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Metadata */}
          <Card>
            <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-slate-400 uppercase mb-0.5">Presenter</p>
                <p className="text-slate-700">{submission.presenting_author.full_name}</p>
                <p className="text-slate-400 text-xs">{submission.presenting_author.email}</p>
                {submission.presenting_author.institution && (
                  <p className="text-slate-400 text-xs">{submission.presenting_author.institution}</p>
                )}
              </div>
              {submission.co_authors.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-0.5">Co-authors</p>
                  {submission.co_authors.map((ca) => (
                    <p key={ca.email} className="text-slate-700">{ca.name}{ca.institution && ` (${ca.institution})`}</p>
                  ))}
                </div>
              )}
              {submission.keywords.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 uppercase mb-1">Keywords</p>
                  <div className="flex flex-wrap gap-1">
                    {submission.keywords.map((kw) => (
                      <span key={kw} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{kw}</span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400 uppercase mb-0.5">Created</p>
                <p className="text-slate-700">{format(new Date(submission.submitted_at ?? submission.updated_at), "MMM d, yyyy")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Admin status override */}
          {canOverride && (
            <Card>
              <CardHeader><CardTitle>Override Status</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleOverride(onOverride)} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>New status</Label>
                    <Controller
                      name="status"
                      control={controlOverride}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status..." />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reason (optional)</Label>
                    <Textarea
                      rows={2}
                      placeholder="Reason for override..."
                      {...regOverride("reason")}
                    />
                  </div>
                  <Button type="submit" size="sm" loading={overriding} variant="destructive">
                    Override
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Assign to session */}
          {canAssign && sessions.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Assign to Session</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleAssign(onAssign)} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Session</Label>
                    <Controller
                      name="session_id"
                      control={controlAssign}
                      render={({ field }) => (
                        <Select value={field.value ?? ""} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select session..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sessions.map((sess) => (
                              <SelectItem key={sess.id} value={String(sess.id)}>
                                {sess.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Slot order</Label>
                      <input
                        type="number"
                        min={1}
                        className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
                        {...regAssign("slot_order")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Duration (min)</Label>
                      <input
                        type="number"
                        min={5}
                        placeholder="30"
                        className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
                        {...regAssign("duration_minutes")}
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm" loading={assigning}>
                    Assign
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
