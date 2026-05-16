"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { submissions, filesApi, type Submission, type Attachment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/submission/status-badge";
import { ActionButtons } from "@/components/submission/action-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, User, Calendar, Tag, Layers, Paperclip, Upload, File, Download, Loader2, Trash2 } from "lucide-react";

const ABSTRACT_DOC_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(ft: Attachment["file_type"]) {
  if (ft === "abstract_document") return "Document";
  if (ft === "final_presentation") return "Presentation";
  return "Poster";
}

function AttachmentsCard({
  submission,
  onAttachmentAdded,
  onAttachmentDeleted,
}: {
  submission: Submission;
  onAttachmentAdded: (a: Attachment) => void;
  onAttachmentDeleted: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canUpload = submission.status === "draft" || submission.status === "submitted";

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ABSTRACT_DOC_MIME.includes(file.type)) {
      toast({ title: "Unsupported file type", description: "Please upload a PDF or Word document.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Abstract documents must be under 10 MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { upload_url, storage_key } = await filesApi.requestUploadUrl({
        submission_id: submission.id,
        file_type: "abstract_document",
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      const putRes = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const attachment = await filesApi.confirmUpload({
        storage_key,
        submission_id: submission.id,
        file_type: "abstract_document",
        original_filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });

      onAttachmentAdded(attachment);
      toast({ title: "File uploaded", description: file.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    setDownloading(attachment.id);
    try {
      const { download_url } = await filesApi.downloadUrl(attachment.id);
      const res = await fetch(download_url);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to download file";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!confirm(`Delete "${attachment.original_filename}"?`)) return;
    setDeleting(attachment.id);
    try {
      await filesApi.deleteAttachment(attachment.id);
      onAttachmentDeleted(attachment.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete file";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  const docAttachments = submission.attachments.filter((a) => a.file_type === "abstract_document");
  const finalAttachments = submission.attachments.filter((a) => a.file_type !== "abstract_document");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Paperclip className="h-4 w-4" />
          Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {submission.attachments.length === 0 && !canUpload && (
          <p className="text-sm text-slate-400">No files attached.</p>
        )}

        {[...docAttachments, ...finalAttachments].map((att) => (
          <div key={att.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-slate-700 truncate">{att.original_filename}</p>
                <p className="text-xs text-slate-400">
                  {fileTypeLabel(att.file_type)} · {formatSize(att.size_bytes)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDownload(att)}
                disabled={downloading === att.id}
              >
                {downloading === att.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
              {canUpload && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400 hover:text-red-500"
                  onClick={() => handleDelete(att)}
                  disabled={deleting === att.id}
                >
                  {deleting === att.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}

        {canUpload && (
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc"
              onChange={handleFile}
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => inputRef.current?.click()}
              loading={uploading}
            >
              <Upload className="h-4 w-4" />
              Attach document
            </Button>
            <p className="text-xs text-slate-400 mt-1.5 text-center">PDF or Word, up to 10 MB</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AbstractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    submissions
      .get(id)
      .then(setSubmission)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load abstract";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleAttachmentAdded = (attachment: Attachment) => {
    setSubmission((prev) =>
      prev ? { ...prev, attachments: [...prev.attachments, attachment] } : prev
    );
  };

  const handleAttachmentDeleted = (attachmentId: string) => {
    setSubmission((prev) =>
      prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-slate-200 animate-pulse" />
        <div className="h-48 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-32 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Abstract not found.</p>
        <Button asChild className="mt-4">
          <Link href="/">Back to abstracts</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" />
          Back to abstracts
        </Link>
      </Button>

      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 mb-2">{submission.title}</h1>
          <StatusBadge status={submission.status} />
        </div>
        {user && (
          <ActionButtons
            submission={submission}
            userRole={user.role}
            userId={user.id}
            onUpdate={setSubmission}
          />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Abstract</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                {submission.abstract_text}
              </p>
            </CardContent>
          </Card>

          {submission.co_authors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Co-authors</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {submission.co_authors.map((ca) => (
                    <li key={ca.email} className="flex items-center gap-2 text-sm text-slate-700">
                      <User className="h-4 w-4 text-slate-400" />
                      {ca.name} {ca.institution && `(${ca.institution})`}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {submission.track && (
                <div className="flex items-start gap-2">
                  <Layers className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-medium mb-0.5">Track</p>
                    <p className="text-slate-700">{submission.track}</p>
                  </div>
                </div>
              )}
              {submission.submission_type_preference && (
                <div className="flex items-start gap-2">
                  <Layers className="h-4 w-4 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400 uppercase font-medium mb-0.5">Type Preference</p>
                    <p className="text-slate-700">{submission.submission_type_preference}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400 uppercase font-medium mb-0.5">Submitted</p>
                  <p className="text-slate-700">
                    {format(new Date(submission.submitted_at ?? submission.updated_at), "MMM d, yyyy")}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-400 uppercase font-medium mb-0.5">Last updated</p>
                  <p className="text-slate-700">
                    {format(new Date(submission.updated_at), "MMM d, yyyy HH:mm")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {submission.keywords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Keywords
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {submission.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <AttachmentsCard submission={submission} onAttachmentAdded={handleAttachmentAdded} onAttachmentDeleted={handleAttachmentDeleted} />

          {submission.status === "draft" && (
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/abstracts/${submission.id}/edit`}>Edit abstract</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
