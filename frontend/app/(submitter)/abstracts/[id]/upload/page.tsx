"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { filesApi, submissions } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, File, X, CheckCircle, Loader2 } from "lucide-react";

type FileType = "final_presentation" | "final_poster";

interface FileEntry {
  file: File;
  fileType: FileType;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const ALLOWED_MIME: Record<FileType, string[]> = {
  final_presentation: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  final_poster: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

const MAX_SIZE = 100 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadFilesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const presentationRef = useRef<HTMLInputElement>(null);
  const posterRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const addFiles = (files: FileList | null, fileType: FileType) => {
    if (!files) return;
    const newEntries: FileEntry[] = [];
    for (const file of Array.from(files)) {
      if (!ALLOWED_MIME[fileType].includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} must be a PDF or PPTX file.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 100 MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      newEntries.push({ file, fileType, status: "pending" });
    }
    setEntries((prev) => [...prev, ...newEntries]);
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateStatus = (index: number, update: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e, i) => (i === index ? { ...e, ...update } : e)));
  };

  const handleSubmit = async () => {
    if (!id || entries.length === 0) return;
    setSubmitting(true);

    let allOk = true;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.status === "done") continue;
      updateStatus(i, { status: "uploading" });

      try {
        const { upload_url, storage_key } = await filesApi.requestUploadUrl({
          submission_id: id,
          file_type: entry.fileType,
          original_filename: entry.file.name,
          mime_type: entry.file.type,
          size_bytes: entry.file.size,
        });

        const putRes = await fetch(upload_url, {
          method: "PUT",
          body: entry.file,
          headers: { "Content-Type": entry.file.type },
        });
        if (!putRes.ok) throw new Error("Upload to storage failed");

        await filesApi.confirmUpload({
          storage_key,
          submission_id: id,
          file_type: entry.fileType,
          original_filename: entry.file.name,
          mime_type: entry.file.type,
          size_bytes: entry.file.size,
        });

        updateStatus(i, { status: "done" });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        updateStatus(i, { status: "error", error: msg });
        allOk = false;
      }
    }

    if (allOk) {
      try {
        await submissions.submitFiles(id, new FormData());
      } catch {
        // Non-fatal if status transition already happened
      }
      toast({ title: "Files submitted", description: "Your final files have been received." });
      router.push(`/abstracts/${id}`);
    } else {
      toast({
        title: "Some files failed",
        description: "Fix the errors and try again.",
        variant: "destructive",
      });
    }
    setSubmitting(false);
  };

  const pendingCount = entries.filter((e) => e.status !== "done").length;

  return (
    <div className="max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/abstracts/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to abstract
        </Link>
      </Button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Submit Final Files</h1>
        <p className="text-sm text-slate-500 mt-1">PDF or PPTX, up to 100 MB each.</p>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Presentation</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors cursor-pointer"
              onClick={() => presentationRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Click to select presentation file</p>
              <p className="text-xs text-slate-400 mt-1">PDF or PPTX</p>
              <input
                ref={presentationRef}
                type="file"
                className="hidden"
                accept=".pdf,.pptx,.ppt"
                onChange={(e) => addFiles(e.target.files, "final_presentation")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Poster <span className="text-slate-400 font-normal text-sm">(optional)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors cursor-pointer"
              onClick={() => posterRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">Click to select poster file</p>
              <p className="text-xs text-slate-400 mt-1">PDF or PPTX</p>
              <input
                ref={posterRef}
                type="file"
                className="hidden"
                accept=".pdf,.pptx,.ppt"
                onChange={(e) => addFiles(e.target.files, "final_poster")}
              />
            </div>
          </CardContent>
        </Card>

        {entries.length > 0 && (
          <Card>
            <CardContent className="pt-4">
              <ul className="divide-y divide-slate-100">
                {entries.map((entry, i) => (
                  <li key={i} className="flex items-center justify-between py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {entry.status === "done" ? (
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      ) : entry.status === "uploading" ? (
                        <Loader2 className="h-5 w-5 text-indigo-500 animate-spin shrink-0" />
                      ) : (
                        <File className="h-5 w-5 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{entry.file.name}</p>
                        <p className="text-xs text-slate-400">
                          {entry.fileType === "final_presentation" ? "Presentation" : "Poster"} ·{" "}
                          {formatSize(entry.file.size)}
                          {entry.error && <span className="text-red-500 ml-2">{entry.error}</span>}
                        </p>
                      </div>
                    </div>
                    {entry.status !== "uploading" && entry.status !== "done" && (
                      <button
                        onClick={() => removeEntry(i)}
                        className="text-slate-400 hover:text-red-500 shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" asChild>
            <Link href={`/abstracts/${id}`}>Cancel</Link>
          </Button>
          <Button onClick={handleSubmit} disabled={pendingCount === 0} loading={submitting}>
            <Upload className="h-4 w-4" />
            Submit Files
          </Button>
        </div>
      </div>
    </div>
  );
}
