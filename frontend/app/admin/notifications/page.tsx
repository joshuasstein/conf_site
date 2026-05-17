"use client";

import { useEffect, useState } from "react";
import { admin, submissions, type Submission } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "@/components/submission/status-badge";
import { toast } from "@/hooks/use-toast";
import { Bell, Send, FlaskConical, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const TEST_TEMPLATES = [
  { value: "submission-confirmation", label: "Submission confirmation" },
  { value: "decision-accepted", label: "Decision — accepted" },
  { value: "decision-rejected", label: "Decision — rejected" },
  { value: "review-assignment", label: "Review assignment" },
  { value: "file-submission-reminder", label: "File submission reminder" },
  { value: "confirmation-reminder", label: "Confirmation reminder" },
];

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const [decidedSubs, setDecidedSubs] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [testTemplate, setTestTemplate] = useState(TEST_TEMPLATES[0].value);
  const [testSending, setTestSending] = useState(false);
  const [resendStatus, setResendStatus] = useState<{
    api_key_set: boolean;
    resend_reachable: boolean;
    resend_error: string | null;
    from_address: string | null;
    from_name: string | null;
    from_address_configured: boolean;
  } | null>(null);
  const [statusChecking, setStatusChecking] = useState(false);

  useEffect(() => {
    submissions
      .list()
      .then((all) => setDecidedSubs(all.filter((s) => s.status === "decided")))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCheckStatus = async () => {
    setStatusChecking(true);
    try {
      const s = await admin.resendStatus();
      setResendStatus(s);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setStatusChecking(false);
    }
  };

  const handleBulkNotify = async (dry_run: boolean) => {
    setNotifying(true);
    try {
      const result = await admin.bulkNotify(dry_run);
      toast({
        title: dry_run ? "Dry run complete" : "Notifications sent",
        description: `${result.notified} notification${result.notified !== 1 ? "s" : ""} ${dry_run ? "would be sent" : "sent"}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setNotifying(false);
    }
  };

  const handleSendTest = async () => {
    setTestSending(true);
    try {
      await admin.sendTestEmail(testTemplate);
      toast({ title: "Test email queued", description: "Check your inbox in a moment." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setTestSending(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins can send bulk notifications.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Bell className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bulk Notifications</h1>
          <p className="text-sm text-slate-500">
            Send acceptance/rejection emails to all &quot;decided&quot; submissions
          </p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Ready to notify</CardTitle>
          <CardDescription>
            These submissions have a decision but haven&apos;t been notified yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 rounded bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : decidedSubs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No decided submissions pending notification.
            </p>
          ) : (
            <div className="space-y-2">
              {decidedSubs.slice(0, 10).map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                >
                  <span className="text-sm text-slate-700 truncate flex-1 mr-4">{sub.title}</span>
                  <StatusBadge status={sub.status} />
                </div>
              ))}
              {decidedSubs.length > 10 && (
                <p className="text-xs text-slate-400 pt-1">
                  +{decidedSubs.length - 10} more
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send Notifications</CardTitle>
          <CardDescription>
            Run a dry run first to see how many emails would be sent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-800">
              <strong>Warning:</strong> Sending notifications is irreversible. Each submitter will receive an email about their submission outcome.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              loading={notifying}
              onClick={() => handleBulkNotify(true)}
            >
              <Send className="h-4 w-4" />
              Dry Run
            </Button>
            <Button
              loading={notifying}
              disabled={decidedSubs.length === 0}
              onClick={() => handleBulkNotify(false)}
            >
              <Bell className="h-4 w-4" />
              Send to {decidedSubs.length} submitter{decidedSubs.length !== 1 ? "s" : ""}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Email Setup Status</CardTitle>
          <CardDescription>Verify that Resend is reachable and the sender is configured.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" loading={statusChecking} onClick={handleCheckStatus}>
            Check now
          </Button>
          {resendStatus && (
            <div className="space-y-2 text-sm">
              {[
                { ok: resendStatus.api_key_set, label: "RESEND_API_KEY set" },
                { ok: resendStatus.resend_reachable, label: "Resend API reachable" },
                { ok: resendStatus.from_address_configured, label: `From address: ${resendStatus.from_address ?? "not set"}` },
              ].map(({ ok, label }) => (
                <div key={label} className="flex items-center gap-2">
                  {ok
                    ? <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                  <span className={ok ? "text-slate-700" : "text-red-700"}>{label}</span>
                </div>
              ))}
              {resendStatus.resend_error && (
                <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2 mt-1">
                  <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-red-700 font-mono text-xs break-all">{resendStatus.resend_error}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-indigo-600" />
            Test Email
          </CardTitle>
          <CardDescription>
            Send a sample email with placeholder data to your own address to preview a template.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-center">
            <select
              value={testTemplate}
              onChange={(e) => setTestTemplate(e.target.value)}
              className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TEST_TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <Button
              variant="outline"
              loading={testSending}
              onClick={handleSendTest}
            >
              <Send className="h-4 w-4" />
              Send to me
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
