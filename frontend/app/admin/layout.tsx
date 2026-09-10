"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Nav } from "@/components/layout/nav";
import { Sidebar } from "@/components/layout/sidebar";

const ALLOWED_ROLES = ["admin", "program_chair", "reviewer"];

// Reviewer-privileged users of any role (e.g. a submitter who also reviews) may
// enter the admin area to reach My Reviews.
const canEnter = (u: { role: string; is_reviewer?: boolean }) =>
  ALLOWED_ROLES.includes(u.role) || !!u.is_reviewer;

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
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 lg:p-8 min-w-0">{children}</main>
      </div>
    </div>
  );
}
