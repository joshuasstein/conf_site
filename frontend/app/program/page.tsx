import Link from "next/link";
import { sessionApi, type ProgramSession } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, MapPin, User, FileText } from "lucide-react";
import { format, parseISO } from "date-fns";

// This is a Server Component — no auth needed for the program
async function getProgram(): Promise<ProgramSession[]> {
  try {
    return await sessionApi.program();
  } catch {
    return [];
  }
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

export default async function ProgramPage() {
  const sessions = await getProgram();
  const grouped = groupByDate(sessions);
  const dates = Object.keys(grouped).sort();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Simple public nav */}
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-indigo-600 font-bold text-lg">
            <FileText className="h-5 w-5" />
            ConfSite
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-indigo-600 text-white px-4 py-1.5 rounded-md hover:bg-indigo-700 transition-colors"
            >
              Register
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Conference Program</h1>
          <p className="text-slate-500">
            {sessions.length === 0
              ? "The program has not been published yet. Check back later."
              : `${sessions.length} session${sessions.length !== 1 ? "s" : ""} scheduled`}
          </p>
        </div>

        {dates.length === 0 ? (
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
                    {date === "Unscheduled"
                      ? "Unscheduled"
                      : format(parseISO(date), "EEEE, MMMM d, yyyy")}
                  </h2>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <div className="space-y-4">
                  {grouped[date]
                    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""))
                    .map((session) => (
                      <Card key={session.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div>
                              <CardTitle className="text-lg">{session.title}</CardTitle>
                              {session.description && (
                                <p className="text-sm text-slate-500 mt-1">{session.description}</p>
                              )}
                            </div>
                            {session.session_type && (
                              <Badge variant="indigo">{session.session_type}</Badge>
                            )}
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
                        </CardHeader>
                        {session.slots.length > 0 && (
                          <CardContent className="pt-0">
                            <div className="divide-y divide-slate-100">
                              {[...session.slots]
                                .sort((a, b) => a.slot_order - b.slot_order)
                                .map((slot) => (
                                  <div key={slot.slot_order} className="py-3 flex items-start gap-3">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                                      {slot.slot_order}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-slate-900">
                                        {slot.abstract_title}
                                      </p>
                                      <p className="text-sm text-slate-500">
                                        {slot.presenter_name}
                                      </p>
                                      {false && (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {[""].slice(0, 4).map((kw) => (
                                              <span
                                                key={kw}
                                                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                                              >
                                                {kw}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                    </div>
                                    {slot.duration_minutes && (
                                      <span className="shrink-0 text-xs text-slate-400">
                                        {slot.duration_minutes} min
                                      </span>
                                    )}
                                  </div>
                                ))}
                            </div>
                          </CardContent>
                        )}
                      </Card>
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
