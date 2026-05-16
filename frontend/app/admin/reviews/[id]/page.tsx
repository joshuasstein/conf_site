"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { reviews as reviewsApi, type ReviewWithSubmission } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Star } from "lucide-react";

const reviewSchema = z.object({
  score: z.coerce.number().min(1).max(5),
  recommendation: z.enum(["oral", "poster", "reject"]),
  comments: z.string().optional(),
  comments_for_author: z.string().optional(),
});

type ReviewForm = z.infer<typeof reviewSchema>;

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<ReviewWithSubmission | null>(null);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { score: 3, recommendation: "oral" },
  });

  const score = watch("score");

  useEffect(() => {
    if (!id) return;
    reviewsApi
      .mine()
      .then((all) => {
        const found = all.find((r) => r.id === id) ?? null;
        setReview(found);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  const onSubmit = async (data: ReviewForm) => {
    if (!review) return;
    try {
      const updated = await reviewsApi.submit(review.id, data);
      setReview({ ...review, ...updated });
      toast({ title: "Review submitted", description: "Your review has been recorded." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to submit review";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-slate-200 animate-pulse" />
        <div className="h-48 rounded-lg bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (!review) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">Review not found.</p>
        <Button asChild className="mt-4"><Link href="/admin/reviews">Back</Link></Button>
      </div>
    );
  }

  const submitted = !!review.submitted_at;

  return (
    <div className="max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/reviews">
          <ArrowLeft className="h-4 w-4" />
          My Reviews
        </Link>
      </Button>

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900 leading-tight">
          {review.submission.title}
        </h1>
        <Badge variant={submitted ? "default" : "secondary"} className="shrink-0 mt-1">
          {submitted ? "Submitted" : "Pending"}
        </Badge>
      </div>

      {/* Abstract */}
      <Card>
        <CardHeader>
          <CardTitle>Abstract</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">
            {review.submission.abstract_text}
          </p>
          {review.submission.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {review.submission.keywords.map((kw) => (
                <span key={kw} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {kw}
                </span>
              ))}
            </div>
          )}
          {review.submission.track && (
            <p className="text-xs text-slate-400">Track: {review.submission.track}</p>
          )}
          {review.submission.submission_type_preference && (
            <p className="text-xs text-slate-400">
              Preference: <span className="capitalize">{review.submission.submission_type_preference}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Review form or completed view */}
      {submitted ? (
        <Card>
          <CardHeader>
            <CardTitle>Your Review</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs text-slate-400 uppercase mb-1">Score</p>
                <div className="flex items-center gap-1 font-semibold text-slate-800">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < (review.score ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-slate-200"}`}
                    />
                  ))}
                  <span className="ml-1">{review.score}/5</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase mb-1">Recommendation</p>
                <p className="font-semibold text-slate-800 capitalize">{review.recommendation}</p>
              </div>
            </div>
            {review.comments && (
              <div>
                <p className="text-xs text-slate-400 uppercase mb-1">Comments (confidential)</p>
                <p className="text-slate-700">{review.comments}</p>
              </div>
            )}
            {review.comments_for_author && (
              <div>
                <p className="text-xs text-slate-400 uppercase mb-1">Comments for author</p>
                <p className="text-slate-700">{review.comments_for_author}</p>
              </div>
            )}
            <p className="text-xs text-slate-400">
              Submitted {format(new Date(review.submitted_at!), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Submit Review</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Score */}
              <div className="space-y-2">
                <Label>
                  Score <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal ml-1">(1 = poor, 5 = excellent)</span>
                </Label>
                <Controller
                  name="score"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => field.onChange(n)}
                          className="focus:outline-none"
                        >
                          <Star
                            className={`h-7 w-7 transition-colors ${
                              n <= (score ?? 0)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-slate-200 hover:text-yellow-300"
                            }`}
                          />
                        </button>
                      ))}
                      <span className="ml-2 text-sm text-slate-600">{score}/5</span>
                    </div>
                  )}
                />
                {errors.score && <p className="text-xs text-red-600">{errors.score.message}</p>}
              </div>

              {/* Recommendation */}
              <div className="space-y-1.5">
                <Label>
                  Recommendation <span className="text-red-500">*</span>
                </Label>
                <Controller
                  name="recommendation"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="oral">Accept (Oral)</SelectItem>
                        <SelectItem value="poster">Accept (Poster)</SelectItem>
                        <SelectItem value="reject">Reject</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.recommendation && (
                  <p className="text-xs text-red-600">{errors.recommendation.message}</p>
                )}
              </div>

              {/* Comments (confidential) */}
              <div className="space-y-1.5">
                <Label>
                  Comments{" "}
                  <span className="text-slate-400 font-normal">(confidential — not shown to authors)</span>
                </Label>
                <Textarea
                  rows={4}
                  placeholder="Notes for the program committee..."
                  {...register("comments")}
                />
              </div>

              {/* Comments for author */}
              <div className="space-y-1.5">
                <Label>Comments for author</Label>
                <Textarea
                  rows={4}
                  placeholder="Feedback that will be shared with the submitter..."
                  {...register("comments_for_author")}
                />
              </div>

              <Button type="submit" loading={isSubmitting}>
                Submit Review
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
