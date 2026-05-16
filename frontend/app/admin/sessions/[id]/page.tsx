"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sessionApi, submissions, type Session, type Submission } from "@/lib/api";
import { StatusBadge } from "@/components/submission/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Calendar, Clock, MapPin, Plus, Eye, EyeOff, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { format } from "date-fns";

const slotSchema = z.object({
  submission_id: z.string().min(1, "Select a submission"),
  slot_order: z.coerce.number().min(1),
  duration_minutes: z.coerce.number().min(5).optional(),
});

type SlotForm = z.infer<typeof slotSchema>;

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [decidedSubmissions, setDecidedSubmissions] = useState<Submission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting },
  } = useForm<SlotForm>({
    resolver: zodResolver(slotSchema),
    defaultValues: { slot_order: 1 },
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([
      sessionApi.get(id),
      submissions.list(),
    ])
      .then(([sess, subs]) => {
        setSession(sess);
        setAllSubmissions(subs);
        setDecidedSubmissions(subs.filter((s) => s.status === "decided"));
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleTogglePublish = async () => {
    if (!session) return;
    setPublishing(true);
    try {
      const updated = await sessionApi.update(session.id, {
        is_published: !session.is_published,
      });
      setSession(updated);
      toast({
        title: updated.is_published ? "Published" : "Unpublished",
        description: `Session is now ${updated.is_published ? "public" : "hidden"}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleRemoveSlot = async (slotId: string, submissionId: string) => {
    if (!id || !confirm("Remove this submission from the session? It will return to 'decided' status.")) return;
    try {
      const updated = await sessionApi.removeSlot(id, slotId);
      setSession(updated);
      // The removed submission is now 'decided' again — add it back to the dropdown
      setAllSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, status: "decided" as const } : s))
      );
      setDecidedSubmissions((prev) => {
        const sub = allSubmissions.find((s) => s.id === submissionId);
        return sub ? [...prev, { ...sub, status: "decided" as const }] : prev;
      });
      toast({ title: "Slot removed", description: "Submission returned to decided." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  const handleUpdateSlot = async (slotId: string, payload: { slot_order?: number; duration_minutes?: number }) => {
    if (!id) return;
    try {
      const updated = await sessionApi.updateSlot(id, slotId, payload);
      setSession(updated);
      setEditingSlot(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const openEdit = (slot: { id: string; slot_order: number; duration_minutes: number }) => {
    setEditingSlot(slot.id);
    setEditOrder(String(slot.slot_order));
    setEditDuration(String(slot.duration_minutes));
  };

  const onAddSlot = async (data: SlotForm) => {
    if (!id) return;
    try {
      await sessionApi.addSlot(id, {
        submission_id: data.submission_id,
        slot_order: data.slot_order,
        duration_minutes: data.duration_minutes,
      });
      const updated = await sessionApi.get(id);
      setSession(updated);
      setDecidedSubmissions((prev) => prev.filter((s) => s.id !== data.submission_id));
      reset({ slot_order: (updated.slots?.length ?? 0) + 1 });
      toast({ title: "Slot added", description: "Submission added to session." });
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

  if (!session) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Session not found.</p>
        <Button asChild className="mt-4"><Link href="/admin/sessions">Back</Link></Button>
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin/sessions">
          <ArrowLeft className="h-4 w-4" />
          Back to sessions
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{session.title}</h1>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
            {session.session_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {format(new Date(session.session_date), "EEEE, MMMM d, yyyy")}
              </span>
            )}
            {session.start_time && session.end_time && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {session.start_time} – {session.end_time}
              </span>
            )}
            {session.room && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
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
            variant="outline"
            size="sm"
            loading={publishing}
            onClick={handleTogglePublish}
          >
            {session.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {session.is_published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                Slots ({(session.slots ?? []).length}{session.max_slots ? ` / ${session.max_slots}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(session.slots ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No slots assigned yet.</p>
              ) : (
                <div className="space-y-3">
                  {[...(session.slots ?? [])]
                    .sort((a, b) => a.slot_order - b.slot_order)
                    .map((slot, idx, sorted) => (
                      <div key={slot.id} className="rounded-md border border-slate-200">
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex flex-col gap-0.5 shrink-0">
                            <button
                              disabled={idx === 0}
                              onClick={() => handleUpdateSlot(slot.id, { slot_order: sorted[idx - 1].slot_order })}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                            <button
                              disabled={idx === sorted.length - 1}
                              onClick={() => handleUpdateSlot(slot.id, { slot_order: sorted[idx + 1].slot_order })}
                              className="text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </div>
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 shrink-0">
                            {slot.slot_order}
                          </span>
                          <div className="flex-1 min-w-0">
                            {(() => {
                              const sub = allSubmissions.find((s) => s.id === slot.submission_id);
                              return (
                                <>
                                  <p className="text-sm font-medium text-slate-900 truncate">
                                    {sub?.title ?? "Loading..."}
                                  </p>
                                  {sub?.presenting_author && (
                                    <p className="text-xs text-slate-400 truncate">
                                      {sub.presenting_author.full_name}
                                    </p>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                          <button
                            onClick={() => editingSlot === slot.id ? setEditingSlot(null) : openEdit(slot)}
                            className="text-xs text-slate-400 hover:text-indigo-600 shrink-0"
                          >
                            {slot.duration_minutes} min
                          </button>
                          <button
                            onClick={() => handleRemoveSlot(slot.id, slot.submission_id)}
                            className="text-slate-300 hover:text-red-500 shrink-0"
                            title="Remove from session"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        {editingSlot === slot.id && (
                          <div ref={editRef} className="border-t border-slate-100 px-3 py-2 bg-slate-50 flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-slate-500">Order</label>
                              <input
                                type="number"
                                min={1}
                                value={editOrder}
                                onChange={(e) => setEditOrder(e.target.value)}
                                className="w-16 h-7 rounded border border-slate-300 px-2 text-xs"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs text-slate-500">Duration (min)</label>
                              <input
                                type="number"
                                min={1}
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="w-16 h-7 rounded border border-slate-300 px-2 text-xs"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-7 text-xs px-3"
                              onClick={() => handleUpdateSlot(slot.id, {
                                slot_order: editOrder ? parseInt(editOrder) : undefined,
                                duration_minutes: editDuration ? parseInt(editDuration) : undefined,
                              })}
                            >
                              Save
                            </Button>
                            <button onClick={() => setEditingSlot(null)} className="text-xs text-slate-400 hover:text-slate-600">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add Slot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onAddSlot)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Submission</Label>
                  <Controller
                    name="submission_id"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ""} onValueChange={field.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select submission..." />
                        </SelectTrigger>
                        <SelectContent>
                          {decidedSubmissions.map((sub) => (
                            <SelectItem key={sub.id} value={String(sub.id)}>
                              <span className="truncate max-w-[180px] block">
                                {sub.title}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Order</Label>
                    <input
                      type="number"
                      min={1}
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
                      {...register("slot_order")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration (min)</Label>
                    <input
                      type="number"
                      min={5}
                      placeholder="30"
                      className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm"
                      {...register("duration_minutes")}
                    />
                  </div>
                </div>
                <Button type="submit" size="sm" loading={isSubmitting} className="w-full">
                  <Plus className="h-4 w-4" />
                  Add to Session
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
