"use client";

import { useEffect, useState } from "react";
import { submissions, admin, type Submission } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Download, UserCheck } from "lucide-react";
import { getAccessToken } from "@/lib/api";

export default function AdminPresentersPage() {
  const [confirmedSubmissions, setConfirmedSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    submissions
      .list()
      .then((all) => {
        setConfirmedSubmissions(
          all.filter((s) => s.status === "confirmed" || s.status === "files_submitted"),
        );
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleDownloadCSV = async () => {
    try {
      const token = getAccessToken();
      const res = await fetch(admin.getPresentersCSVUrl(), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "presenters.csv";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "presenters.csv saved." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="h-6 w-6 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Presenters</h1>
            <p className="text-sm text-slate-500">
              {confirmedSubmissions.length} confirmed presenter{confirmedSubmissions.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button onClick={handleDownloadCSV} variant="outline">
          <Download className="h-4 w-4" />
          Download CSV
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : confirmedSubmissions.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <UserCheck className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p>No confirmed presenters yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Presenter</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Track</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {confirmedSubmissions.map((sub) => (
                <TableRow key={sub.id}>
                  <TableCell className="font-medium text-slate-900">
                    {sub.presenting_author.full_name ?? sub.presenting_author_id}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {sub.presenting_author.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {sub.presenting_author.institution ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-slate-700 max-w-xs truncate">
                    {sub.title}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">{sub.track ?? "—"}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      sub.status === "files_submitted"
                        ? "bg-teal-100 text-teal-800"
                        : "bg-green-100 text-green-800"
                    }`}>
                      {sub.status === "files_submitted" ? "Files Submitted" : "Confirmed"}
                    </span>
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
