"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { submissions } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, File, X } from "lucide-react";

export default function UploadFilesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of selected) {
        if (!merged.some((x) => x.name === f.name)) merged.push(f);
      }
      return merged;
    });
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const handleUpload = async () => {
    if (!id || files.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      await submissions.submitFiles(Number(id), formData);
      toast({ title: "Files submitted", description: "Your files have been uploaded." });
      router.push(`/abstracts/${id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/abstracts/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to abstract
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Submit Final Files</h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload your final presentation files (slides, paper, etc.)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>File Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-indigo-400 transition-colors cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-700">
              Click to select files or drag and drop
            </p>
            <p className="text-xs text-slate-400 mt-1">PDF, PPTX, DOCX up to 50MB each</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.pptx,.ppt,.docx,.doc"
              onChange={handleFileChange}
            />
          </div>

          {files.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {files.map((f) => (
                <li key={f.name} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <File className="h-5 w-5 text-slate-400" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">{f.name}</p>
                      <p className="text-xs text-slate-400">{formatSize(f.size)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(f.name)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" asChild>
              <Link href={`/abstracts/${id}`}>Cancel</Link>
            </Button>
            <Button
              onClick={handleUpload}
              disabled={files.length === 0}
              loading={uploading}
            >
              <Upload className="h-4 w-4" />
              Submit Files
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
