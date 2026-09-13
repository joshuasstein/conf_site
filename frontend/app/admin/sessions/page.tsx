"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { sessionApi, type Session, type SessionGroupSummary } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteSessionDialog } from "@/components/session/delete-session-dialog";
import { ParallelBlockDialog } from "@/components/session/parallel-block-dialog";
import { ProgramCheckDialog } from "@/components/session/program-check-dialog";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, Calendar, Clock, MapPin, Eye, EyeOff, Layers, Trash2, Columns, Plus, Pencil, CalendarCheck } from "lucide-react";
import { format, parseISO } from "date-fns";

type DeleteTarget = { id: string; title: string; kind: "session" | "block" };

export default function AdminSessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<SessionGroupSummary[]>([]);
  const [typeLabels, setTypeLabels] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [createBlockOpen, setCreateBlockOpen] = useState(false);
  const [editBlock, setEditBlock] = useState<SessionGroupSummary | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([sessionApi.list(), sessionApi.listGroups()])
      .then(([s, g]) => {
        setSessions(s);
        setGroups(g);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load sessions";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Configurable type keys -> current labels (reflects renames).
    sessionApi
      .conferenceInfo()
      .then((info) =>
        setTypeLabels(Object.fromEntries((info.session_types ?? []).map((t) => [t.key, t.label]))),
      )
      .catch(() => {});
  }, []);

  const handleTogglePublish = async (session: Session) => {
    setToggling(session.id);
    try {
      const updated = await sessionApi.update(session.id, { is_published: !session.is_published });
      setSessions((prev) => prev.map((s) => (s.id === session.id ? updated : s)));
      toast({
        title: updated.is_published ? "Published" : "Unpublished",
        description: `${session.title} is now ${updated.is_published ? "public" : "hidden"}.`,
      });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const handleToggleBlockPublish = async (block: SessionGroupSummary) => {
    setToggling(block.id);
    try {
      await sessionApi.updateGroup(block.id, { is_published: !block.is_published });
      toast({ title: block.is_published ? "Unpublished" : "Published", description: `${block.title || "Parallel block"} updated.` });
      load();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  };

  const handleAddColumn = async (block: SessionGroupSummary) => {
    try {
      await sessionApi.addColumn(block.id, {});
      toast({ title: "Column added", description: "A new column was added to the block." });
      load();
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const typeLabel = (key?: string) => (key ? typeLabels[key] ?? key : "");

  // Build a single time-ordered list of items: standalone sessions + parallel blocks.
  const columnsByGroup = new Map<string, Session[]>();
  for (const s of sessions) {
    if (s.group_id) {
      const arr = columnsByGroup.get(s.group_id) ?? [];
      arr.push(s);
      columnsByGroup.set(s.group_id, arr);
    }
  }
  type Item =
    | { kind: "session"; date: string; start: string; session: Session }
    | { kind: "block"; date: string; start: string; block: SessionGroupSummary; columns: Session[] };
  const items: Item[] = [];
  for (const s of sessions) {
    if (!s.group_id) items.push({ kind: "session", date: s.session_date ?? "", start: s.start_time ?? "", session: s });
  }
  for (const g of groups) {
    const cols = (columnsByGroup.get(g.id) ?? []).sort((a, b) => (a.column_order ?? 0) - (b.column_order ?? 0));
    items.push({ kind: "block", date: g.session_date ?? "", start: g.start_time ?? "", block: g, columns: cols });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const renderSessionCard = (session: Session) => (
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
            <Button variant="ghost" size="sm" loading={toggling === session.id} onClick={() => handleTogglePublish(session)}>
              {session.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {session.is_published ? "Unpublish" : "Publish"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => setDeleteTarget({ id: session.id, title: session.title, kind: "session" })}
              title="Delete session"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <span>{(session.slots ?? []).length} slot{(session.slots ?? []).length !== 1 ? "s" : ""}</span>
          {session.max_slots ? <span>/ {session.max_slots} max</span> : null}
          {session.chair_name && <span>Chair: {session.chair_name}</span>}
          {session.session_type && <span>{typeLabel(session.session_type)}</span>}
        </div>
      </CardContent>
    </Card>
  );

  const renderBlockCard = (block: SessionGroupSummary, columns: Session[]) => (
    <Card key={block.id} className="border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-indigo-700">
              <Columns className="h-4 w-4 shrink-0" />
              <CardTitle className="text-base">{block.title || "Parallel block"}</CardTitle>
              <Badge variant="indigo">{columns.length} columns</Badge>
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
              {block.session_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {format(parseISO(block.session_date), "MMM d, yyyy")}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {block.start_time}
                {block.end_time ? ` – ${block.end_time}` : ""} (start shared)
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={block.is_published ? "success" : "secondary"}>
              {block.is_published ? "Published" : "Draft"}
            </Badge>
            <Button variant="ghost" size="sm" loading={toggling === block.id} onClick={() => handleToggleBlockPublish(block)}>
              {block.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {block.is_published ? "Unpublish" : "Publish"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditBlock(block)} title="Edit block time/title">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={() => setDeleteTarget({ id: block.id, title: block.title || "Parallel block", kind: "block" })}
              title="Delete block"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {columns.map((col) => (
            <Link
              key={col.id}
              href={`/admin/sessions/${col.id}`}
              className="rounded-md border border-slate-200 p-2.5 hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
            >
              <p className="text-sm font-medium text-slate-800 truncate">{col.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {typeLabel(col.session_type)} · {col.start_time}–{col.end_time}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">
                {col.room ? col.room : "No room"} · {(col.slots ?? []).length} slot
                {(col.slots ?? []).length !== 1 ? "s" : ""}
              </p>
            </Link>
          ))}
        </div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => handleAddColumn(block)}>
          <Plus className="h-4 w-4" />
          Add column
        </Button>
      </CardContent>
    </Card>
  );

  const totalSessions = sessions.length;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
          <p className="text-sm text-slate-500 mt-1">
            {totalSessions} session{totalSessions !== 1 ? "s" : ""}
            {groups.length ? ` · ${groups.length} parallel block${groups.length !== 1 ? "s" : ""}` : ""}
          </p>
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
          <Button variant="outline" onClick={() => setCheckOpen(true)}>
            <CalendarCheck className="h-4 w-4" />
            Check Program
          </Button>
          <Button variant="outline" onClick={() => setCreateBlockOpen(true)}>
            <Columns className="h-4 w-4" />
            New Parallel Block
          </Button>
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
      ) : items.length === 0 ? (
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
          {items.map((item) =>
            item.kind === "session"
              ? renderSessionCard(item.session)
              : renderBlockCard(item.block, item.columns),
          )}
        </div>
      )}

      <DeleteSessionDialog
        target={deleteTarget}
        kind={deleteTarget?.kind ?? "session"}
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onDeleted={() => load()}
      />

      <ParallelBlockDialog
        open={createBlockOpen}
        onOpenChange={setCreateBlockOpen}
        onSaved={load}
      />
      <ParallelBlockDialog
        open={!!editBlock}
        onOpenChange={(o) => !o && setEditBlock(null)}
        block={editBlock}
        onSaved={load}
      />
      <ProgramCheckDialog open={checkOpen} onOpenChange={setCheckOpen} />
    </div>
  );
}
