"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { reviews as reviewsApi, type ReviewWithSubmission } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { ClipboardList, CheckCircle, Clock } from "lucide-react";

export default function MyReviewsPage() {
  const [myReviews, setMyReviews] = useState<ReviewWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reviewsApi
      .mine()
      .then(setMyReviews)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load reviews";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded bg-slate-200 animate-pulse" />
        <div className="h-40 rounded-lg bg-slate-200 animate-pulse" />
        <div className="h-40 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  const pending = myReviews.filter((r) => !r.submitted_at);
  const completed = myReviews.filter((r) => r.submitted_at);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Reviews</h1>
        <p className="text-sm text-slate-500 mt-1">
          {pending.length} pending · {completed.length} completed
        </p>
      </div>

      {myReviews.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No reviews assigned yet.</p>
          </CardContent>
        </Card>
      )}

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4" /> Pending
          </h2>
          <div className="space-y-3">
            {pending.map((rev) => (
              <ReviewCard key={rev.id} review={rev} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" /> Completed
          </h2>
          <div className="space-y-3">
            {completed.map((rev) => (
              <ReviewCard key={rev.id} review={rev} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ReviewCard({ review }: { review: ReviewWithSubmission }) {
  const done = !!review.submitted_at;
  return (
    <Card className="hover:border-indigo-200 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <CardTitle className="text-base font-semibold text-slate-900 leading-snug">
            {review.submission.title}
          </CardTitle>
          <Badge variant={done ? "default" : "secondary"} className="shrink-0">
            {done ? "Done" : "Pending"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600 line-clamp-3">{review.submission.abstract_text}</p>
        <div className="flex flex-wrap gap-1">
          {review.submission.keywords.slice(0, 5).map((kw) => (
            <span key={kw} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {kw}
            </span>
          ))}
        </div>
        {done && (
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>Score: <strong className="text-slate-800">{review.score}/5</strong></span>
            <span>Recommendation: <strong className="text-slate-800 capitalize">{review.recommendation}</strong></span>
            <span className="ml-auto text-xs">
              Submitted {format(new Date(review.submitted_at!), "MMM d, yyyy")}
            </span>
          </div>
        )}
        <div className="flex justify-end">
          <Button asChild size="sm" variant={done ? "outline" : "default"}>
            <Link href={`/admin/reviews/${review.id}`}>
              {done ? "View" : "Write Review"}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
