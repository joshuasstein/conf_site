"use client";

import { useEffect, useState } from "react";
import { admin, type EmailTemplate } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Mail, ChevronDown, ChevronRight } from "lucide-react";

const ALIAS_LABELS: Record<string, string> = {
  "submission-confirmation": "Submission Confirmation",
  "decision-accepted": "Decision — Accepted",
  "decision-rejected": "Decision — Rejected",
  "review-assignment": "Review Assignment",
  "file-submission-reminder": "File Submission Reminder",
  "email-verification": "Email Verification",
  "confirmation-reminder": "Confirmation Reminder",
  "admin-reset-otp": "Admin Reset OTP",
};

const ALIAS_DESCRIPTIONS: Record<string, string> = {
  "submission-confirmation": "Sent to submitters when their abstract is received.",
  "decision-accepted": "Sent when an accepted abstract is notified. Variables: {full_name}, {submission_title}, {outcome}, {slot}, {submission_url}, {program_url}",
  "decision-rejected": "Sent when a rejected abstract is notified. Variables: {full_name}, {submission_title}",
  "review-assignment": "Sent to reviewers when assigned a submission. Variables: {full_name}, {submission_title}, {submission_url}",
  "file-submission-reminder": "Sent when the program chair requests a revised file. Variables: {full_name}, {submission_title}, {slot}, {submission_url}, {program_url}",
  "email-verification": "Sent on account registration. Variables: {full_name}, {verify_url}",
  "confirmation-reminder": "Reminder for accepted presenters to confirm. Variables: {full_name}, {submission_title}, {slot}, {confirmation_deadline}, {submission_url}, {program_url}",
  "admin-reset-otp": "OTP code sent when a database reset is requested. Variables: {full_name}, {otp_code}",
};

interface EditState {
  subject: string;
  html: string;
  text: string;
}

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    admin
      .getEmailTemplates()
      .then((data) => {
        setTemplates(data);
        const initial: Record<string, EditState> = {};
        for (const t of data) {
          initial[t.alias] = { subject: t.subject, html: t.html, text: t.text };
        }
        setEdits(initial);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load templates";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins can manage email templates.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 max-w-3xl">
        <div className="h-8 w-56 rounded bg-slate-200 animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  const handleSave = async (alias: string) => {
    const edit = edits[alias];
    if (!edit) return;
    setSaving(alias);
    try {
      const updated = await admin.updateEmailTemplate(alias, edit);
      setTemplates((prev) => prev.map((t) => (t.alias === alias ? updated : t)));
      toast({ title: "Saved", description: `${ALIAS_LABELS[alias] ?? alias} updated.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleReset = (alias: string) => {
    const original = templates.find((t) => t.alias === alias);
    if (!original) return;
    setEdits((prev) => ({
      ...prev,
      [alias]: { subject: original.subject, html: original.html, text: original.text },
    }));
  };

  const isDirty = (alias: string) => {
    const original = templates.find((t) => t.alias === alias);
    const edit = edits[alias];
    if (!original || !edit) return false;
    return (
      edit.subject !== original.subject ||
      edit.html !== original.html ||
      edit.text !== original.text
    );
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <Mail className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Email Templates</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Customise the subject and body of outgoing emails. Use{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">{"{variable_name}"}</code> for
            dynamic values. All templates have access to{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">{"{conference_name}"}</code>,{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">{"{conference_location}"}</code>,
            and{" "}
            <code className="bg-slate-100 px-1 rounded text-xs">{"{conference_dates}"}</code>.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {templates.map((template) => {
          const isOpen = expanded === template.alias;
          const edit = edits[template.alias] ?? {
            subject: template.subject,
            html: template.html,
            text: template.text,
          };
          const dirty = isDirty(template.alias);

          return (
            <Card key={template.alias} className={isOpen ? "border-indigo-200" : ""}>
              <CardHeader
                className="cursor-pointer select-none py-4"
                onClick={() => setExpanded(isOpen ? null : template.alias)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <CardTitle className="text-base">
                        {ALIAS_LABELS[template.alias] ?? template.alias}
                        {dirty && (
                          <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            unsaved
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {ALIAS_DESCRIPTIONS[template.alias]}
                      </CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>

              {isOpen && (
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Input
                      value={edit.subject}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [template.alias]: { ...edit, subject: e.target.value },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>HTML body</Label>
                    <Textarea
                      value={edit.html}
                      rows={10}
                      className="font-mono text-xs"
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [template.alias]: { ...edit, html: e.target.value },
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Plain-text body</Label>
                    <Textarea
                      value={edit.text}
                      rows={6}
                      className="font-mono text-xs"
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [template.alias]: { ...edit, text: e.target.value },
                        }))
                      }
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      onClick={() => handleSave(template.alias)}
                      loading={saving === template.alias}
                      disabled={!dirty || saving === template.alias}
                    >
                      Save
                    </Button>
                    {dirty && (
                      <Button variant="outline" onClick={() => handleReset(template.alias)}>
                        Discard changes
                      </Button>
                    )}
                    <span className="ml-auto text-xs text-slate-400">
                      Last saved{" "}
                      {new Date(template.updated_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
