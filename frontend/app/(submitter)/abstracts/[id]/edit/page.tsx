"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { sessionApi, submissions, type Attachment, type Submission, type SubmissionCreate } from "@/lib/api";
import { AbstractForm } from "@/components/submission/abstract-form";
import { AttachmentsCard } from "@/components/submission/attachments-card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function EditAbstractPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [tracks, setTracks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sessionApi.conferenceInfo().then((info) => setTracks(info.tracks ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    submissions
      .get(id)
      .then((data) => {
        if (data.status !== "draft") {
          toast({
            title: "Cannot edit",
            description: "Only draft abstracts can be edited.",
            variant: "destructive",
          });
          router.push(`/abstracts/${id}`);
          return;
        }
        setSubmission(data);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load abstract";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleSubmit = async (data: SubmissionCreate) => {
    if (!id) return;
    setSaving(true);
    try {
      await submissions.update(id, data);
      toast({
        title: "Draft saved",
        description: "Still a draft — click Submit for Review to send it to the committee.",
      });
      router.push(`/abstracts/${id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-slate-200 animate-pulse" />
        <div className="h-96 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!submission) return null;

  const handleAttachmentAdded = (attachment: Attachment) =>
    setSubmission((prev) => (prev ? { ...prev, attachments: [...prev.attachments, attachment] } : prev));
  const handleAttachmentDeleted = (attachmentId: string) =>
    setSubmission((prev) =>
      prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attachmentId) } : prev,
    );

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
        <Link href={`/abstracts/${id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to abstract
        </Link>
      </Button>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Edit Abstract</h1>
        <p className="text-sm text-slate-500 mt-1">
          Make changes to your draft, and attach your full abstract document (with figures) for the
          reviewers. Only draft abstracts can be edited.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AbstractForm
            defaultValues={{
              title: submission.title,
              abstract_text: submission.abstract_text,
              co_authors: submission.co_authors,
              keywords: submission.keywords,
              track: submission.track,
              submission_type_preference: submission.submission_type_preference,
            }}
            onSubmit={handleSubmit}
            submitLabel="Save Changes"
            loading={saving}
            tracks={tracks}
          />
        </div>
        <div>
          <AttachmentsCard
            submission={submission}
            onAttachmentAdded={handleAttachmentAdded}
            onAttachmentDeleted={handleAttachmentDeleted}
          />
        </div>
      </div>
    </div>
  );
}
