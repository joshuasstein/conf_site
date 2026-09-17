"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { submissions, type Submission } from "@/lib/api";
import { StatusBadge } from "@/components/submission/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, FileText, ChevronRight, Send, TriangleAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function SubmitterDashboard() {
  const [abstracts, setAbstracts] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    submissions
      .list()
      .then(setAbstracts)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load abstracts";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const draftCount = abstracts.filter((a) => a.status === "draft").length;

  const handleSubmitDraft = async (e: React.MouseEvent, id: string) => {
    // The card is a link; don't navigate when clicking the Submit button.
    e.preventDefault();
    e.stopPropagation();
    setSubmittingId(id);
    try {
      const updated = await submissions.submit(id);
      setAbstracts((prev) => prev.map((a) => (a.id === id ? updated : a)));
      toast({ title: "Submitted for review", description: "Your abstract is now in the review queue." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Submissions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your conference abstract submissions
          </p>
        </div>
        <Button asChild>
          <Link href="/abstracts/new">
            <PlusCircle className="h-4 w-4" />
            New Abstract
          </Link>
        </Button>
      </div>

      {!loading && draftCount > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
          <TriangleAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">
            You have <span className="font-semibold">{draftCount} draft{draftCount !== 1 ? "s" : ""}</span>{" "}
            that {draftCount !== 1 ? "have" : "has"} not been submitted. A draft is{" "}
            <span className="font-medium">not reviewed</span> until you submit it — use the{" "}
            <span className="font-medium">Submit for Review</span> button below.
          </p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : abstracts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <FileText className="h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">No submissions yet</h3>
            <p className="text-sm text-slate-500 mb-6 max-w-sm">
              You haven&apos;t submitted any abstracts. Start by creating your first submission.
            </p>
            <Button asChild>
              <Link href="/abstracts/new">
                <PlusCircle className="h-4 w-4" />
                Create your first abstract
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {abstracts.map((abstract) => {
            const isDraft = abstract.status === "draft";
            return (
            <Link key={abstract.id} href={`/abstracts/${abstract.id}`}>
              <Card className={cn("hover:shadow-md transition-shadow cursor-pointer", isDraft && "border-amber-300 bg-amber-50/40")}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base font-semibold text-slate-900 line-clamp-2">
                      {abstract.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={abstract.status} />
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                    {abstract.abstract_text}
                  </p>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                    {abstract.track && (
                      <span>Track: <span className="text-slate-600">{abstract.track}</span></span>
                    )}
                    {abstract.keywords.length > 0 && (
                      <span>
                        Keywords:{" "}
                        <span className="text-slate-600">{abstract.keywords.slice(0, 3).join(", ")}</span>
                      </span>
                    )}
                    <span>
                      Updated{" "}
                      {formatDistanceToNow(new Date(abstract.updated_at), { addSuffix: true })}
                    </span>
                  </div>
                  {isDraft && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-amber-200 pt-3">
                      <span className="text-xs font-medium text-amber-700">Not submitted yet</span>
                      <Button
                        size="sm"
                        loading={submittingId === abstract.id}
                        onClick={(e) => handleSubmitDraft(e, abstract.id)}
                      >
                        <Send className="h-4 w-4" />
                        Submit for Review
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
