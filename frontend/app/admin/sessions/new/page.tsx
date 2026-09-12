"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sessionApi, type SessionCreate, type SessionTypeDef } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const sessionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  session_type: z.string().min(1, "Session type is required"),
  session_date: z.string().min(1, "Date is required"),
  start_time: z.string().min(1, "Start time is required"),
  end_time: z.string().min(1, "End time is required"),
  room: z.string().optional(),
  chair_name: z.string().optional(),
  max_slots: z.coerce.number().min(1).optional(),
});

type SessionForm = z.infer<typeof sessionSchema>;

export default function NewSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sessionTypes, setSessionTypes] = useState<SessionTypeDef[]>([]);

  useEffect(() => {
    sessionApi.conferenceInfo().then((info) => setSessionTypes(info.session_types ?? [])).catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<SessionForm>({
    resolver: zodResolver(sessionSchema),
    defaultValues: { session_type: "oral" },
    shouldUnregister: true,
  });

  const sessionType = watch("session_type");
  const isNoSlotType = sessionTypes.find((t) => t.key === sessionType)?.has_slots === false;

  const onSubmit = async (data: SessionForm) => {
    setLoading(true);
    try {
      const payload: SessionCreate = {
        title: data.title,
        description: data.description || undefined,
        session_type: data.session_type,
        session_date: data.session_date,
        start_time: data.start_time,
        end_time: data.end_time,
        room: data.room || undefined,
        chair_name: data.chair_name || undefined,
        max_slots: isNoSlotType ? 0 : (data.max_slots ?? 10),
      };
      const created = await sessionApi.create(payload);
      toast({ title: "Session created", description: `"${created.title}" has been created.` });
      router.push(`/admin/sessions/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/admin/sessions">
          <ArrowLeft className="h-4 w-4" />
          Back to sessions
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Session</h1>
        <p className="text-sm text-slate-500 mt-1">Create a conference session to group presentations.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Session Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
              <Input
                id="title"
                placeholder="e.g., Morning Oral Session A"
                error={errors.title?.message}
                {...register("title")}
              />
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
                      {sessionTypes.map((t) => (
                        <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.session_type && (
                <p className="text-xs text-red-500">{errors.session_type.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} placeholder="Optional description..." {...register("description")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="room">Room / Location</Label>
                <Input id="room" placeholder="e.g., Hall A" {...register("room")} />
              </div>
              {!isNoSlotType && (
                <div className="space-y-1.5">
                  <Label htmlFor="chair_name">Chair name</Label>
                  <Input id="chair_name" placeholder="Session chair" {...register("chair_name")} />
                </div>
              )}
            </div>

            {!isNoSlotType && (
              <div className="space-y-1.5">
                <Label htmlFor="max_slots">Max slots</Label>
                <Input id="max_slots" type="number" min={1} placeholder="e.g., 6" {...register("max_slots")} />
                {errors.max_slots && (
                  <p className="text-xs text-red-500">{errors.max_slots.message}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="session_date">Date <span className="text-red-500">*</span></Label>
              <Input
                id="session_date"
                type="date"
                error={errors.session_date?.message}
                {...register("session_date")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start_time">Start time <span className="text-red-500">*</span></Label>
                <Input
                  id="start_time"
                  type="time"
                  error={errors.start_time?.message}
                  {...register("start_time")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time">End time <span className="text-red-500">*</span></Label>
                <Input
                  id="end_time"
                  type="time"
                  error={errors.end_time?.message}
                  {...register("end_time")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href="/admin/sessions">Cancel</Link>
          </Button>
          <Button type="submit" loading={loading}>
            Create Session
          </Button>
        </div>
      </form>
    </div>
  );
}
