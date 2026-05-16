"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  sessionApi,
  submissions,
  type Session,
  type Submission,
  type SlotType,
  SESSION_TYPE_LABELS,
  NO_SLOT_SESSION_TYPES,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft, Calendar, Clock, MapPin, Plus, Eye, EyeOff, Trash2, ChevronUp, ChevronDown, MessageSquare, Users,
} from "lucide-react";
import { format } from "date-fns";

// ── Slot form for oral sessions (talks + Q&A + Discussion) ───────────────────

const oralSlotSchema = z.object({
  slot_type: z.enum(["talk", "qa", "discussion"]),
  submission_id: z.string().optional(),
  slot_order: z.coerce.number().min(1),
  duration_minutes: z.coerce.number().min(1),
});
type OralSlotForm = z.infer<typeof oralSlotSchema>;

// ── Slot form for poster sessions ────────────────────────────────────────────

const posterSlotSchema = z.object({
  submission_id: z.string().min(1, "Select a submission"),
  slot_order: z.coerce.number().min(1),
  duration_minutes: z.coerce.number().min(1),
  poster_number: z.coerce.number().min(1).optional(),
  board_number: z.string().optional(),
});
type PosterSlotForm = z.infer<typeof posterSlotSchema>;

// ── Slot type badges ──────────────────────────────────────────────────────────

