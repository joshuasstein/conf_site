"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { submissions, admin, type Submission, type ConferenceSettings } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import {
  FileText,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  Bell,
} from "lucide-react";

interface StatusCounts {
  draft: number;
  submitted: number;
  under_review: number;
  decided: number;
  assigned_to_session: number;
  notified: number;
  confirmed: number;
  files_submitted: number;
  withdrawn: number;
  total: number;
}

function countByStatus(subs: Submission[]): StatusCounts {
  const counts: StatusCounts = {
    draft: 0, submitted: 0, under_review: 0, decided: 0,
    assigned_to_session: 0, notified: 0, confirmed: 0,
    files_submitted: 0, withdrawn: 0, total: subs.length,
  };
  for (const s of subs) {
    if (s.status in counts) (counts as Record<string, number>)[s.status]++;
  }
  return counts;
}

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [allSubmissions, setAllSubmissions] = useState<Submission[]>([]);
  const [settings, setSettings] = useState<ConferenceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifying, setNotifying] = useState(false);

  useEffect(() => {
    Promise.all([
      submissions.list(),
      admin.getSettings().catch(() => null),
    ])
      .then(([subs, cfg]) => {
        setAllSubmissions(subs);
        setSettings(cfg);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load data";
        toast({ title: "Error", description: msg, variant: "destructive" });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleBulkNotify = async (dry_run: boolean) => {
    setNotifying(true);
    try {
      const result = await admin.bulkNotify(dry_run);
      toast({
        title: dry_run ? "Dry run complete" : "Notifications sent",
        description: `${result.notified} notification${result.notified !== 1 ? "s" : ""} ${dry_run ? "would be sent" : "sent"}.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setNotifying(false);
    }
  };

  const counts = countByStatus(allSubmissions);

  const statCards = [
    { label: "Total", value: counts.total, icon: FileText, color: "text-slate-600" },
    { label: "Submitted", value: counts.submitted, icon: Send, color: "text-blue-600" },
    { label: "Under Review", value: counts.under_review, icon: Clock, color: "text-yellow-600" },
    { label: "Decided", value: counts.decided, icon: CheckCircle, color: "text-purple-600" },
    { label: "Notified", value: counts.notified, icon: Bell, color: "text-orange-600" },
    { label: "Confirmed", value: counts.confirmed, icon: CheckCircle, color: "text-green-600" },
    { label: "Files Submitted", value: counts.files_submitted, icon: FileText, color: "text-teal-600" },
    { label: "Withdrawn", value: counts.withdrawn, icon: AlertCircle, color: "text-red-600" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {settings?.conference_name ?? "Conference"} — Admin Overview
        </h1>
        {settings?.location && (
          <p className="text-slate-500 mt-1 text-sm">{settings.location}</p>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((card) => (
              <Card key={card.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <card.icon className={`h-8 w-8 ${card.color}`} />
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                    <p className="text-xs text-slate-500">{card.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" asChild className="justify-start">
                  <Link href="/admin/abstracts">
                    <FileText className="h-4 w-4" />
                    View all abstracts
                  </Link>
                </Button>
                <Button variant="outline" asChild className="justify-start">
                  <Link href="/admin/sessions">
                    <Calendar className="h-4 w-4" />
                    Manage sessions
                  </Link>
                </Button>
                {user?.role === "admin" && (
                  <>
                    <Button variant="outline" asChild className="justify-start">
                      <Link href="/admin/users">
                        <Users className="h-4 w-4" />
                        Manage users
                      </Link>
                    </Button>
                    <Button variant="outline" asChild className="justify-start">
                      <Link href="/admin/settings">
                        <Calendar className="h-4 w-4" />
                        Conference settings
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {user?.role === "admin" && (
              <Card>
                <CardHeader>
                  <CardTitle>Bulk Notifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Send notification emails to all &quot;decided&quot; submissions that haven&apos;t been notified yet.
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {counts.decided} submission{counts.decided !== 1 ? "s" : ""} ready to notify
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={notifying}
                      onClick={() => handleBulkNotify(true)}
                    >
                      Dry Run
                    </Button>
                    <Button
                      size="sm"
                      loading={notifying}
                      onClick={() => handleBulkNotify(false)}
                    >
                      <Bell className="h-4 w-4" />
                      Send Notifications
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
