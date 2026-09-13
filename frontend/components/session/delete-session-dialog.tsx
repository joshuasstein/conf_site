"use client";

import { useEffect, useState } from "react";
import {
  sessionApi,
  type SessionDeletionImpact,
  type SubmissionStatus,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/submission/status-badge";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

type AdvancedStatus = "decided" | "withdrawn";

interface Props {
  session: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => void;
}

export function DeleteSessionDialog({ session, open, onOpenChange, onDeleted }: Props) {
  const [impact, setImpact] = useState<SessionDeletionImpact | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [advancedStatus, setAdvancedStatus] = useState<AdvancedStatus>("decided");

  useEffect(() => {
    if (!open || !session) return;
    setImpact(null);
    setAdvancedStatus("decided");
    setLoading(true);
    sessionApi
      .deletionImpact(session.id)
      .then(setImpact)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load session details";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [open, session]);

  const hasAdvanced = (impact?.advanced.length ?? 0) > 0;

  const handleConfirm = async () => {
    if (!session) return;
    setDeleting(true);
    try {
      await sessionApi.remove(session.id, hasAdvanced ? advancedStatus : undefined);
      toast({ title: "Deleted", description: `${session.title} removed.` });
      onDeleted(session.id);
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete session";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Delete session
          </DialogTitle>
          <DialogDescription>
            {session ? (
              <>
                You&apos;re about to delete <strong>{session.title}</strong>. This cannot be undone.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm text-slate-700">
          {loading ? (
            <div className="h-16 rounded bg-slate-100 animate-pulse" />
          ) : impact ? (
            <>
              <ul className="list-disc pl-5 space-y-1 text-slate-600">
                <li>
                  {impact.slot_count} slot{impact.slot_count !== 1 ? "s" : ""} will be removed.
                </li>
                {impact.assigned_count > 0 && (
                  <li>
                    {impact.assigned_count} assigned abstract
                    {impact.assigned_count !== 1 ? "s" : ""} will return to{" "}
                    <strong>decided</strong> so {impact.assigned_count !== 1 ? "they" : "it"} can be
                    re-slotted.
                  </li>
                )}
              </ul>

              {hasAdvanced && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-amber-800">
                    {impact.advanced.length} abstract
                    {impact.advanced.length !== 1 ? "s have" : " has"} already progressed past
                    assignment. Choose what should happen to{" "}
                    {impact.advanced.length !== 1 ? "them" : "it"}:
                  </p>
                  <ul className="space-y-1">
                    {impact.advanced.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {a.title}
                          {a.presenter_name ? (
                            <span className="text-slate-400"> — {a.presenter_name}</span>
                          ) : null}
                        </span>
                        <StatusBadge status={a.status as SubmissionStatus} className="shrink-0" />
                      </li>
                    ))}
                  </ul>
                  <div>
                    <Label htmlFor="advanced-status" className="text-amber-800">
                      New status for these abstracts
                    </Label>
                    <Select
                      value={advancedStatus}
                      onValueChange={(v) => setAdvancedStatus(v as AdvancedStatus)}
                    >
                      <SelectTrigger id="advanced-status" className="mt-1 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="decided">
                          Return to decided (re-assignable)
                        </SelectItem>
                        <SelectItem value="withdrawn">Withdraw from the program</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-slate-500">Loading session details…</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            loading={deleting}
            disabled={loading}
            onClick={handleConfirm}
          >
            Delete session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
