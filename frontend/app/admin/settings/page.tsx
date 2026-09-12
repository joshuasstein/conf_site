"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  admin,
  type ConferenceSettings,
  type SessionTypeDef,
  type SlotTypeDef,
  type DecisionOutcomeDef,
  type SessionColor,
  SESSION_COLOR_OPTIONS,
  SESSION_COLOR_CLASSES,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { Plus, Settings, X, TriangleAlert } from "lucide-react";

const PREVIEW_VARIABLE_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "full_name", label: "Recipient name", placeholder: "Jane Smith" },
  { key: "submission_title", label: "Abstract title", placeholder: "Machine Learning in Solar Forecasting" },
  { key: "outcome", label: "Decision outcome", placeholder: "Oral Presentation" },
  { key: "slot", label: "Session slot", placeholder: "Session A, June 15, starting 9:00 AM" },
  { key: "confirmation_deadline", label: "Confirm-by date", placeholder: "June 1, 2026" },
  { key: "otp_code", label: "OTP code", placeholder: "847291" },
];

/** Turn a human label into a stable lowercase key (letters, digits, underscores). */
function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

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
  const [sessionTypes, setSessionTypes] = useState<SessionTypeDef[]>([]);
  const [slotTypes, setSlotTypes] = useState<SlotTypeDef[]>([]);
  const [decisionOutcomes, setDecisionOutcomes] = useState<DecisionOutcomeDef[]>([]);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetStep, setResetStep] = useState<"idle" | "otp">("idle");
  const [otpToken, setOtpToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
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
        setSessionTypes(data.session_types ?? []);
        setSlotTypes(data.slot_types ?? []);
        setDecisionOutcomes(data.decision_outcomes ?? []);
        setPreviewVars(data.preview_variables ?? {});
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load settings";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [reset]);

  // Validate the editable type lists before saving (keys present & unique, labels present).
  const validateTypes = (): string | null => {
    const all = [...sessionTypes, ...slotTypes, ...decisionOutcomes];
    for (const t of all) {
      if (!t.label.trim()) return "Every type needs a label.";
      if (!t.key.trim()) return "Every type needs a key.";
    }
    const sKeys = sessionTypes.map((t) => t.key);
    if (new Set(sKeys).size !== sKeys.length) return "Session type keys must be unique.";
    const slKeys = slotTypes.map((t) => t.key);
    if (new Set(slKeys).size !== slKeys.length) return "Slot type keys must be unique.";
    const dKeys = decisionOutcomes.map((t) => t.key);
    if (new Set(dKeys).size !== dKeys.length) return "Decision category keys must be unique.";
    return null;
  };

  const onSubmit = async (data: SettingsForm) => {
    const typeError = validateTypes();
    if (typeError) {
      toast({ title: "Check your types", description: typeError, variant: "destructive" });
      return;
    }
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
        session_types: sessionTypes,
        slot_types: slotTypes,
        decision_outcomes: decisionOutcomes,
        email_from_address: data.email_from_address || undefined,
        email_from_name: data.email_from_name || undefined,
        preview_variables: previewVars,
      });
      toast({ title: "Settings saved", description: "Conference settings updated." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleRequestOtp = async () => {
    if (resetConfirmText !== "RESET") return;
    setResetting(true);
    try {
      const { otp_token } = await admin.requestResetOtp();
      setOtpToken(otp_token);
      setResetStep("otp");
      toast({ title: "Code sent", description: "Check your email for the 6-digit confirmation code." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleReset = async () => {
    if (!otpCode) return;
    setResetting(true);
    try {
      await admin.reset(otpToken, otpCode);
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

        {/* ── Session types ── */}
        <Card>
          <CardHeader>
            <CardTitle>Session types</CardTitle>
            <CardDescription>
              Types of sessions in the program. The color is used on the public program page.
              Turn off &ldquo;has talk slots&rdquo; for pure time blocks like lunch or breaks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionTypes.map((t, i) => {
              const update = (patch: Partial<SessionTypeDef>) =>
                setSessionTypes((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3">
                  <Input
                    className="flex-1 min-w-[140px]"
                    placeholder="Label (e.g. Oral)"
                    value={t.label}
                    onChange={(e) => update({ label: e.target.value, key: t.key || slugify(e.target.value) })}
                  />
                  <div className="flex items-center gap-1.5">
                    {SESSION_COLOR_OPTIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        aria-label={c}
                        onClick={() => update({ color: c as SessionColor })}
                        className={`h-6 w-6 rounded-full ${SESSION_COLOR_CLASSES[c].swatch} ${
                          t.color === c ? "ring-2 ring-offset-2 ring-slate-800" : "opacity-70 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={t.has_slots}
                      onChange={(e) => update({ has_slots: e.target.checked })}
                    />
                    Has talk slots
                  </label>
                  <button
                    type="button"
                    onClick={() => setSessionTypes((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove session type"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSessionTypes((prev) => [...prev, { key: "", label: "", color: "indigo", has_slots: true }])
              }
            >
              <Plus className="h-4 w-4" />
              Add session type
            </Button>
          </CardContent>
        </Card>

        {/* ── Slot types ── */}
        <Card>
          <CardHeader>
            <CardTitle>Slot types</CardTitle>
            <CardDescription>
              Kinds of slots within a session. &ldquo;Requires a submission&rdquo; ties the slot to an accepted
              abstract; &ldquo;expects a final file&rdquo; controls what presenters must upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {slotTypes.map((t, i) => {
              const update = (patch: Partial<SlotTypeDef>) =>
                setSlotTypes((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3">
                  <Input
                    className="flex-1 min-w-[140px]"
                    placeholder="Label (e.g. Talk)"
                    value={t.label}
                    onChange={(e) => update({ label: e.target.value, key: t.key || slugify(e.target.value) })}
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={t.requires_submission}
                      onChange={(e) => update({ requires_submission: e.target.checked })}
                    />
                    Requires a submission
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-slate-600">
                    Final file:
                    <select
                      value={t.expects_file}
                      onChange={(e) => update({ expects_file: e.target.value as SlotTypeDef["expects_file"] })}
                      className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm"
                    >
                      <option value="none">None</option>
                      <option value="presentation">Presentation</option>
                      <option value="poster">Poster</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => setSlotTypes((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove slot type"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSlotTypes((prev) => [...prev, { key: "", label: "", requires_submission: false, expects_file: "none" }])
              }
            >
              <Plus className="h-4 w-4" />
              Add slot type
            </Button>
          </CardContent>
        </Card>

        {/* ── Decision categories ── */}
        <Card>
          <CardHeader>
            <CardTitle>Decision categories</CardTitle>
            <CardDescription>
              The outcomes recorded for each abstract. &ldquo;Acceptance&rdquo; outcomes send the
              acceptance email and can be assigned to sessions; non-acceptance outcomes send the
              rejection email.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {decisionOutcomes.map((o, i) => {
              const update = (patch: Partial<DecisionOutcomeDef>) =>
                setDecisionOutcomes((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 p-3">
                  <Input
                    className="flex-1 min-w-[140px]"
                    placeholder="Label (e.g. Oral)"
                    value={o.label}
                    onChange={(e) => update({ label: e.target.value, key: o.key || slugify(e.target.value) })}
                  />
                  <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={o.is_acceptance}
                      onChange={(e) => update({ is_acceptance: e.target.checked })}
                    />
                    Acceptance
                  </label>
                  <button
                    type="button"
                    onClick={() => setDecisionOutcomes((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-500"
                    aria-label="Remove decision category"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDecisionOutcomes((prev) => [...prev, { key: "", label: "", is_acceptance: true }])
              }
            >
              <Plus className="h-4 w-4" />
              Add decision category
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email</CardTitle>
            <CardDescription>
              Sender identity for outgoing email notifications. The address must be a verified identity in AWS SES.
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

        <Card>
          <CardHeader>
            <CardTitle>Email Template Preview Variables</CardTitle>
            <CardDescription>
              Sample values shown when previewing email templates. Leave a field blank to use the
              built-in placeholder.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {PREVIEW_VARIABLE_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="grid grid-cols-[180px_1fr] items-center gap-3">
                <label className="text-sm font-medium text-slate-700 truncate">
                  <code className="bg-slate-100 px-1 rounded text-xs">{`{${key}}`}</code>
                  <span className="ml-1.5 text-slate-500 font-normal">{label}</span>
                </label>
                <Input
                  placeholder={placeholder}
                  value={previewVars[key] ?? ""}
                  onChange={(e) =>
                    setPreviewVars((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
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
          {resetStep === "idle" ? (
            <>
              <p className="text-sm text-red-700 font-medium">Type <span className="font-mono bg-red-100 px-1 rounded">RESET</span> to continue:</p>
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
                onClick={handleRequestOtp}
              >
                Send confirmation code
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-red-700 font-medium">Enter the 6-digit code sent to your email:</p>
              <Input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="border-red-300 max-w-xs font-mono tracking-widest text-lg"
                maxLength={6}
              />
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={otpCode.length !== 6 || resetting}
                  loading={resetting}
                  onClick={handleReset}
                >
                  Reset all data
                </Button>
                <Button
                  variant="outline"
                  disabled={resetting}
                  onClick={() => { setResetStep("idle"); setOtpCode(""); setOtpToken(""); }}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
