"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { submissions, type Submission } from "@/lib/api";
import { StatusBadge } from "@/components/submission/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { PlusCircle, FileText, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function SubmitterDashboard() {
  const [abstracts, setAbstracts] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

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
          {abstracts.map((abstract) => (
            <Link key={abstract.id} href={`/abstracts/${abstract.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
