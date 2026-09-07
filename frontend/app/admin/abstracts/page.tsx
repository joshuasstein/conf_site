"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { submissions, type Submission, type SubmissionStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { StatusBadge } from "@/components/submission/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Search, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_TABS: { label: string; value: SubmissionStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Under Review", value: "under_review" },
  { label: "Decided", value: "decided" },
  { label: "Assigned", value: "assigned_to_session" },
  { label: "Notified", value: "notified" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Files In", value: "files_submitted" },
  { label: "Withdrawn", value: "withdrawn" },
];

export default function AdminAbstractsPage() {
  const { user } = useAuth();
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState<SubmissionStatus | "all">("all");

  useEffect(() => {
    submissions
      .list()
      .then(setAllSubmissions)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let list = allSubmissions;
    if (activeStatus !== "all") list = list.filter((s) => s.status === activeStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.presenting_author.full_name?.toLowerCase().includes(q) ||
          s.presenting_author.email?.toLowerCase().includes(q) ||
          s.track?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [allSubmissions, activeStatus, search]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allSubmissions.length };
    for (const s of allSubmissions) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
    }
    return counts;
  }, [allSubmissions]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Submissions</h1>
        <p className="text-sm text-slate-500 mt-1">
          {allSubmissions.length} total submission{allSubmissions.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b border-slate-200 pb-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveStatus(tab.value)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              activeStatus === tab.value
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
          >
            {tab.label}
            {tabCounts[tab.value] !== undefined && (
              <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-xs", activeStatus === tab.value ? "bg-indigo-500" : "bg-slate-200 text-slate-600")}>
                {tabCounts[tab.value] ?? 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search title, author, track..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <p>No abstracts match your filters.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                {(user?.role === "admin" || user?.role === "program_chair") && (
                  <TableHead>Submitter</TableHead>
                )}
                <TableHead>Track</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell>
                    <Link
                      href={`/admin/abstracts/${sub.id}`}
                      className="font-medium text-slate-900 hover:text-indigo-600 line-clamp-1"
                    >
                      {sub.title}
                    </Link>
                  </TableCell>
                  {(user?.role === "admin" || user?.role === "program_chair") && (
                    <TableCell className="text-sm text-slate-600">
                      {sub.presenting_author.full_name ?? sub.presenting_author_id}
                    </TableCell>
                  )}
                  <TableCell className="text-sm text-slate-600">
                    {sub.track ?? <span className="text-slate-400">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={sub.status} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {format(new Date(sub.updated_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" asChild>
                      <Link href={`/admin/abstracts/${sub.id}`}>
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
