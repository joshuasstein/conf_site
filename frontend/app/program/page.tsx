"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { sessionApi, type ProgramSession, type ProgramSlot, SESSION_COLOR_CLASSES, type SessionColor } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar, ChevronDown, ChevronUp, Clock, MapPin, User, Coffee } from "lucide-react";

/** Presentation title. When a public abstract exists, clicking it opens a popup with the text. */
function AbstractTitle({ slot }: { slot: ProgramSlot }) {
  const [open, setOpen] = useState(false);
  const title = slot.abstract_title ?? "Untitled";

  if (!slot.abstract_text) {
    return <p className="font-medium text-slate-900">{title}</p>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-medium text-slate-900 hover:text-indigo-700 hover:underline"
      >
        {title}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {slot.presenter_name}
              {slot.presenter_institution ? ` · ${slot.presenter_institution}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {slot.abstract_text}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { format, parseISO } from "date-fns";

/** Card + badge classes for a session, from its configured color (with a safe fallback). */
function sessionColors(session: ProgramSession): { card: string; badge: string } {
  const color = (session.session_type_color ?? "indigo") as SessionColor;
  return SESSION_COLOR_CLASSES[color] ?? SESSION_COLOR_CLASSES.indigo;
}

function groupByDate(sessions: ProgramSession[]): Record<string, ProgramSession[]> {
  const groups: Record<string, ProgramSession[]> = {};
  for (const session of sessions) {
    const key = session.session_date ?? "Unscheduled";
    if (!groups[key]) groups[key] = [];
    groups[key].push(session);
  }
  return groups;
}

function SlotRow({ slot, index }: { slot: ProgramSlot; index: number }) {
  const slotLabel = slot.slot_type_label ?? slot.slot_type;
  const hasSubmission = !!(slot.abstract_title || slot.presenter_name);

  // Non-presentation slots (Q&A, discussion, or any custom slot without a
  // submission) render as a simple italic label row.
  if (!hasSubmission) {
    return (
      <div className="py-2.5 flex items-center gap-3 text-slate-500 italic text-sm">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">{slot.slot_order}</span>
        {slotLabel}
        {slot.duration_minutes && <span className="ml-auto text-xs text-slate-400">{slot.duration_minutes} min</span>}
      </div>
    );
  }
  const isPoster = slot.slot_type === "poster" || slot.poster_number != null || slot.board_number != null;
  if (isPoster) {
    return (
      <div className="py-3 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {slot.poster_number ?? slot.slot_order}
        </span>
        <div className="flex-1 min-w-0">
          <AbstractTitle slot={slot} />
          <p className="text-sm text-slate-500">
            {slot.presenter_name}
            {slot.presenter_institution && <span className="text-slate-400"> · {slot.presenter_institution}</span>}
          </p>
          {slot.board_number && <p className="text-xs text-slate-400">Board {slot.board_number}</p>}
        </div>
      </div>
    );
  }
  // Default: talk
  return (
    <div className="py-3 flex items-start gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
        {slot.slot_order}
      </span>
      <div className="flex-1 min-w-0">
        <AbstractTitle slot={slot} />
        <p className="text-sm text-slate-500">
          {slot.presenter_name}
          {slot.presenter_institution && <span className="text-slate-400"> · {slot.presenter_institution}</span>}
        </p>
      </div>
      {slot.duration_minutes && (
        <span className="shrink-0 text-xs text-slate-400">{slot.duration_minutes} min</span>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: ProgramSession }) {
  const isNoSlot = session.session_type_has_slots === false;
  const colors = sessionColors(session);
  const hasSlots = !isNoSlot && session.slots.length > 0;
  const [expanded, setExpanded] = useState(true);

  if (isNoSlot) {
    return (
      <div className={`rounded-lg border border-dashed px-4 py-3 flex items-center gap-3 ${colors.card}`}>
        <Coffee className="h-5 w-5 text-slate-400 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-slate-700">{session.title}</p>
          {session.description && <p className="text-sm text-slate-500">{session.description}</p>}
        </div>
        <div className="text-sm text-slate-500 flex items-center gap-1 shrink-0">
          <Clock className="h-4 w-4" />
          {session.start_time} – {session.end_time}
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${colors.card}`}>
      <div
        className={`px-6 pt-5 ${hasSlots ? "pb-3" : "pb-5"} ${hasSlots ? "cursor-pointer select-none" : ""}`}
        onClick={hasSlots ? () => setExpanded((v) => !v) : undefined}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-slate-900">{session.title}</h3>
            {session.description && (
              <p className="text-sm text-slate-500 mt-1">{session.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {session.session_type && (
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors.badge}`}>
                {session.session_type_label ?? session.session_type}
              </span>
            )}
            {hasSlots && (
              expanded
                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                : <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-500 mt-2">
          {session.start_time && session.end_time && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {session.start_time} – {session.end_time}
            </span>
          )}
          {session.room && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" />
              {session.room}
            </span>
          )}
          {session.chair_name && (
            <span className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              Chair: {session.chair_name}
            </span>
          )}
        </div>
      </div>
      {hasSlots && expanded && (
        <div className="px-6 pb-4">
          <div className="divide-y divide-slate-100">
            {[...session.slots]
              .sort((a, b) => a.slot_order - b.slot_order)
              .map((slot, idx) => (
                <SlotRow key={slot.slot_order} slot={slot} index={idx} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProgramPage() {
  const [sessions, setSessions] = useState<ProgramSession[]>([]);
  const [confInfo, setConfInfo] = useState<{ conference_name: string; location?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      sessionApi.program().catch(() => [] as ProgramSession[]),
      sessionApi.conferenceInfo().catch(() => null),
    ]).then(([sess, info]) => {
      setSessions(sess);
      setConfInfo(info);
    }).finally(() => setLoading(false));
  }, []);

  const grouped = groupByDate(sessions);
  const dates = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image src="/pvpmc_logo.png" alt="PVPMC Workshop" width={130} height={26} style={{ objectFit: "contain" }} priority />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">Sign in</Link>
            <Link href="/register" className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-md hover:bg-indigo-700 transition-colors">
              Register
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-1">
            {confInfo?.conference_name ?? "Conference Program"}
          </h1>
          {confInfo?.location && (
            <p className="text-slate-500 text-base mb-1">{confInfo.location}</p>
          )}
          {!loading && (
            <p className="text-slate-400 text-sm">
              {sessions.length === 0
                ? "The program has not been published yet. Check back later."
                : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} scheduled`}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-40 rounded-lg bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : dates.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="h-16 w-16 text-slate-200 mx-auto mb-4" />
            <p className="text-slate-400">No sessions published yet.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {dates.map((date) => (
              <div key={date}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <h2 className="text-lg font-semibold text-slate-700 shrink-0">
                    {date === "Unscheduled" ? "Unscheduled" : format(parseISO(date), "EEEE, MMMM d, yyyy")}
                  </h2>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <div className="space-y-4">
                  {grouped[date]
                    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
                    .map((session) => (
                      <SessionCard key={session.id} session={session} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
