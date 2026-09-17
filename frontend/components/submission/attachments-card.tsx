"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { filesApi, type Submission, type Attachment } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { Paperclip, Upload, File, Download, Loader2, Trash2 } from "lucide-react";

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

export function AttachmentsCard({
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
      // The presigned URL sets Content-Disposition: attachment, so a plain top-level
      // navigation downloads the file with its real name. Avoid a cross-origin fetch()
      // to R2, which the browser blocks unless the bucket has a CORS policy.
      const { download_url } = await filesApi.downloadUrl(attachment.id);
      const a = document.createElement("a");
      a.href = download_url;
      a.download = attachment.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

  // Presentation files only apply once the presenter has confirmed their accepted spot.
  const isConfirmed = submission.status === "confirmed";
  const filesSubmitted = submission.status === "files_submitted";
  const showPresentation = isConfirmed || filesSubmitted;

  const fileRow = (att: Attachment, deletable: boolean) => (
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
        <Button variant="ghost" size="sm" onClick={() => handleDownload(att)} disabled={downloading === att.id}>
          {downloading === att.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </Button>
        {deletable && (
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-red-500"
            onClick={() => handleDelete(att)}
            disabled={deleting === att.id}
          >
            {deleting === att.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Abstract document */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4" />
            Full abstract document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canUpload && (
            <p className="text-sm text-slate-600">
              Attach your full abstract as a PDF or Word document, <span className="font-medium">including any
              figures</span>. Reviewers evaluate this uploaded version, so it&rsquo;s strongly recommended.
            </p>
          )}

          {docAttachments.length > 0
            ? docAttachments.map((att) => fileRow(att, canUpload))
            : canUpload
              ? (
                <p className="text-sm text-amber-600">
                  No document attached yet — reviewers will only see the text above.
                </p>
              )
              : <p className="text-sm text-slate-400">No abstract document uploaded.</p>}

          {canUpload && (
            <div>
              <input ref={inputRef} type="file" className="hidden" accept=".pdf,.docx,.doc" onChange={handleFile} />
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => inputRef.current?.click()}
                loading={uploading}
              >
                <Upload className="h-4 w-4" />
                {docAttachments.length > 0 ? "Replace / add document" : "Attach full abstract (with figures)"}
              </Button>
              <p className="text-xs text-slate-400 mt-1.5 text-center">PDF or Word, up to 10 MB</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Presentation files — only after the presenter confirms their accepted spot */}
      {showPresentation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Presentation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {finalAttachments.length > 0
              ? finalAttachments.map((att) => fileRow(att, false))
              : <p className="text-sm text-amber-600">No presentation files uploaded yet.</p>}

            {isConfirmed && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/abstracts/${submission.id}/upload`}>
                  <Upload className="h-4 w-4" />
                  {finalAttachments.length > 0 ? "Upload more files" : "Upload presentation files"}
                </Link>
              </Button>
            )}
            {filesSubmitted && (
              <p className="text-xs text-green-600 text-center">Your presentation files have been submitted.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
