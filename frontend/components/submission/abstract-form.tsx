"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { X, Plus } from "lucide-react";
import type { SubmissionCreate, CoAuthor } from "@/lib/api";

const coAuthorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  institution: z.string().optional(),
});

const abstractSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(300, "Title is too long"),
  abstract_text: z
    .string()
    .min(100, "Abstract must be at least 100 characters")
    .max(5000, "Abstract is too long"),
  track: z.string().optional(),
  submission_type_preference: z.string().optional(),
  co_authors: z.array(coAuthorSchema),
  keywords: z.array(z.string().min(1)).min(1, "Add at least one keyword"),
});

export type AbstractFormData = z.infer<typeof abstractSchema>;

interface AbstractFormProps {
  defaultValues?: Partial<AbstractFormData>;
  onSubmit: (data: SubmissionCreate) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  tracks?: string[];
}

export function AbstractForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  loading = false,
  tracks = [],
}: AbstractFormProps) {
  const [keywordInput, setKeywordInput] = useState("");
  const [coAuthorDraft, setCoAuthorDraft] = useState<{ name: string; email: string; institution: string }>({
    name: "",
    email: "",
    institution: "",
  });
  const [coAuthorError, setCoAuthorError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AbstractFormData>({
    resolver: zodResolver(abstractSchema),
    defaultValues: {
      title: "",
      abstract_text: "",
      track: undefined,
      submission_type_preference: "either",
      co_authors: [],
      keywords: [],
      ...defaultValues,
    },
  });

  const keywords = watch("keywords");
  const coAuthors = watch("co_authors");

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setValue("keywords", [...keywords, kw]);
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    setValue("keywords", keywords.filter((k) => k !== kw));
  };

  const addCoAuthor = () => {
    setCoAuthorError(null);
    const parsed = coAuthorSchema.safeParse(coAuthorDraft);
    if (!parsed.success) {
      setCoAuthorError(parsed.error.errors[0].message);
      return;
    }
    const already = coAuthors.some((c) => c.email === coAuthorDraft.email);
    if (already) {
      setCoAuthorError("This email is already listed.");
      return;
    }
    setValue("co_authors", [
      ...coAuthors,
      {
        name: coAuthorDraft.name.trim(),
        email: coAuthorDraft.email.trim(),
        institution: coAuthorDraft.institution.trim() || undefined,
      },
    ]);
    setCoAuthorDraft({ name: "", email: "", institution: "" });
  };

  const removeCoAuthor = (email: string) => {
    setValue("co_authors", coAuthors.filter((c) => c.email !== email));
  };

  const handleFormSubmit = async (data: AbstractFormData) => {
    await onSubmit({
      title: data.title,
      abstract_text: data.abstract_text,
      co_authors: data.co_authors as CoAuthor[],
      keywords: data.keywords,
      track: data.track,
      submission_type_preference: data.submission_type_preference,
    });
  };

  const abstractText = watch("abstract_text");

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Abstract Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              placeholder="Enter the title of your abstract"
              {...register("title")}
            />
            {errors.title && <p className="text-xs text-red-600">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="abstract_text">
                Short Public Abstract (this will be visible in the public program){" "}
                <span className="text-red-500">*</span>
              </Label>
              <span className="text-xs text-slate-400">{abstractText?.length ?? 0} / 5000</span>
            </div>
            <Textarea
              id="abstract_text"
              rows={8}
              placeholder="Write your abstract here"
              {...register("abstract_text")}
            />
            {errors.abstract_text && (
              <p className="text-xs text-red-600">{errors.abstract_text.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Track</Label>
              <Controller
                name="track"
                control={control}
                render={({ field }) =>
                  tracks.length > 0 ? (
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select track..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tracks.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      placeholder="Enter track name..."
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value || undefined)}
                    />
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Presentation preference</Label>
              <Controller
                name="submission_type_preference"
                control={control}
                render={({ field }) => (
                  <Select value={field.value ?? "either"} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oral">Oral</SelectItem>
                      <SelectItem value="poster">Poster</SelectItem>
                      <SelectItem value="either">Either</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keywords <span className="text-red-500">*</span></CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Add a keyword and press Enter..."
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addKeyword(); }
              }}
            />
            <Button type="button" variant="outline" onClick={addKeyword}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {errors.keywords && (
            <p className="text-xs text-red-600">{errors.keywords.message}</p>
          )}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700"
                >
                  {kw}
                  <button type="button" onClick={() => removeKeyword(kw)} className="text-indigo-400 hover:text-indigo-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Co-authors <span className="text-slate-400 font-normal text-sm">(optional)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                placeholder="Full name"
                value={coAuthorDraft.name}
                onChange={(e) => setCoAuthorDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={coAuthorDraft.email}
                onChange={(e) => setCoAuthorDraft((d) => ({ ...d, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Institution <span className="text-slate-400">(optional)</span></Label>
              <Input
                placeholder="University / company"
                value={coAuthorDraft.institution}
                onChange={(e) => setCoAuthorDraft((d) => ({ ...d, institution: e.target.value }))}
              />
            </div>
          </div>
          {coAuthorError && <p className="text-xs text-red-600">{coAuthorError}</p>}
          <Button type="button" variant="outline" size="sm" onClick={addCoAuthor}>
            <Plus className="h-4 w-4" /> Add Co-author
          </Button>

          {coAuthors.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
              {coAuthors.map((ca) => (
                <li key={ca.email} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium">{ca.name}</span>
                    <span className="text-slate-500 ml-2">{ca.email}</span>
                    {ca.institution && (
                      <span className="text-slate-400 ml-2">· {ca.institution}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeCoAuthor(ca.email)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={loading}>{submitLabel}</Button>
      </div>
    </form>
  );
}
