"use client";

import { useState } from "react";
import {
  broadcast,
  type AudienceFilter,
  type BroadcastPreview,
  type SubmissionStatus,
  type UserRole,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Send, Users, Eye, Loader2 } from "lucide-react";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "submitter", label: "Submitters" },
  { value: "reviewer", label: "Reviewers" },
  { value: "program_chair", label: "Program Chairs" },
  { value: "admin", label: "Admins" },
];

const STATUSES: { value: SubmissionStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "decided", label: "Decided" },
  { value: "assigned_to_session", label: "Assigned to Session" },
  { value: "notified", label: "Notified" },
  { value: "confirmed", label: "Confirmed" },
  { value: "files_submitted", label: "Files Submitted" },
  { value: "withdrawn", label: "Withdrawn" },
];

const ACTIVE_STATUSES: SubmissionStatus[] = [
  "submitted", "under_review", "decided", "assigned_to_session",
  "notified", "confirmed", "files_submitted",
];

type Verified = "any" | "verified" | "unverified";

export default function AdminEmailPage() {
  const [roles, setRoles] = useState<Set<UserRole>>(new Set());
  const [statuses, setStatuses] = useState<Set<SubmissionStatus>>(new Set());
  const [verified, setVerified] = useState<Verified>("any");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);

  const buildFilters = (): AudienceFilter => ({
    roles: [...roles],
    submission_statuses: [...statuses],
    email_verified: verified === "any" ? null : verified === "verified",
  });

  // Any filter change invalidates a prior preview so the shown count can't go stale.
  const invalidate = () => setPreview(null);

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
    invalidate();
  };

  const applyPreset = (r: UserRole[], s: SubmissionStatus[]) => {
    setRoles(new Set(r));
    setStatuses(new Set(s));
    setVerified("any");
    invalidate();
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await broadcast.preview(buildFilters()));
    } catch (err: unknown) {
      toast({
        title: "Preview failed",
        description: err instanceof Error ? err.message : "Failed to load recipients",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSend = async () => {
    if (!preview) return;
    if (!window.confirm(
      `Send this email to ${preview.count} recipient${preview.count !== 1 ? "s" : ""}? This cannot be undone.`
    )) return;

    setSending(true);
    try {
      const res = await broadcast.send(buildFilters(), subject, body);
      toast({
        title: "Emails queued",
        description: `${res.queued} email${res.queued !== 1 ? "s" : ""} queued for delivery.`,
      });
      setSubject("");
      setBody("");
      setPreview(null);
    } catch (err: unknown) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message : "Failed to send",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const canSend = !!preview && preview.count > 0 && subject.trim() !== "" && body.trim() !== "";

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <Send className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Email Users</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Choose an audience with filters, preview who it matches, then compose and send.
      </p>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-sm text-slate-500 self-center mr-1">Quick pick:</span>
        <Button variant="outline" size="sm" onClick={() => applyPreset(["reviewer"], [])}>All reviewers</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset([], ACTIVE_STATUSES)}>Active submissions</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset([], ["notified"])}>Notified, not confirmed</Button>
        <Button variant="outline" size="sm" onClick={() => applyPreset(["submitter"], [])}>All submitters</Button>
      </div>

      {/* Filters */}
      <Card className="mb-5">
        <CardHeader>
          <CardTitle className="text-base">Audience filters</CardTitle>
          <CardDescription>Filters combine with AND. Leave all empty to reach everyone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label className="mb-2 block">Role</Label>
            <div className="flex flex-wrap gap-4">
              {ROLES.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                    checked={roles.has(r.value)}
                    onChange={() => toggle(roles, setRoles, r.value)} />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Has a submission in status</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {STATUSES.map((s) => (
                <label key={s.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300"
                    checked={statuses.has(s.value)}
                    onChange={() => toggle(statuses, setStatuses, s.value)} />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Email verification</Label>
            <div className="flex gap-4">
              {(["any", "verified", "unverified"] as Verified[]).map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer capitalize">
                  <input type="radio" name="verified" className="h-4 w-4"
                    checked={verified === v}
                    onChange={() => { setVerified(v); invalidate(); }} />
                  {v}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button variant="outline" onClick={handlePreview} loading={previewing}>
              <Eye className="h-4 w-4" />
              Preview recipients
            </Button>
            {preview && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Users className="h-4 w-4 text-indigo-600" />
                {preview.count} recipient{preview.count !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {preview && preview.sample.length > 0 && (
            <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm max-h-48 overflow-y-auto">
              <div className="text-xs text-slate-500 mb-2">
                Showing {preview.sample.length} of {preview.count}:
              </div>
              <ul className="space-y-1">
                {preview.sample.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="text-slate-700 truncate">{r.full_name}</span>
                    <span className="text-slate-400 truncate">{r.email}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview && preview.count === 0 && (
            <p className="text-sm text-amber-600">No users match these filters.</p>
          )}
        </CardContent>
      </Card>

      {/* Compose */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compose</CardTitle>
          <CardDescription>
            Plain text. Use <code className="text-xs bg-slate-100 px-1 rounded">{"{full_name}"}</code> to
            personalize — it&apos;s replaced with each recipient&apos;s name. The conference footer is added automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Reminder: please confirm your presentation" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Message</Label>
            <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)}
              rows={10} placeholder={"Dear {full_name},\n\n…\n\nThank you,\nThe Program Committee"}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {preview
                ? `Ready to send to ${preview.count} recipient${preview.count !== 1 ? "s" : ""}.`
                : "Preview recipients before sending."}
            </p>
            <Button onClick={handleSend} disabled={!canSend} loading={sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {preview ? `Send to ${preview.count}` : "Send"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
