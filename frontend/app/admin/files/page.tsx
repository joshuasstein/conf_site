"use client";

import { useEffect, useMemo, useState } from "react";
import { filesApi, type AdminFile, type SessionFiles, type SlotFileStatus } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Download,
  Search,
  FileText,
  Presentation,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

type Tab = "all" | "by-session";

const FILE_TYPE_LABEL: Record<AdminFile["file_type"], string> = {
  final_presentation: "Slides",
  final_poster: "Poster",
  abstract_document: "Abstract",
};

function fileTypeIcon(type: AdminFile["file_type"]) {
  if (type === "final_presentation") return Presentation;
  if (type === "final_poster") return ImageIcon;
  return FileText;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatSessionWhen(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}`);
  if (isNaN(d.getTime())) return `${dateStr} ${timeStr}`;
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

async function downloadAttachment(attachmentId: string, filename: string): Promise<void> {
  const { download_url } = await filesApi.downloadUrl(attachmentId);
  const res = await fetch(download_url);
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AdminFilesPage() {
  const [tab, setTab] = useState<Tab>("all");
  const [allFiles, setAllFiles] = useState<AdminFile[]>([]);
  const [sessions, setSessions] = useState<SessionFiles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // All Files filters
  const [typeFilter, setTypeFilter] = useState<"all" | AdminFile["file_type"]>("all");
  const [query, setQuery] = useState("");
  // By Session filter
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([filesApi.listAll(), filesApi.bySession()])
      .then(([files, sess]) => {
        if (cancelled) return;
        setAllFiles(files);
        setSessions(sess);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load files");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDownload = async (attachmentId: string, filename: string) => {
    setDownloading(attachmentId);
    try {
      await downloadAttachment(attachmentId, filename);
    } catch (err: unknown) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to download",
        variant: "destructive",
      });
    } finally {
      setDownloading(null);
    }
  };

  const filteredFiles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allFiles.filter((f) => {
      if (typeFilter !== "all" && f.file_type !== typeFilter) return false;
      if (!q) return true;
      return (
        f.original_filename.toLowerCase().includes(q) ||
        f.presenter_name.toLowerCase().includes(q) ||
        f.submission_title.toLowerCase().includes(q) ||
        (f.session_title ?? "").toLowerCase().includes(q)
      );
    });
  }, [allFiles, typeFilter, query]);

  const visibleSessions = useMemo(
    () => (onlyMissing ? sessions.filter((s) => s.total_missing > 0) : sessions),
    [sessions, onlyMissing],
  );

  const totalMissing = sessions.reduce((n, s) => n + s.total_missing, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <FolderOpen className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-slate-900">Files</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Monitor and download presenter uploads, and track which session slots are still missing presentations.
      </p>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-5">
        <button
          onClick={() => setTab("all")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "all"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          All Files{allFiles.length ? ` (${allFiles.length})` : ""}
        </button>
        <button
          onClick={() => setTab("by-session")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
            tab === "by-session"
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          By Session
          {totalMissing > 0 && (
            <span className="ml-2 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">
              {totalMissing} missing
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 py-16 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading files…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      ) : tab === "all" ? (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search filename, presenter, title, session…"
                className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">All types</option>
              <option value="final_presentation">Slides</option>
              <option value="final_poster">Posters</option>
              <option value="abstract_document">Abstracts</option>
            </select>
          </div>

          <Card>
            <CardContent className="p-0">
              {filteredFiles.length === 0 ? (
                <p className="text-sm text-slate-500 p-6 text-center">No files match.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Presenter</TableHead>
                        <TableHead>Submission</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead>Uploaded</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFiles.map((f) => {
                        const Icon = fileTypeIcon(f.file_type);
                        return (
                          <TableRow key={f.attachment_id}>
                            <TableCell className="max-w-[220px]">
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                                <span className="truncate" title={f.original_filename}>
                                  {f.original_filename}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary">{FILE_TYPE_LABEL[f.file_type]}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{f.presenter_name}</TableCell>
                            <TableCell className="max-w-[220px]">
                              <span className="truncate block" title={f.submission_title}>
                                {f.submission_title}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-600">
                              {f.session_title
                                ? `${f.session_title}${f.slot_order ? ` · #${f.slot_order}` : ""}`
                                : "—"}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap text-slate-500">
                              {formatSize(f.size_bytes)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-slate-500">
                              {formatDateTime(f.uploaded_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                loading={downloading === f.attachment_id}
                                onClick={() => handleDownload(f.attachment_id, f.original_filename)}
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyMissing}
              onChange={(e) => setOnlyMissing(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Only show sessions with missing presentations
          </label>

          {visibleSessions.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">
              {onlyMissing ? "No sessions are missing presentations. 🎉" : "No sessions with slots yet."}
            </p>
          ) : (
            <div className="space-y-4">
              {visibleSessions.map((s) => (
                <SessionCard
                  key={s.session_id}
                  session={s}
                  downloading={downloading}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SessionCard({
  session,
  downloading,
  onDownload,
}: {
  session: SessionFiles;
  downloading: string | null;
  onDownload: (id: string, filename: string) => void;
}) {
  const complete = session.total_expected > 0 && session.total_missing === 0;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">{session.title}</CardTitle>
            <CardDescription>
              {formatSessionWhen(session.session_date, session.start_time)}
              {session.room ? ` · ${session.room}` : ""}
              {session.chair_name ? ` · Chair: ${session.chair_name}` : ""}
            </CardDescription>
          </div>
          {session.total_expected === 0 ? (
            <Badge variant="secondary">No presentations expected</Badge>
          ) : complete ? (
            <Badge variant="success">All {session.total_expected} uploaded</Badge>
          ) : (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {session.total_uploaded}/{session.total_expected} uploaded
              </Badge>
              <Badge variant="destructive">{session.total_missing} missing</Badge>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-slate-100">
          {session.slots.map((slot) => (
            <SlotRow
              key={slot.slot_id}
              slot={slot}
              downloading={downloading}
              onDownload={onDownload}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SlotRow({
  slot,
  downloading,
  onDownload,
}: {
  slot: SlotFileStatus;
  downloading: string | null;
  onDownload: (id: string, filename: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-slate-400 w-6 shrink-0">#{slot.slot_order}</span>
        <div className="min-w-0">
          {slot.submission_title ? (
            <>
              <div className="text-sm text-slate-800 truncate" title={slot.submission_title}>
                {slot.submission_title}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {slot.presenter_name} · <span className="capitalize">{slot.slot_type}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 capitalize">{slot.slot_type}</div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!slot.expected ? (
          <span className="text-xs text-slate-400">—</span>
        ) : slot.uploaded ? (
          <>
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <CheckCircle className="h-4 w-4" /> Uploaded
            </span>
            {slot.attachments.map((att) => (
              <Button
                key={att.attachment_id}
                size="sm"
                variant="outline"
                loading={downloading === att.attachment_id}
                onClick={() => onDownload(att.attachment_id, att.original_filename)}
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
            ))}
          </>
        ) : (
          <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertCircle className="h-4 w-4" /> Missing
          </span>
        )}
      </div>
    </div>
  );
}
