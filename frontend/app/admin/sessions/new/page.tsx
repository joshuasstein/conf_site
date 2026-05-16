"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { sessionApi, type SessionCreate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

const sessionSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  session_type: z.string().optional(),
  session_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  room: z.string().optional(),
  chair_name: z.string().optional(),
  max_slots: z.coerce.number().min(1).optional(),
});

type SessionForm = z.infer<typeof sessionSchema>;

export default function NewSessionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SessionForm>({ resolver: zodResolver(sessionSchema) });

  const onSubmit = async (data: SessionForm) => {
    setLoading(true);
    try {
      const payload: SessionCreate = {
        title: data.title,
        description: data.description || undefined,
        session_type: data.session_type || undefined,
        session_date: data.session_date || undefined,
        start_time: data.start_time || undefined,
        end_time: data.end_time || undefined,
        room: data.room || undefined,
        chair_name: data.chair_name || undefined,
        max_slots: data.max_slots,
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
                placeholder="e.g., Keynote Morning Session"
                error={errors.title?.message}
                {...register("title")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={3} placeholder="Optional description..." {...register("description")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="session_type">Type</Label>
                <Input id="session_type" placeholder="e.g., Keynote, Panel..." {...register("session_type")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="room">Room</Label>
                <Input id="room" placeholder="e.g., Hall A" {...register("room")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chair_name">Chair name</Label>
              <Input id="chair_name" placeholder="Session chair full name" {...register("chair_name")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="session_date">Date</Label>
              <Input id="session_date" type="date" {...register("session_date")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="start_time">Start time</Label>
                <Input id="start_time" type="time" {...register("start_time")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time">End time</Label>
                <Input id="end_time" type="time" {...register("end_time")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="max_slots">Max slots</Label>
              <Input id="max_slots" type="number" min={1} placeholder="e.g., 4" {...register("max_slots")} />
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
