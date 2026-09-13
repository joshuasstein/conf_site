"use client";

import { useEffect, useState } from "react";
import { sessionApi, type ProgramCheckResult } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { CheckCircle2, AlertTriangle, Clock, CalendarClock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function fmtDate(d: string): string {
  try {
    return format(parseISO(d), "EEEE, MMMM d, yyyy");
  } catch {
    return d;
  }
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function ProgramCheckDialog({ open, onOpenChange }: Props) {
  const [result, setResult] = useState<ProgramCheckResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setLoading(true);
    sessionApi
      .checkProgram()
      .then(setResult)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to check the program";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [open]);

  const clean = result && result.gaps.length === 0 && result.overlaps.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-600" />
            Program check
          </DialogTitle>
          <DialogDescription>
            Checks every session for unscheduled gaps within a day and for time overlaps between
            sessions that aren&apos;t part of the same parallel block.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {loading ? (
            <div className="h-24 rounded bg-slate-100 animate-pulse" />
          ) : !result ? null : (
            <>
              <p className="text-slate-500">
                Checked {result.checked_sessions} session{result.checked_sessions !== 1 ? "s" : ""} across{" "}
                {result.days_checked} day{result.days_checked !== 1 ? "s" : ""}.
              </p>

              {clean && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  No gaps or overlaps found — the schedule is contiguous.
                </div>
              )}

              {result.overlaps.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-red-700">
                    <AlertTriangle className="h-4 w-4" />
                    {result.overlaps.length} overlap{result.overlaps.length !== 1 ? "s" : ""}
                  </h3>
                  <ul className="space-y-2">
                    {result.overlaps.map((o, i) => (
                      <li key={i} className="rounded-md border border-red-200 bg-red-50 px-3 py-2">
                        <p className="text-slate-700">
                          <span className="font-medium">{o.session_a_title}</span> and{" "}
                          <span className="font-medium">{o.session_b_title}</span> overlap
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {fmtDate(o.session_date)} · {o.start.slice(0, 5)}–{o.end.slice(0, 5)} (
                          {fmtDuration(o.minutes)})
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.gaps.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 font-semibold text-amber-700">
                    <Clock className="h-4 w-4" />
                    {result.gaps.length} gap{result.gaps.length !== 1 ? "s" : ""}
                  </h3>
                  <ul className="space-y-2">
                    {result.gaps.map((g, i) => (
                      <li key={i} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                        <p className="text-slate-700">
                          Nothing scheduled {g.start.slice(0, 5)}–{g.end.slice(0, 5)}{" "}
                          <span className="text-slate-400">({fmtDuration(g.minutes)})</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">{fmtDate(g.session_date)}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
