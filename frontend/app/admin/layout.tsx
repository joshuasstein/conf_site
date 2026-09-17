"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Nav } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";
import { canEnterAdmin, isReadOnlyAdmin } from "@/lib/permissions";

// Staff, reviewer-privileged users (e.g. a submitter who also reviews), and
// Admin Viewers may enter the admin area.
const canEnter = canEnterAdmin;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!canEnter(user)) {
      router.replace("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user || !canEnter(user)) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Nav />
      {isReadOnlyAdmin(user) && (
        <div className="bg-sky-50 border-b border-sky-200 px-4 py-2">
          <div className="mx-auto max-w-7xl flex items-center gap-2 text-sm text-sky-800">
            <Eye className="h-4 w-4 shrink-0" />
            <span>
              <strong>Admin Viewer</strong> — you can see everything here, but actions outside your
              own role are disabled.
            </span>
          </div>
        </div>
      )}
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}
