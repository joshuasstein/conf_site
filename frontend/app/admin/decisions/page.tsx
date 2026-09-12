"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  decisions,
  sessionApi,
  type DecisionListItem,
  type DecisionOutcomeDef,
} from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Gavel } from "lucide-react";

export default function AdminDecisionsPage() {
  const [items, setItems] = useState<DecisionListItem[]>([]);
  const [outcomes, setOutcomes] = useState<DecisionOutcomeDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      decisions.list(),
      sessionApi.conferenceInfo().then((info) => info.decision_outcomes ?? []).catch(() => []),
    ])
      .then(([list, defs]) => {
        setItems(list);
        setOutcomes(defs);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load decisions";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const outcomeFor = (key: string | null) => (key ? outcomes.find((o) => o.key === key) : undefined);
  const outcomeLabel = (key: string | null) => outcomeFor(key)?.label ?? key ?? "—";
  const outcomeClasses = (key: string | null) => {
    const o = outcomeFor(key);
    if (!o) return "bg-slate-100 text-slate-600";
    return o.is_acceptance ? "bg-green-100 text-green-800" : "bg-rose-100 text-rose-800";
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Gavel className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Decisions</h1>
          <p className="text-sm text-slate-500">
            {items.length} submission{items.length !== 1 ? "s" : ""} decided or beyond
          </p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Gavel className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p>No decisions recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Presenter</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Session</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.submission_id}>
                  <TableCell className="font-medium text-slate-900">{item.presenter_name || "—"}</TableCell>
                  <TableCell className="text-sm text-slate-700 max-w-md">
                    <Link
                      href={`/admin/abstracts/${item.submission_id}`}
                      className="hover:text-indigo-600 hover:underline"
                    >
                      {item.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${outcomeClasses(item.outcome)}`}>
                      {outcomeLabel(item.outcome)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{item.session_title ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
