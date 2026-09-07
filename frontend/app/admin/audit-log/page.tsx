"use client";

import { useEffect, useState } from "react";
import { admin, type AuditLog } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ScrollText } from "lucide-react";

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    admin
      .getAuditLog()
      .then(setLogs)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load audit log";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <ScrollText className="h-6 w-6 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">All admin actions and status overrides</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <ScrollText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p>No audit log entries yet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Submission</TableHead>
                <TableHead>Status Change</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                    {format(new Date(log.created_at), "MMM d, yyyy HH:mm")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {log.target_type === "submission" && log.target_id
                      ? `#${log.target_id.slice(0, 8)}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.detail.from && log.detail.to ? (
                      <div className="flex items-center gap-1.5">
                        <Badge variant="secondary">{String(log.detail.from).replace(/_/g, " ")}</Badge>
                        <span className="text-slate-400">→</span>
                        <Badge variant="info">{String(log.detail.to).replace(/_/g, " ")}</Badge>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-xs truncate">
                    {log.detail.reason
                      ? String(log.detail.reason)
                      : log.action === "broadcast_email"
                        ? `${log.detail.recipient_count ?? "?"} recipients — "${String(log.detail.subject ?? "")}"`
                        : <span className="text-slate-400">—</span>}
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
