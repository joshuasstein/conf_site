"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AbstractForm } from "@/components/submission/abstract-form";
import { sessionApi, submissions, type SubmissionCreate } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewAbstractPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tracks, setTracks] = useState<string[]>([]);

  useEffect(() => {
    sessionApi.conferenceInfo().then((info) => setTracks(info.tracks ?? [])).catch(() => {});
  }, []);

  const handleSubmit = async (data: SubmissionCreate) => {
    setLoading(true);
    try {
      const created = await submissions.create(data);
      toast({
        title: "Draft saved",
        description: "Not submitted yet — click Submit for Review on the next screen to send it to the committee.",
      });
      router.push(`/abstracts/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create abstract";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to abstracts
          </Link>
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">New Abstract</h1>
        <p className="text-sm text-slate-500 mt-1">
          Fill in your abstract details and save the draft. It is only sent to the committee once you
          click <span className="font-medium">Submit for Review</span> on the abstract page.
        </p>
      </div>
      <AbstractForm onSubmit={handleSubmit} submitLabel="Save Draft" loading={loading} tracks={tracks} />
    </div>
  );
}
