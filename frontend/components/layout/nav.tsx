"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  Globe,
  MailWarning,
  ClipboardList,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Nav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await auth.resendVerification();
      setResent(true);
      toast({ title: "Email sent", description: "Check your inbox for a new verification link." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/login");
    toast({ title: "Signed out", description: "You have been logged out." });
  };

  const isAdmin = user?.role === "admin" || user?.role === "program_chair" || user?.role === "reviewer";

  const navLinks = [
    {
      href: isAdmin ? "/admin" : "/abstracts/new",
      label: "Dashboard",
      icon: LayoutDashboard,
      show: !!user && user.role !== "submitter",
    },
    {
      href: "/",
      label: "My Submissions",
      icon: FileText,
      show: user?.role === "submitter",
    },
    {
      // Submitters who were granted reviewer privileges reach their reviews here.
      href: "/admin/reviews",
      label: "My Reviews",
      icon: ClipboardList,
      show: user?.role === "submitter" && !!user?.is_reviewer,
    },
    {
      href: "/program",
      label: "Program",
      icon: Globe,
      show: true,
    },
  ].filter((l) => l.show);

  const showVerificationBanner = !!user && !user.email_verified && pathname !== "/verify-email";

  return (
    <>
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href={isAdmin ? "/admin" : "/"} className="flex items-center">
            <Image
              src="/pvpmc_logo.png"
              alt="PVPMC Workshop"
              width={150}
              height={30}
              style={{ objectFit: "contain" }}
              priority
            />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "text-indigo-600"
                    : "text-slate-600 hover:text-slate-900",
                )}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-slate-600">
                  {user.full_name}{" "}
                  <span className="text-slate-400">({user.role.replace("_", " ")})</span>
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/register">Register</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900"
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2 py-2 text-sm text-slate-700 hover:text-indigo-600"
              onClick={() => setMobileOpen(false)}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 py-2 text-sm text-slate-700 hover:text-red-600 w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          ) : (
            <>
              <Link href="/login" className="block py-2 text-sm text-slate-700">
                Sign in
              </Link>
              <Link href="/register" className="block py-2 text-sm text-indigo-600 font-medium">
                Register
              </Link>
            </>
          )}
        </div>
      )}
    </nav>

    {showVerificationBanner && (
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
        <div className="mx-auto max-w-7xl flex items-center gap-3">
          <MailWarning className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            Please verify your email address. Check your inbox for a link, or{" "}
            {resent ? (
              <span className="font-medium">a new link has been sent.</span>
            ) : (
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="font-medium underline hover:no-underline disabled:opacity-50"
              >
                {resending ? "sending…" : "resend the email"}
              </button>
            )}
          </p>
          <Link href="/verify-email?pending=true" className="text-xs text-amber-700 hover:underline shrink-0">
            More info
          </Link>
        </div>
      </div>
    )}
    </>
  );
}
