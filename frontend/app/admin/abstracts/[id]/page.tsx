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
  filesApi,
  decisions,
  RECOMMENDATION_LABELS,
  type DecisionOutcome,
  type Submission,
  type Review,
  type Session,
  type SubmissionStatus,
  type User,
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
import { ArrowLeft, UserIcon, Star, File, Download, Loader2, Paperclip, Trash2 } from "lucide-react";

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

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(ft: string) {
  if (ft === "abstract_document") return "Document";
  if (ft === "final_presentation") return "Presentation";
  return "Poster";
}

function AdminAttachmentsCard({ submission, onAttachmentDeleted }: { submission: Submission; onAttachmentDeleted: (id: string) => void }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (att: Submission["attachments"][number]) => {
    if (!confirm(`Delete "${att.original_filename}"?`)) return;
    setDeleting(att.id);
    try {
      await filesApi.deleteAttachment(att.id);
      onAttachmentDeleted(att.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete file";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const handleDownload = async (att: Submission["attachments"][number]) => {
    setDownloading(att.id);
    try {
      const { download_url } = await filesApi.downloadUrl(att.id);
      const res = await fetch(download_url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download file";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const fileRow = (att: Submission["attachments"][number]) => (
    <li key={att.id} className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <File className="h-4 w-4 text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-700 truncate">{att.original_filename}</p>
          <p className="text-xs text-slate-400">
            {fileTypeLabel(att.file_type)} · {formatSize(att.size_bytes)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => handleDownload(att)} disabled={downloading === att.id}>
          {downloading === att.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-red-500"
          onClick={() => handleDelete(att)}
          disabled={deleting === att.id}
        >
          {deleting === att.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
      </div>
    </li>
  );

  const docs = submission.attachments.filter((a) => a.file_type === "abstract_document");
  const finals = submission.attachments.filter((a) => a.file_type !== "abstract_document");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Files
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Abstract</h4>
          {docs.length > 0 ? (
            <ul className="space-y-2">{docs.map(fileRow)}</ul>
          ) : (
            <p className="text-sm text-slate-400">No abstract document uploaded.</p>
          )}
        </section>
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Presentation</h4>
          {finals.length > 0 ? (
            <ul className="space-y-2">{finals.map(fileRow)}</ul>
          ) : (
            <p className="text-sm text-slate-400">No presentation files uploaded yet.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export default function AdminAbstractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submissionReviews, setSubmissionReviews] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [reviewers, setReviewers] = useState<User[]>([]);
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<DecisionOutcome | null>(null);

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
      admin.getReviewers().catch(() => [] as User[]),
    ])
      .then(([sub, revs, sess, reviewerList]) => {
        setSubmission(sub);
        setSubmissionReviews(revs);
        setSessions(sess);
        setReviewers(reviewerList);
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

  const onAssignReviewer = async () => {
    if (!id || !selectedReviewerId) return;
    setAssigningReviewer(true);
    try {
      const review = await reviewsApi.assign({ submission_id: id, reviewer_id: selectedReviewerId });
      setSubmissionReviews((prev) => [...prev, review]);
      setSelectedReviewerId("");
      toast({ title: "Reviewer assigned", description: "Notify them from the Notifications page." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign reviewer";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setAssigningReviewer(false);
    }
  };

  const onUnassignReviewer = async (rev: Review) => {
    const name = reviewers.find((r) => r.id === rev.reviewer_id)?.full_name ?? "this reviewer";
    const warn = rev.submitted_at ? " Their submitted review will be permanently deleted." : "";
    if (!confirm(`Unassign ${name}?${warn}`)) return;
    try {
      await reviewsApi.unassign(rev.id);
      setSubmissionReviews((prev) => prev.filter((r) => r.id !== rev.id));
      toast({ title: "Reviewer unassigned" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unassign reviewer";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const onDecide = async (outcome: DecisionOutcome) => {
    if (!id) return;
    setDeciding(outcome);
    try {
      await decisions.record(id, outcome);
      const updated = await submissions.get(id);
      setSubmission(updated);
      toast({
        title: "Decision recorded",
        description: outcome === "rejected" ? "Marked as rejected." : `Accepted as ${outcome}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to record decision";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDeciding(null);
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
  const canDecide = user?.role === "admin" || user?.role === "program_chair";

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
            basePath="/admin/abstracts"
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
                          <UserIcon className="h-4 w-4" />
                          <span>{reviewers.find((r) => r.id === rev.reviewer_id)?.full_name ?? `Reviewer ${rev.reviewer_id.slice(0, 8)}`}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {rev.score != null && (
                            <div className="flex items-center gap-1 text-sm font-medium">
                              <Star className="h-4 w-4 text-yellow-500" />
                              {rev.score}/10
                            </div>
                          )}
                          {canAssign && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-400 hover:text-red-500"
                              title="Unassign reviewer"
                              onClick={() => onUnassignReviewer(rev)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {rev.recommendation && (
                        <p className="text-sm font-medium text-slate-700">
                          Recommended format: {RECOMMENDATION_LABELS[rev.recommendation] ?? rev.recommendation}
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

          {/* Attachments */}
          <AdminAttachmentsCard
            submission={submission}
            onAttachmentDeleted={(attachmentId) =>
              setSubmission((prev) =>
                prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev
              )
            }
          />
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

          {/* Assign reviewer */}
          {canAssign && (
            <Card>
              <CardHeader><CardTitle>Assign Reviewer</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {submissionReviews.length > 0 && (
                  <div className="text-sm text-slate-500 space-y-1">
                    {submissionReviews.map((rev) => (
                      <div key={rev.id} className="flex items-center gap-2">
                        <UserIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>{reviewers.find((r) => r.id === rev.reviewer_id)?.full_name ?? rev.reviewer_id.slice(0, 8)}</span>
                        {rev.submitted_at && <span className="text-xs text-green-600 ml-auto">Done</span>}
                      </div>
                    ))}
                  </div>
                )}
                {reviewers.length === 0 ? (
                  <p className="text-sm text-slate-400">No eligible reviewers yet.</p>
                ) : (
                  <div className="flex gap-2">
                    <Select value={selectedReviewerId} onValueChange={setSelectedReviewerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select reviewer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {reviewers
                          .filter((r) => !submissionReviews.some((rev) => rev.reviewer_id === r.id))
                          .map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.full_name}
                              {r.role !== "reviewer" && (
                                <span className="text-slate-400">
                                  {" "}— {r.role === "program_chair" ? "Program Chair" : "Admin"}
                                </span>
                              )}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      loading={assigningReviewer}
                      disabled={!selectedReviewerId}
                      onClick={onAssignReviewer}
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Decision — record accept/reject (admins & program chairs) */}
          {canDecide && submission.status === "under_review" && (
            <Card>
              <CardHeader><CardTitle>Decision</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-500">
                  Record the committee decision. This advances the submission to{" "}
                  <span className="font-medium">decided</span>.
                </p>
                <div className="flex flex-col gap-2">
                  <Button size="sm" loading={deciding === "oral"} disabled={deciding !== null} onClick={() => onDecide("oral")}>
                    Accept — Oral
                  </Button>
                  <Button size="sm" variant="outline" loading={deciding === "poster"} disabled={deciding !== null} onClick={() => onDecide("poster")}>
                    Accept — Poster
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:text-red-700"
                    loading={deciding === "rejected"}
                    disabled={deciding !== null}
                    onClick={() => onDecide("rejected")}
                  >
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

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
