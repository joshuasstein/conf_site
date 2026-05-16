"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { submissions, type Submission } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/submission/status-badge";
import { ActionButtons } from "@/components/submission/action-buttons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, User, Calendar, Tag, Layers } from "lucide-react";

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
                    {format(new Date(submission.created_at), "MMM d, yyyy")}
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