function SlotTypeBadge({ type }: { type: SlotType }) {
  if (type === "qa") return <Badge variant="secondary" className="text-xs shrink-0">Q&A</Badge>;
  if (type === "discussion") return <Badge variant="secondary" className="text-xs shrink-0">Discussion</Badge>;
  if (type === "poster") return <Badge variant="indigo" className="text-xs shrink-0">Poster</Badge>;
  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [decidedSubmissions, setDecidedSubmissions] = useState<Submission[]>([]);
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const oralForm = useForm<OralSlotForm>({
    resolver: zodResolver(oralSlotSchema),
    defaultValues: { slot_type: "talk", slot_order: 1, duration_minutes: 15 },
  });

  const posterForm = useForm<PosterSlotForm>({
    resolver: zodResolver(posterSlotSchema),
    defaultValues: { slot_order: 1, duration_minutes: 15 },
  });

  useEffect(() => {
    if (!id) return;
    Promise.all([sessionApi.get(id), submissions.list()])
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
      const updated = await sessionApi.update(session.id, { is_published: !session.is_published });
      setSession(updated);
      toast({ title: updated.is_published ? "Published" : "Unpublished" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const handleRemoveSlot = async (slotId: string, submissionId: string | null) => {
    if (!id || !confirm("Remove this slot from the session?")) return;
    try {
      const updated = await sessionApi.removeSlot(id, slotId);
      setSession(updated);
      if (submissionId) {
        setAllSubmissions((prev) => prev.map((s) => (s.id === submissionId ? { ...s, status: "decided" as const } : s)));
        setDecidedSubmissions((prev) => {
          const sub = allSubmissions.find((s) => s.id === submissionId);
          return sub ? [...prev, { ...sub, status: "decided" as const }] : prev;
        });
      }
      toast({ title: "Slot removed" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  // Inline slot editing
  const [editingSlot, setEditingSlot] = useState<string | null>(null);
  const [editOrder, setEditOrder] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editBoard, setEditBoard] = useState("");
  const [editPosterNum, setEditPosterNum] = useState("");
  const editRef = useRef<HTMLDivElement>(null);

  const openEdit = (slot: { id: string; slot_order: number; duration_minutes: number; board_number?: string | null; poster_number?: number | null }) => {
    setEditingSlot(slot.id);
    setEditOrder(String(slot.slot_order));
    setEditDuration(String(slot.duration_minutes));
    setEditBoard(slot.board_number ?? "");
    setEditPosterNum(slot.poster_number != null ? String(slot.poster_number) : "");
  };

  const handleUpdateSlot = async (slotId: string, payload: { slot_order?: number; duration_minutes?: number; board_number?: string; poster_number?: number }) => {
    if (!id) return;
    try {
      const updated = await sessionApi.updateSlot(id, slotId, payload);
      setSession(updated);
      setEditingSlot(null);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  // ── Add slot handlers ──────────────────────────────────────────────────────

  const onAddOralSlot = async (data: OralSlotForm) => {
    if (!id) return;
    const isSubmissionSlot = data.slot_type === "talk";
    if (isSubmissionSlot && !data.submission_id) {
      oralForm.setError("submission_id", { message: "Select a submission" });
      return;
    }
    try {
      await sessionApi.addSlot(id, {
        slot_type: data.slot_type,
        submission_id: isSubmissionSlot ? data.submission_id : null,
        slot_order: data.slot_order,
        duration_minutes: data.duration_minutes,
      });
      const updated = await sessionApi.get(id);
      setSession(updated);
      if (isSubmissionSlot && data.submission_id) {
        setDecidedSubmissions((prev) => prev.filter((s) => s.id !== data.submission_id));
      }
      oralForm.reset({ slot_type: data.slot_type, slot_order: (updated.slots?.length ?? 0) + 1, duration_minutes: 15 });
      toast({ title: "Slot added" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  const onAddPosterSlot = async (data: PosterSlotForm) => {
    if (!id) return;
    try {
      await sessionApi.addSlot(id, {
        slot_type: "poster",
        submission_id: data.submission_id,
        slot_order: data.slot_order,
        duration_minutes: data.duration_minutes,
        poster_number: data.poster_number,
        board_number: data.board_number || undefined,
      });
      const updated = await sessionApi.get(id);
      setSession(updated);
      setDecidedSubmissions((prev) => prev.filter((s) => s.id !== data.submission_id));
      posterForm.reset({ slot_order: (updated.slots?.length ?? 0) + 1, duration_minutes: 15 });
      toast({ title: "Poster added" });
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    }
  };

  // ── Rendering ──────────────────────────────────────────────────────────────

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

  const isNoSlot = NO_SLOT_SESSION_TYPES.includes(session.session_type);
  const isPoster = session.session_type === "poster";
  const isOral = session.session_type === "oral";
  const sortedSlots = [...(session.slots ?? [])].sort((a, b) => a.slot_order - b.slot_order);
  const oralSlotType = oralForm.watch("slot_type");

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin/sessions"><ArrowLeft className="h-4 w-4" /> Back to sessions</Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900">{session.title}</h1>
            <Badge variant="secondary">{SESSION_TYPE_LABELS[session.session_type]}</Badge>
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-sm text-slate-500">
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
          <Button variant="outline" size="sm" loading={publishing} onClick={handleTogglePublish}>
            {session.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {session.is_published ? "Unpublish" : "Publish"}
          </Button>
        </div>
      </div>

      {isNoSlot ? (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            <Clock className="h-10 w-10 text-slate-200 mx-auto mb-3" />
            <p className="font-medium text-slate-700">{SESSION_TYPE_LABELS[session.session_type]}</p>
            <p className="text-sm mt-1">
              {session.start_time} – {session.end_time}
              {session.room && ` · ${session.room}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Slot list */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>
                  {isPoster ? "Posters" : "Slots"} ({sortedSlots.length}{session.max_slots ? ` / ${session.max_slots}` : ""})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sortedSlots.length === 0 ? (
                  <p className="text-sm text-slate-500">No {isPoster ? "posters" : "slots"} assigned yet.</p>
                ) : (
                  <div className="space-y-3">
                    {sortedSlots.map((slot, idx) => {
                      const sub = allSubmissions.find((s) => s.id === slot.submission_id);
                      return (
                        <div key={slot.id} className="rounded-md border border-slate-200">
                          <div className="flex items-center gap-3 p-3">
                            {/* Reorder arrows */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                disabled={idx === 0}
                                onClick={() => handleUpdateSlot(slot.id, { slot_order: sortedSlots[idx - 1].slot_order })}
                                className="text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                disabled={idx === sortedSlots.length - 1}
                                onClick={() => handleUpdateSlot(slot.id, { slot_order: sortedSlots[idx + 1].slot_order })}
                                className="text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:cursor-not-allowed"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Order badge */}
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 shrink-0">
                              {slot.slot_order}
                            </span>

                            {/* Poster number badge */}
                            {isPoster && slot.poster_number != null && (
                              <span className="shrink-0 text-xs font-semibold text-slate-500">#{slot.poster_number}</span>
                            )}

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {slot.slot_type === "qa" || slot.slot_type === "discussion" ? (
                                <p className="text-sm font-medium text-slate-700">
                                  {slot.slot_type === "qa" ? "Q&A" : "Discussion"}
                                </p>
                              ) : (
                                <>
                                  <p className="text-sm font-medium text-slate-900 truncate">{sub?.title ?? "—"}</p>
                                  {sub?.presenting_author && (
                                    <p className="text-xs text-slate-400 truncate">{sub.presenting_author.full_name}</p>
                                  )}
                                  {isPoster && slot.board_number && (
                                    <p className="text-xs text-slate-400">Board {slot.board_number}</p>
                                  )}
                                </>
                              )}
                            </div>

                            <SlotTypeBadge type={slot.slot_type} />

                            {/* Duration (click to edit) */}
                            <button
                              onClick={() => editingSlot === slot.id ? setEditingSlot(null) : openEdit(slot)}
                              className="text-xs text-slate-400 hover:text-indigo-600 shrink-0"
                            >
                              {slot.duration_minutes} min
                            </button>

                            {/* Remove */}
                            <button
                              onClick={() => handleRemoveSlot(slot.id, slot.submission_id)}
                              className="text-slate-300 hover:text-red-500 shrink-0"
                              title="Remove from session"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Inline edit panel */}
                          {editingSlot === slot.id && (
                            <div ref={editRef} className="border-t border-slate-100 px-3 py-2 bg-slate-50 flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                <label className="text-xs text-slate-500">Order</label>
                                <input type="number" min={1} value={editOrder} onChange={(e) => setEditOrder(e.target.value)}
                                  className="w-16 h-7 rounded border border-slate-300 px-2 text-xs" />
                              </div>
                              <div className="flex items-center gap-1.5">
                                <label className="text-xs text-slate-500">Duration (min)</label>
                                <input type="number" min={1} value={editDuration} onChange={(e) => setEditDuration(e.target.value)}
                                  className="w-16 h-7 rounded border border-slate-300 px-2 text-xs" />
                              </div>
                              {isPoster && (
                                <>
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-xs text-slate-500">Poster #</label>
                                    <input type="number" min={1} value={editPosterNum} onChange={(e) => setEditPosterNum(e.target.value)}
                                      className="w-16 h-7 rounded border border-slate-300 px-2 text-xs" />
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <label className="text-xs text-slate-500">Board</label>
                                    <input type="text" value={editBoard} onChange={(e) => setEditBoard(e.target.value)}
                                      className="w-20 h-7 rounded border border-slate-300 px-2 text-xs" />
                                  </div>
                                </>
                              )}
                              <Button size="sm" className="h-7 text-xs px-3" onClick={() => handleUpdateSlot(slot.id, {
                                slot_order: editOrder ? parseInt(editOrder) : undefined,
                                duration_minutes: editDuration ? parseInt(editDuration) : undefined,
                                board_number: isPoster ? editBoard || undefined : undefined,
                                poster_number: isPoster && editPosterNum ? parseInt(editPosterNum) : undefined,
                              })}>Save</Button>
                              <button onClick={() => setEditingSlot(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Add slot sidebar */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  {isPoster ? "Add Poster" : "Add Slot"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* ── Oral session add form ── */}
                {isOral && (
                  <form onSubmit={oralForm.handleSubmit(onAddOralSlot)} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Controller
                        name="slot_type"
                        control={oralForm.control}
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="talk">Talk</SelectItem>
                              <SelectItem value="qa"><span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Q&A</span></SelectItem>
                              <SelectItem value="discussion"><span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />Discussion</span></SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    {oralSlotType === "talk" && (
                      <div className="space-y-1.5">
                        <Label>Submission</Label>
                        <Controller
                          name="submission_id"
                          control={oralForm.control}
                          render={({ field }) => (
                            <Select value={field.value ?? ""} onValueChange={field.onChange}>
                              <SelectTrigger>
                                <SelectValue placeholder="Select submission..." />
                              </SelectTrigger>
                              <SelectContent>
                                {decidedSubmissions.map((sub) => (
                                  <SelectItem key={sub.id} value={String(sub.id)}>
                                    <span className="truncate max-w-[180px] block">{sub.title}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>Order</Label>
                        <input type="number" min={1} className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...oralForm.register("slot_order")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Duration (min)</Label>
                        <input type="number" min={1} placeholder="15" className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...oralForm.register("duration_minutes")} />
                      </div>
                    </div>

                    <Button type="submit" size="sm" loading={oralForm.formState.isSubmitting} className="w-full">
                      <Plus className="h-4 w-4" />
                      {oralSlotType === "talk" ? "Add Talk" : oralSlotType === "qa" ? "Add Q&A" : "Add Discussion"}
                    </Button>
                  </form>
                )}

                {/* ── Poster session add form ── */}
                {isPoster && (
                  <form onSubmit={posterForm.handleSubmit(onAddPosterSlot)} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Submission</Label>
                      <Controller
                        name="submission_id"
                        control={posterForm.control}
                        render={({ field }) => (
                          <Select value={field.value ?? ""} onValueChange={field.onChange}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select submission..." />
                            </SelectTrigger>
                            <SelectContent>
                              {decidedSubmissions.map((sub) => (
                                <SelectItem key={sub.id} value={String(sub.id)}>
                                  <span className="truncate max-w-[180px] block">{sub.title}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>Poster #</Label>
                        <input type="number" min={1} className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...posterForm.register("poster_number")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Board</Label>
                        <input type="text" placeholder="e.g. A3" className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...posterForm.register("board_number")} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label>Order</Label>
                        <input type="number" min={1} className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...posterForm.register("slot_order")} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Duration (min)</Label>
                        <input type="number" min={1} placeholder="15" className="flex h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm" {...posterForm.register("duration_minutes")} />
                      </div>
                    </div>

                    <Button type="submit" size="sm" loading={posterForm.formState.isSubmitting} className="w-full">
                      <Plus className="h-4 w-4" /> Add Poster
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
