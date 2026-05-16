"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sessionApi, type Session, type SessionType, SESSION_TYPE_LABELS, NO_SLOT_SESSION_TYPES } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const SESSION_TYPES: SessionType[] = ["oral", "poster", "networking_break", "lunch", "happy_hour"];

const sessionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  session_type: z.enum(["oral", "poster", "networking_break", "lunch", "happy_hour"]),
  session_date: z.string().min(1, "Date is required"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  room: z.string().optional(),
  chair_name: z.string().optional(),
  max_slots: z.coerce.number().min(1).optional(),
});

type SessionForm = z.infer<typeof sessionSchema>;

export default function EditSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    shouldUnregister: true,
  });

  useEffect(() => {
    if (!id) return;
    sessionApi.get(id)
      .then((sess: Session) => {
        reset({
          title: sess.title,
          description: sess.description ?? "",
          session_type: sess.session_type,
          session_date: sess.session_date,
          start_time: sess.start_time,
          end_time: sess.end_time,
          room: sess.room ?? "",
          chair_name: sess.chair_name ?? "",
          max_slots: sess.max_slots > 0 ? sess.max_slots : undefined,
        });
      })
      .catch((err: unknown) => {
        toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to load", variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id, reset]);

  const sessionType = watch("session_type");
  const isNoSlotType = NO_SLOT_SESSION_TYPES.includes(sessionType as SessionType);

  const onSubmit = async (data: SessionForm) => {
    if (!id) return;
    setSaving(true);
    try {
      await sessionApi.update(id, {
        title: data.title,
        description: data.description || undefined,
        session_type: data.session_type,
        session_date: data.session_date,
        start_time: data.start_time,
        end_time: data.end_time,
        room: data.room || undefined,
        chair_name: data.chair_name || undefined,
        max_slots: isNoSlotType ? 0 : (data.max_slots ?? undefined),
      });
      toast({ title: "Session updated" });
      router.push(`/admin/sessions/${id}`);
    } catch (err: unknown) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-48 rounded bg-slate-200 animate-pulse" />
        <div className="h-64 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/admin/sessions/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to session
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Session</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Session Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input id="title" error={errors.title?.message} {...register("title")} />
            </div>

            <div className="space-y-1.5">
              <Label>Session Type <span className="text-red-500">*</span></Label>
              <Controller
                name="session_type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SESSION_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{SESSION_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} {...register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="room">Room / Location</Label>
                <Input id="room" placeholder="e.g. Hall A" {...register("room")} />
              </div>
              {!isNoSlotType && (
                <div className="space-y-1.5">
                  <Label htmlFor="chair_name">Chair name</Label>
                  <Input id="chair_name" {...register("chair_name")} />
                </div>
              )}
            </div>

            {!isNoSlotType && (
              <div className="space-y-1.5">
                <Label htmlFor="max_slots">Max slots</Label>
                <Input id="max_slots" type="number" min={1} {...register("max_slots")} />
                {errors.max_slots && <p className="text-xs text-red-500">{errors.max_slots.message}</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="session_date">Date <span className="text-red-500">*</span></Label>
              <Input id="session_date" type="date" error={errors.session_date?.message} {...register("session_date")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start_time">Start time <span className="text-red-500">*</span></Label>
                <Input id="start_time" type="time" error={errors.start_time?.message} {...register("start_time")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time">End time <span className="text-red-500">*</span></Label>
                <Input id="end_time" type="time" error={errors.end_time?.message} {...register("end_time")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href={`/admin/sessions/${id}`}>Cancel</Link>
          </Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </div>
  );
}
