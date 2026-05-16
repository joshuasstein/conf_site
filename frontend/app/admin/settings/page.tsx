"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { admin, type ConferenceSettings } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Settings } from "lucide-react";

const settingsSchema = z.object({
  conference_name: z.string().min(1, "Required"),
  location: z.string().optional(),
  conference_start_date: z.string().optional(),
  conference_end_date: z.string().optional(),
  submission_deadline: z.string().optional(),
  confirmation_deadline: z.string().optional(),
  file_submission_deadline: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    admin
      .getSettings()
      .then((data) => {
        const formatDate = (s?: string) => (s ? s.split("T")[0] : "");
        const formatDateTime = (s?: string) => (s ? s.replace("Z", "").slice(0, 16) : "");
        reset({
          conference_name: data.conference_name,
          location: data.location ?? "",
          conference_start_date: formatDate(data.conference_start_date),
          conference_end_date: formatDate(data.conference_end_date),
          submission_deadline: formatDateTime(data.submission_deadline),
          confirmation_deadline: formatDateTime(data.confirmation_deadline),
          file_submission_deadline: formatDateTime(data.file_submission_deadline),
        });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load settings";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [reset]);

  const onSubmit = async (data: SettingsForm) => {
    try {
      const payload: Partial<ConferenceSettings> = {
        conference_name: data.conference_name,
        location: data.location || undefined,
        conference_start_date: data.conference_start_date || undefined,
        conference_end_date: data.conference_end_date || undefined,
        submission_deadline: data.submission_deadline
          ? new Date(data.submission_deadline).toISOString()
          : undefined,
        confirmation_deadline: data.confirmation_deadline
          ? new Date(data.confirmation_deadline).toISOString()
          : undefined,
        file_submission_deadline: data.file_submission_deadline
          ? new Date(data.file_submission_deadline).toISOString()
          : undefined,
      };
      await admin.updateSettings(payload);
      toast({ title: "Settings saved", description: "Conference settings updated." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins can access conference settings.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl">
        <div className="h-8 w-48 rounded bg-slate-200 animate-pulse" />
        <div className="h-80 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Conference Settings</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configure the conference details and deadlines.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="conference_name">Conference name <span className="text-red-500">*</span></Label>
              <Input
                id="conference_name"
                placeholder="My Conference 2026"
                {...register("conference_name")}
              />
              {errors.conference_name && (
                <p className="text-xs text-red-600">{errors.conference_name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" placeholder="San Francisco, CA" {...register("location")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="conference_start_date">Start date</Label>
                <Input id="conference_start_date" type="date" {...register("conference_start_date")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conference_end_date">End date</Label>
                <Input id="conference_end_date" type="date" {...register("conference_end_date")} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deadlines</CardTitle>
            <CardDescription>All times are in your local timezone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="submission_deadline">Submission deadline</Label>
              <Input id="submission_deadline" type="datetime-local" {...register("submission_deadline")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmation_deadline">Confirmation deadline</Label>
              <Input id="confirmation_deadline" type="datetime-local" {...register("confirmation_deadline")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="file_submission_deadline">File submission deadline</Label>
              <Input id="file_submission_deadline" type="datetime-local" {...register("file_submission_deadline")} />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save Settings
          </Button>
        </div>
      </form>
    </div>
  );
}
