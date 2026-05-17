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
import { useRouter } from "next/navigation";
import { Plus, Settings, X, TriangleAlert } from "lucide-react";

const settingsSchema = z.object({
  conference_name: z.string().min(1, "Required"),
  location: z.string().optional(),
  conference_start_date: z.string().optional(),
  conference_end_date: z.string().optional(),
  submission_deadline: z.string().optional(),
  confirmation_deadline: z.string().optional(),
  file_submission_deadline: z.string().optional(),
  email_from_address: z.string().email("Must be a valid email").or(z.literal("")).optional(),
  email_from_name: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

export default function AdminSettingsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<string[]>([]);
  const [trackInput, setTrackInput] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);

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
          email_from_address: data.email_from_address ?? "",
          email_from_name: data.email_from_name ?? "",
        });
        setTracks(data.tracks ?? []);
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
      await admin.updateSettings({
        ...payload,
        tracks,
        email_from_address: data.email_from_address || undefined,
        email_from_name: data.email_from_name || undefined,
      });
      toast({ title: "Settings saved", description: "Conference settings updated." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleReset = async () => {
    if (resetConfirmText !== "RESET") return;
    setResetting(true);
    try {
      await admin.reset();
      toast({ title: "Reset complete", description: "All data and attachments have been deleted." });
      await logout();
      router.push("/login");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Reset failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setResetting(false);
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

        <Card>
          <CardHeader>
            <CardTitle>Tracks</CardTitle>
            <CardDescription>
              Submitters will choose from this list. Leave empty to allow free-text entry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Machine Learning"
                value={trackInput}
                onChange={(e) => setTrackInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const t = trackInput.trim();
                    if (t && !tracks.includes(t)) setTracks((prev) => [...prev, t]);
                    setTrackInput("");
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const t = trackInput.trim();
                  if (t && !tracks.includes(t)) setTracks((prev) => [...prev, t]);
                  setTrackInput("");
                }}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {tracks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tracks.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => setTracks((prev) => prev.filter((x) => x !== t))}
                      className="text-indigo-400 hover:text-indigo-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Sender identity for outgoing email notifications. The address must be verified in Resend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email_from_address">From address</Label>
              <Input
                id="email_from_address"
                type="email"
                placeholder="noreply@yourconference.org"
                {...register("email_from_address")}
              />
              {errors.email_from_address && (
                <p className="text-xs text-red-600">{errors.email_from_address.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email_from_name">From name</Label>
              <Input
                id="email_from_name"
                placeholder="PVPMC Workshop"
                {...register("email_from_name")}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={isSubmitting}>
            Save Settings
          </Button>
        </div>
      </form>

      <Card className="mt-8 border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <TriangleAlert className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription className="text-red-600">
            Permanently deletes all users (except you), submissions, reviews, sessions, and stored files. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-700 font-medium">Type <span className="font-mono bg-red-100 px-1 rounded">RESET</span> to confirm:</p>
          <Input
            value={resetConfirmText}
            onChange={(e) => setResetConfirmText(e.target.value)}
            placeholder="RESET"
            className="border-red-300 max-w-xs"
          />
          <Button
            variant="destructive"
            disabled={resetConfirmText !== "RESET" || resetting}
            loading={resetting}
            onClick={handleReset}
          >
            Reset all data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
