"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  programTemplates,
  getAccessToken,
  type ProgramTemplateSummary,
  type ProgramTemplateFile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  Save,
  Upload,
  Download,
  CalendarPlus,
  Trash2,
  Layers,
} from "lucide-react";

export default function ProgramTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ProgramTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Save-current dialog
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  // Apply dialog
  const [applyTarget, setApplyTarget] = useState<ProgramTemplateSummary | null>(null);
  const [applyDate, setApplyDate] = useState("");
  const [applyPublish, setApplyPublish] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    programTemplates
      .list()
      .then(setTemplates)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load templates";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.role === "admin") load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const handleSaveCurrent = async () => {
    if (!saveName.trim()) return;
    setBusy(true);
    try {
      await programTemplates.saveCurrent({
        name: saveName.trim(),
        description: saveDesc.trim() || undefined,
      });
      toast({ title: "Saved", description: `Template "${saveName.trim()}" created.` });
      setSaveOpen(false);
      setSaveName("");
      setSaveDesc("");
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save template";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (t: ProgramTemplateSummary) => {
    try {
      const token = getAccessToken();
      const res = await fetch(programTemplates.exportUrl(t.id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = t.name.replace(/[^a-z0-9-_]+/gi, "_") || "template";
      a.download = `${safe}.template.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `${a.download} saved.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Export failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ProgramTemplateFile;
      if (!parsed || !Array.isArray(parsed.sessions) || !parsed.name) {
        throw new Error("This file does not look like a program template.");
      }
      await programTemplates.import(parsed);
      toast({ title: "Imported", description: `Template "${parsed.name}" added.` });
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast({ title: "Import failed", description: msg, variant: "destructive" });
    }
  };

  const openApply = (t: ProgramTemplateSummary) => {
    setApplyTarget(t);
    setApplyDate("");
    setApplyPublish(false);
  };

  const handleApply = async () => {
    if (!applyTarget) return;
    setBusy(true);
    try {
      const res = await programTemplates.apply(applyTarget.id, {
        new_start_date: applyDate || undefined,
        publish: applyPublish,
      });
      toast({
        title: "Applied",
        description: `${res.created} session${res.created !== 1 ? "s" : ""} created${
          applyDate ? ` starting ${applyDate}` : ""
        }.`,
      });
      setApplyTarget(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Apply failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (t: ProgramTemplateSummary) => {
    if (!confirm(`Delete template "${t.name}"? This cannot be undone.`)) return;
    try {
      await programTemplates.remove(t.id);
      toast({ title: "Deleted", description: `Template "${t.name}" removed.` });
      setTemplates((prev) => prev.filter((x) => x.id !== t.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Only admins can manage program templates.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2">
        <Link
          href="/admin/sessions"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Sessions
        </Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Program Templates</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Save the empty program structure — sessions with their dates, times, rooms, and types
            but no assigned abstracts. Export it to a file, then import and apply it next year to
            rebuild the schedule after the conference data has been reset.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <Button onClick={() => setSaveOpen(true)}>
            <Save className="h-4 w-4" />
            Save current program
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3">No templates yet.</p>
          <p className="text-sm">
            Build your sessions, then <strong>Save current program</strong> to capture the layout —
            or <strong>Import</strong> a template file from a previous year.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <span className="shrink-0 text-xs text-slate-500">
                    {format(parseISO(t.created_at), "MMM d, yyyy")}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {t.description && (
                  <p className="text-sm text-slate-600 mb-3">{t.description}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <Layers className="h-4 w-4" />
                    {t.session_count} session{t.session_count !== 1 ? "s" : ""}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => openApply(t)}>
                      <CalendarPlus className="h-4 w-4" />
                      Apply
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleExport(t)}>
                      <Download className="h-4 w-4" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(t)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Save current program */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save current program as template</DialogTitle>
            <DialogDescription>
              Captures every session&apos;s date, time, room, type, and chair — without the assigned
              abstracts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. PVPMC 2026 standard layout"
              />
            </div>
            <div>
              <Label htmlFor="tpl-desc">Description (optional)</Label>
              <Textarea
                id="tpl-desc"
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveCurrent} disabled={busy || !saveName.trim()}>
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply template */}
      <Dialog open={!!applyTarget} onOpenChange={(o) => !o && setApplyTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply &ldquo;{applyTarget?.name}&rdquo;</DialogTitle>
            <DialogDescription>
              Creates {applyTarget?.session_count} empty session
              {applyTarget?.session_count !== 1 ? "s" : ""} in the live program. This adds to any
              existing sessions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="apply-date">New start date (optional)</Label>
              <Input
                id="apply-date"
                type="date"
                value={applyDate}
                onChange={(e) => setApplyDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-500">
                All sessions shift so the earliest lands on this date, keeping the gaps between days.
                Leave blank to use the template&apos;s stored dates.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={applyPublish}
                onChange={(e) => setApplyPublish(e.target.checked)}
              />
              Publish the created sessions immediately
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={busy}>
              Apply template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
