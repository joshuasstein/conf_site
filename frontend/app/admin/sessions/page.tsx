"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sessionApi, type Session } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, Calendar, Clock, MapPin, Eye, EyeOff, Layers } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function AdminSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    sessionApi
      .list()
      .then(setSessions)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load sessions";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));

    // Session type keys are configurable; map each to its current label so the
    // list reflects renames (e.g. "lunch" -> "Meal").
    sessionApi
      .conferenceInfo()
      .then((info) =>
        setTypeLabels(Object.fromEntries((info.session_types ?? []).map((t) => [t.key, t.label]))),
      )
      .catch(() => {
        /* non-fatal: fall back to the raw key */
      });
  }, []);

  const handleTogglePublish = async (session: Session) => {
    setToggling(session.id);
    try {
      const updated = await sessionApi.update(session.id, {
        is_published: !session.is_published,
      });
      setSessions((prev) => prev.map((s) => (s.id === session.id ? updated : s)));
      toast({
        title: updated.is_published ? "Published" : "Unpublished",
        description: `${session.title} is now ${updated.is_published ? "public" : "hidden"}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === "admin" && (
            <Button asChild variant="outline">
              <Link href="/admin/sessions/templates">
                <Layers className="h-4 w-4" />
                Templates
              </Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/admin/sessions/new">
              <PlusCircle className="h-4 w-4" />
              New Session
            </Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="font-medium text-slate-700 mb-1">No sessions yet</p>
          <p className="text-sm mb-4">Create sessions to organize accepted presentations.</p>
          <Button asChild>
            <Link href="/admin/sessions/new">
              <PlusCircle className="h-4 w-4" />
              Create first session
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {[...sessions]
            .sort((a, b) =>
              (a.session_date ?? "").localeCompare(b.session_date ?? "") ||
              (a.start_time ?? "").localeCompare(b.start_time ?? "")
            )
            .map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <Link href={`/admin/sessions/${session.id}`}>
                      <CardTitle className="text-base hover:text-indigo-600 transition-colors cursor-pointer">
                        {session.title}
                      </CardTitle>
                    </Link>
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      {session.session_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {format(parseISO(session.session_date), "MMM d, yyyy")}
                        </span>
                      )}
                      {session.start_time && session.end_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          {session.start_time} – {session.end_time}
                        </span>
                      )}
                      {session.room && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {session.room}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={session.is_published ? "success" : "secondary"}>
                      {session.is_published ? "Published" : "Draft"}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={toggling === session.id}
                      onClick={() => handleTogglePublish(session)}
                    >
                      {session.is_published ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {session.is_published ? "Unpublish" : "Publish"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{(session.slots ?? []).length} slot{(session.slots ?? []).length !== 1 ? "s" : ""}</span>
                  {session.max_slots && <span>/ {session.max_slots} max</span>}
                  {session.chair_name && <span>Chair: {session.chair_name}</span>}
                  {session.session_type && (
                    <span>{typeLabels[session.session_type] ?? session.session_type}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
